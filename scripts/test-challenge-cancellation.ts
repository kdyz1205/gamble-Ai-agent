import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { createChallengeForUser } from "../src/lib/challenge-creation";
import { acceptChallengeAtomic } from "../src/lib/challenge-acceptance";
import { cancelChallengeAtomic } from "../src/lib/challenge-cancellation";
import { reserveJudgmentFee, refundJudgmentFee } from "../src/lib/judgment-fees";

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification");
  const run = randomUUID().replaceAll("-", ""); const users: string[] = []; const quests: string[] = [];
  const fn = `cancel_fault_${run}`, trigger = `cancel_trigger_${run}`;
  async function player(label: string) {
    const user = await prisma.user.create({ data: { email: `${label}-${run}@example.invalid`, username: `${label}_${run}`, credits: 200 } });
    users.push(user.id); return user;
  }
  async function fixture(label: string, stake = 5) {
    const a = await player(`${label}_a`); const b = await player(`${label}_b`);
    const quest = await createChallengeForUser({ userId: a.id, username: a.username }, { title: `Cancellation QA ${label}`, stake, deadline: "24 hours" });
    quests.push(quest.id); return { id: quest.id, a: a.id, b: b.id };
  }
  const balance = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;
  async function unchanged(f: Awaited<ReturnType<typeof fixture>>, status: string, credits = 195) {
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: f.id } })).status, status);
    assert.equal(await balance(f.a), credits);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: f.id, type: "refund" } }), 0);
  }
  try {
    const concurrent = await fixture("concurrent");
    await prisma.evidence.create({ data: { challengeId: concurrent.id, userId: concurrent.a, type: "text", description: "Preserve this proof on cancellation" } });
    const beforeAudits = await prisma.auditLog.count({ where: { challengeId: concurrent.id } });
    const results = await Promise.all(Array.from({ length: 8 }, () => cancelChallengeAtomic(concurrent.id, concurrent.a)));
    assert(results.every((result) => result.ok && result.status === "cancelled" && result.retained));
    assert.equal(results.reduce((sum, result) => sum + (result.ok ? result.refundedStake : 0), 0), 5);
    assert.equal(await balance(concurrent.a), 200);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: concurrent.id, type: "refund" } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: concurrent.id } }), beforeAudits + 1);
    assert.equal(await prisma.evidence.count({ where: { challengeId: concurrent.id } }), 1);
    assert.equal(await prisma.participant.count({ where: { challengeId: concurrent.id } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: concurrent.id, type: "stake" } }), 1);
    console.log("PASS eight cancellation retries return one actual stake once and retain quest, participant, proof, audit and ledger history");

    const accepted = await fixture("accepted-first"); assert((await acceptChallengeAtomic(accepted.id, accepted.b)).ok);
    assert.equal((await cancelChallengeAtomic(accepted.id, accepted.a)).ok, false); await unchanged(accepted, "live");
    const cancelled = await fixture("cancelled-first"); assert((await cancelChallengeAtomic(cancelled.id, cancelled.a)).ok);
    assert.equal((await acceptChallengeAtomic(cancelled.id, cancelled.b)).ok, false); assert.equal(await balance(cancelled.b), 200);
    for (let i = 0; i < 5; i++) {
      const f = await fixture(`race${i}`);
      const [cancel, accept] = await Promise.all([cancelChallengeAtomic(f.id, f.a), acceptChallengeAtomic(f.id, f.b)]);
      assert.notEqual(cancel.ok, accept.ok);
      const status = (await prisma.challenge.findUniqueOrThrow({ where: { id: f.id } })).status;
      assert.equal(status, cancel.ok ? "cancelled" : "live");
      assert.equal(await balance(f.a), cancel.ok ? 200 : 195); assert.equal(await balance(f.b), cancel.ok ? 200 : 195);
    }
    console.log("PASS acceptance-versus-cancellation shares one lock; both orderings and five races preserve seats and both balances");

    for (const table of ["CreditTx", "AuditLog"] as const) {
      const f = await fixture(`fault${table}`);
      const condition = table === "CreditTx" ? `NEW.type = 'refund'` : `NEW.action = 'challenge.cancelled'`;
      await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected cancellation failure'; END; $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "${table}" FOR EACH ROW WHEN (NEW."challengeId" = '${f.id}' AND ${condition}) EXECUTE FUNCTION "${fn}"()`);
      try { await assert.rejects(() => cancelChallengeAtomic(f.id, f.a), /Injected cancellation failure/); }
      finally { await prisma.$executeRawUnsafe(`DROP TRIGGER "${trigger}" ON "${table}"`); }
      await unchanged(f, "open"); assert((await cancelChallengeAtomic(f.id, f.a)).ok); assert.equal(await balance(f.a), 200);
    }
    console.log("PASS injected refund-ledger and final-audit failures roll back balance, cancellation and all new rows; retry returns the stake once");

    const legacy = await fixture("legacy-refunded");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: legacy.a }, data: { credits: { increment: 5 } } });
      await tx.creditTx.create({ data: { userId: legacy.a, challengeId: legacy.id, type: "refund", amount: 5, balanceAfter: 200, description: "Challenge voided — credits refunded" } });
      await tx.challenge.update({ where: { id: legacy.id }, data: { status: "cancelled" } });
    });
    const reused = await cancelChallengeAtomic(legacy.id, legacy.a); assert(reused.ok && reused.reused && reused.refundedStake === 0); assert.equal(await balance(legacy.a), 200);
    const partial = await fixture("actual-ledger");
    await prisma.challenge.update({ where: { id: partial.id }, data: { stake: 99 } });
    const actual = await cancelChallengeAtomic(partial.id, partial.a); assert(actual.ok && actual.refundedStake === 5); assert.equal(await balance(partial.a), 200);
    const partlyReturned = await fixture("partly-returned");
    await prisma.$transaction([
      prisma.user.update({ where: { id: partlyReturned.a }, data: { credits: { increment: 2 } } }),
      prisma.creditTx.create({ data: { userId: partlyReturned.a, challengeId: partlyReturned.id, type: "refund", amount: 2, balanceAfter: 197, description: "Challenge voided — credits refunded" } }),
    ]);
    const remainder = await cancelChallengeAtomic(partlyReturned.id, partlyReturned.a); assert(remainder.ok && remainder.refundedStake === 3); assert.equal(await balance(partlyReturned.a), 200);
    const feeRefund = await fixture("inference-refund");
    assert((await reserveJudgmentFee(feeRefund.a, 1, feeRefund.id, run)).success);
    assert((await refundJudgmentFee(feeRefund.a, feeRefund.id, run, "Recovered inference fee, not stake")).success);
    const feeSafe = await cancelChallengeAtomic(feeRefund.id, feeRefund.a);
    assert(feeSafe.ok && feeSafe.refundedStake === 5); assert.equal(await balance(feeRefund.a), 200);
    const ambiguousRefund = await fixture("ambiguous-linked-refund");
    await prisma.creditTx.create({ data: { userId: ambiguousRefund.a, challengeId: ambiguousRefund.id, type: "refund", amount: 1, balanceAfter: 195, description: "Unknown historical refund" } });
    const ambiguousLinked = await cancelChallengeAtomic(ambiguousRefund.id, ambiguousRefund.a); assert(!ambiguousLinked.ok && ambiguousLinked.status === 409); assert.equal(await balance(ambiguousRefund.a), 195);
    console.log("PASS actual inference-fee compensation never reduces the five-credit stake refund; ambiguous linked refunds require reconciliation");
    const missing = await fixture("missing-ledger", 0);
    await prisma.challenge.update({ where: { id: missing.id }, data: { stake: 5 } });
    const denied = await cancelChallengeAtomic(missing.id, missing.a); assert(!denied.ok && denied.status === 409); await unchanged(missing, "open", 200);
    await prisma.challenge.update({ where: { id: missing.id }, data: { status: "draft" } });
    const draft = await cancelChallengeAtomic(missing.id, missing.a); assert(draft.ok && draft.refundedStake === 0);
    const unlinked = await fixture("unlinked-refund");
    const title = (await prisma.challenge.findUniqueOrThrow({ where: { id: unlinked.id } })).title;
    await prisma.creditTx.create({ data: { userId: unlinked.a, type: "refund", amount: 5, balanceAfter: 195, description: `Refund — deleted market "${title.slice(0, 40)}"` } });
    const ambiguous = await cancelChallengeAtomic(unlinked.id, unlinked.a); assert(!ambiguous.ok && ambiguous.status === 409); await unchanged(unlinked, "open");
    const stranger = await cancelChallengeAtomic(missing.id, missing.b); assert(!stranger.ok && stranger.status === 403);
    const absent = await cancelChallengeAtomic(`missing-${run}`, missing.a); assert(!absent.ok && absent.status === 404);
    const terminal = await fixture("terminal-states");
    for (const status of ["live", "judging", "disputed", "pending_settlement", "settled"]) {
      await prisma.challenge.update({ where: { id: terminal.id }, data: { status } });
      const result = await cancelChallengeAtomic(terminal.id, terminal.a); assert(!result.ok && result.status === 409); await unchanged(terminal, status);
    }
    console.log("PASS legacy refunds never repeat, actual recorded debit outranks display stake, missing/ambiguous stake requires reconciliation, uncharged draft cancels, and strangers are forbidden");
  } finally {
    for (const table of ["CreditTx", "AuditLog"]) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    await prisma.auditLog.deleteMany({ where: { challengeId: { in: quests } } });
    await prisma.activityEvent.deleteMany({ where: { challengeId: { in: quests } } });
    await prisma.creditTx.deleteMany({ where: { userId: { in: users } } });
    await prisma.judgment.deleteMany({ where: { challengeId: { in: quests } } });
    await prisma.challenge.deleteMany({ where: { id: { in: quests } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
