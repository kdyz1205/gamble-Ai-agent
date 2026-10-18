/** Real isolated PostgreSQL interruption boundaries. No model or external settlement is called. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { createChallengeForUser } from "../src/lib/challenge-creation";
import { acceptChallengeAtomic } from "../src/lib/challenge-acceptance";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";
import { settleChallenge } from "../src/lib/credits";
import { expireOverdueReviewCases, listReviewQueue, recordVerdictDecision, resolveReviewCase, VerdictDecision, REVIEW_PROCESSING_TIMEOUT_MS } from "../src/lib/verdict-review";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert(["localhost", "127.0.0.1"].includes(db.hostname) && db.pathname === "/summoner_verification", "Only the isolated local verification database is allowed");
  const oldAI = process.env.AI_ENABLED; const oldKey = process.env.SERVER_PRIVATE_KEY;
  process.env.AI_ENABLED = "false"; delete process.env.SERVER_PRIVATE_KEY;
  const run = randomUUID().replaceAll("-", "");
  const users: string[] = []; const challenges: string[] = [];
  const fnName = `review_crash_${run}`; const triggerName = `review_trigger_${run}`;
  async function player(label: string, isReviewer = false) {
    const user = await prisma.user.create({ data: { email: `${label}-${run}@example.invalid`, username: `${label}_${run}`, credits: 200, isReviewer } });
    users.push(user.id); return user;
  }
  const moderator = await player("moderator", true);
  const replacementModerator = await player("replacement", true);
  async function fixture(label: string) {
    const a = await player(`${label}_a`); const b = await player(`${label}_b`);
    const quest = await createChallengeForUser({ userId: a.id, username: a.username }, {
      title: `Review recovery ${label}`, stake: 5, evidenceType: "text", deadline: "24 hours", isPublic: false,
      rules: "Both participants submit attributable completion proof. Missing proof after the deadline forfeits the quest.",
    });
    challenges.push(quest.id);
    const accepted = await acceptChallengeAtomic(quest.id, b.id); assert(accepted.ok);
    await prisma.evidence.create({ data: { challengeId: quest.id, userId: a.id, type: "text", description: "Attributable completion proof fixture for participant A." } });
    // Only the deadline precondition is injected; the rules judgment is produced
    // by the actual production path, not a fabricated AI/provider response.
    await prisma.challenge.update({ where: { id: quest.id }, data: { deadline: new Date(Date.now() - 60_000) } });
    const judged = await executeChallengeJudgment(quest.id, 1, { allowLive: true }); assert(judged.ok);
    assert.equal(judged.judgment.method, "rules"); assert.equal(judged.judgment.winnerId, a.id);
    await recordVerdictDecision({ challengeId: quest.id, userId: b.id, decision: VerdictDecision.reviewRequested, reason: "Please review the recorded completion and deadline evidence." });
    const review = await prisma.reviewCase.findUniqueOrThrow({ where: { challengeId: quest.id } });
    return { id: quest.id, a: a.id, b: b.id, reviewId: review.id, originalId: judged.judgment.id };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const balances = async (f: Fixture) => (await prisma.user.findMany({ where: { id: { in: [f.a, f.b] } }, select: { id: true, credits: true }, orderBy: { id: "asc" } }));
  const manual = (f: Fixture, resolution: "uphold" | "override" | "refund" = "override", winnerId = f.b, reviewerUserId = moderator.id) => resolveReviewCase({ reviewId: f.reviewId, reviewerUserId, resolution, winnerId, notes: "Moderator verified the completion record and issued this final decision." });
  async function age(f: Fixture) {
    await prisma.reviewCase.update({ where: { id: f.reviewId }, data: { updatedAt: new Date(Date.now() - REVIEW_PROCESSING_TIMEOUT_MS - 60_000) } });
  }
  async function trigger(table: "CreditTx" | "Challenge" | "ReviewCase", f: Fixture, condition: string) {
    assert.match(f.id, /^[a-z0-9_]+$/i);
    const idColumn = table === "Challenge" ? "id" : "challengeId";
    const event = table === "CreditTx" ? "INSERT" : "UPDATE";
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${fnName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected review crash boundary'; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE ${event} ON "${table}" FOR EACH ROW WHEN (NEW."${idColumn}" = '${f.id}' AND ${condition}) EXECUTE FUNCTION "${fnName}"()`);
    return () => prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "${table}"`);
  }
  async function verifiedOverride(f: Fixture) {
    const review = await prisma.reviewCase.findUniqueOrThrow({ where: { id: f.reviewId } });
    assert.equal(review.status, "resolved"); assert.equal(review.resolution, "override"); assert.equal(review.resolvedWinnerId, f.b); assert.equal(review.reviewerUserId, moderator.id);
    const final = await prisma.judgment.findUniqueOrThrow({ where: { id: review.finalJudgmentId! } });
    assert.equal(final.status, "completed"); assert.equal(final.winnerId, f.b); assert.equal(final.judgeId, moderator.id);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.a } })).credits, 195);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.b } })).credits, 205);
    assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `settlement:${f.id}` } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: f.id, type: "win" } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: f.id, type: "loss" } }), 1);
    assert.equal(await prisma.judgment.count({ where: { challengeId: f.id, method: "manual" } }), 1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { challengeId: f.id, action: "review.resolved" } });
    assert.equal(audit.actorUserId, moderator.id); assert.equal(JSON.parse(audit.payload!).winnerId, f.b);
  }
  try {
    for (const boundary of ["before-ledger", "after-ledger", "after-challenge"] as const) {
      const f = await fixture(boundary);
      const remove = boundary === "before-ledger"
        ? await trigger("CreditTx", f, `NEW.type IN ('win','loss')`)
        : boundary === "after-ledger" ? await trigger("Challenge", f, `NEW.status = 'settled'`)
          : await trigger("ReviewCase", f, `NEW.status = 'resolved'`);
      try {
        if (boundary === "before-ledger") assert.equal((await manual(f)).resolved, false);
        else await assert.rejects(() => manual(f), /Injected review crash boundary/);
      } finally { await remove(); }
      const interrupted = await prisma.reviewCase.findUniqueOrThrow({ where: { id: f.reviewId } });
      assert.equal(interrupted.status, "processing"); assert.equal(interrupted.resolvedWinnerId, f.b);
      assert((await listReviewQueue()).some((item) => item.id === f.reviewId), "processing work remains in the default moderator queue");
      const afterCrash = await balances(f);
      if (boundary === "before-ledger") assert(afterCrash.every((row) => row.credits === 195));
      else assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.b } })).credits, 205);
      // The review SLA has not expired. Recovery must resume its explicit override,
      // never convert an interrupted moderator decision into an expiry refund.
      assert(interrupted.expiresAt.getTime() > Date.now());
      await age(f);
      const recovered = (await expireOverdueReviewCases(100)).find((item) => item.reviewId === f.reviewId);
      assert.equal(recovered?.ok, true, recovered?.error);
      await verifiedOverride(f);
      const finished = await balances(f);
      const retry = await manual(f); assert.equal(retry.resolved, true);
      assert.deepEqual(await balances(f), finished);
      if (boundary !== "before-ledger") assert.deepEqual(finished, afterCrash, "after-ledger recovery cannot move funds twice");
      console.log(`PASS ${boundary} interruption resumes the saved override once, preserves the original actor and produces one settlement receipt`);
    }

    const conflicting = await fixture("conflicting-retry");
    const remove = await trigger("CreditTx", conflicting, `NEW.type IN ('win','loss')`);
    try { assert.equal((await manual(conflicting)).resolved, false); } finally { await remove(); }
    const beforeWrongRetry = await balances(conflicting);
    await assert.rejects(() => manual(conflicting, "refund"), /different or incomplete review resolution/);
    assert.deepEqual(await balances(conflicting), beforeWrongRetry);
    const fresh = await expireOverdueReviewCases(100);
    assert(!fresh.some((item) => item.reviewId === conflicting.reviewId), "fresh processing is not swept while a worker may still be running");
    const simultaneous = await Promise.allSettled(Array.from({ length: 6 }, () => manual(conflicting, "override", conflicting.b, replacementModerator.id)));
    assert(simultaneous.some((result) => result.status === "fulfilled" && result.value.resolved));
    await verifiedOverride(conflicting);
    console.log("PASS a different resolution is rejected, fresh work is not swept, and six concurrent retries preserve one judgment/payout and the deciding moderator");

    const unknown = await fixture("unknown-intent");
    await prisma.reviewCase.update({ where: { id: unknown.reviewId }, data: { status: "processing", resolution: null, finalJudgmentId: null } });
    await age(unknown); const unknownBefore = await balances(unknown);
    const unknownResult = (await expireOverdueReviewCases(100)).find((item) => item.reviewId === unknown.reviewId);
    assert.equal(unknownResult?.ok, false); assert.match(unknownResult?.error ?? "", /decision is missing/);
    assert.deepEqual(await balances(unknown), unknownBefore);
    assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `settlement:${unknown.id}` } }), 0);
    assert((await listReviewQueue()).some((item) => item.id === unknown.reviewId));
    console.log("PASS incomplete processing intent remains visible for reconciliation and cannot trigger an invented refund or winner");

    const mismatch = await fixture("settlement-mismatch");
    assert((await settleChallenge(mismatch.id, mismatch.a, 5, [{ userId: mismatch.a }, { userId: mismatch.b }])).success);
    const committed = await balances(mismatch);
    await assert.rejects(() => manual(mismatch), /Committed settlement does not match/);
    await age(mismatch);
    const mismatchResult = (await expireOverdueReviewCases(100)).find((item) => item.reviewId === mismatch.reviewId);
    assert.equal(mismatchResult?.ok, false); assert.match(mismatchResult?.error ?? "", /Committed settlement does not match/);
    assert.deepEqual(await balances(mismatch), committed);
    console.log("PASS a conflicting committed settlement is surfaced without changing the winner or issuing a second payout/refund");

    const expired = await fixture("pending-expiry");
    await prisma.reviewCase.update({ where: { id: expired.reviewId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await expireOverdueReviewCases(100)).find((item) => item.reviewId === expired.reviewId)?.ok, true);
    assert.equal((await prisma.reviewCase.findUniqueOrThrow({ where: { id: expired.reviewId } })).status, "expired");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: expired.a } })).credits, 200);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: expired.b } })).credits, 200);
    assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `settlement:${expired.id}` } }), 1);
    console.log("PASS unchanged pending-review SLA expiry refunds each actual stake exactly once through the existing settlement path");
    assert.equal(await prisma.auditLog.count({ where: { challengeId: { in: challenges }, action: "ai.call.reserved" } }), 0);
    console.log(JSON.stringify({ run, crashBoundaries: 3, concurrentRetries: 6, paidAiCalls: 0, source: "real local PostgreSQL" }));
  } finally {
    for (const table of ["CreditTx", "Challenge", "ReviewCase"]) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fnName}"()`);
    await prisma.auditLog.deleteMany({ where: { OR: [{ challengeId: { in: challenges } }, { actorUserId: { in: users } }] } });
    await prisma.activityEvent.deleteMany({ where: { challengeId: { in: challenges } } });
    await prisma.creditTx.deleteMany({ where: { userId: { in: users } } });
    await prisma.judgeJob.deleteMany({ where: { challengeId: { in: challenges } } });
    await prisma.reviewCase.deleteMany({ where: { challengeId: { in: challenges } } });
    await prisma.verdictResponse.deleteMany({ where: { challengeId: { in: challenges } } });
    await prisma.judgment.deleteMany({ where: { challengeId: { in: challenges } } });
    await prisma.challenge.deleteMany({ where: { id: { in: challenges } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (oldAI === undefined) delete process.env.AI_ENABLED; else process.env.AI_ENABLED = oldAI;
    if (oldKey === undefined) delete process.env.SERVER_PRIVATE_KEY; else process.env.SERVER_PRIVATE_KEY = oldKey;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
