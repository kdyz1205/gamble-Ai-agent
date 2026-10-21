/** Real local PostgreSQL crash-boundary, idempotency and transaction rollback checks. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { reserveJudgmentFee, refundJudgmentFee, reconcileJudgmentFees } from "../src/lib/judgment-fees";
import { withJudgmentExecutionLock } from "../src/lib/judgment-execution-lock";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";
import { recordVerdictDecision, VerdictDecision } from "../src/lib/verdict-review";
import { spendForInference } from "../src/lib/credits";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/summoner_verification",
    "Crash verification is limited to the isolated local summoner_verification database");
  const runId = randomUUID().replaceAll("-", "");
  const creator = await prisma.user.create({ data: { username: `crash_${runId}_a`, email: `crash_${runId}_a@example.invalid`, credits: 200 } });
  const opponent = await prisma.user.create({ data: { username: `crash_${runId}_b`, email: `crash_${runId}_b@example.invalid`, credits: 200 } });
  const makeQuest = (label: string) => prisma.challenge.create({ data: {
    title: `Crash recovery verification ${label} ${runId}`, creatorId: creator.id, type: "General", status: "judging", stake: 5,
    participants: { create: [
      { userId: creator.id, role: "creator", status: "accepted" },
      { userId: opponent.id, role: "opponent", status: "accepted" },
    ] },
  } });
  const credits = async () => (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).credits;
  let passed = 0;
  const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
  const interrupted = await makeQuest("interrupted");
  const oldAttempt = randomUUID();
  await prisma.auditLog.create({ data: { id: oldAttempt, action: "judgment.execution.claim", challengeId: interrupted.id } });
  const legacy = await spendForInference(creator.id, 1, "judge", "Unmarked historical fee must remain untouched", interrupted.id);
  assert(legacy.success);
  const firstFees = await Promise.all([
    reserveJudgmentFee(creator.id, 1, interrupted.id, oldAttempt),
    reserveJudgmentFee(creator.id, 1, interrupted.id, oldAttempt),
  ]);
  assert(firstFees.every((result) => result.success));
  assert.equal(await credits(), 198);
  const duplicates = await Promise.all([
    reserveJudgmentFee(creator.id, 1, interrupted.id, oldAttempt),
    reserveJudgmentFee(creator.id, 1, interrupted.id, oldAttempt),
  ]);
  assert(duplicates.every((result) => result.success));
  assert.equal(await credits(), 198);
  assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `judge-fee:${interrupted.id}:${oldAttempt}` } }), 1);
  pass("committed fee and repeated reservation debit exactly once");

  assert.equal(await withJudgmentExecutionLock(interrupted.id, async () => "should not execute"), null);
  pass("unexpired crashed claim prevents another execution");
  // Modify only this run's simulated abandoned claim to cross the six-minute recovery boundary.
  await prisma.auditLog.update({ where: { id: oldAttempt }, data: { createdAt: new Date(Date.now() - 7 * 60_000) } });
  let retryAttempt = "";
  const recovered = await withJudgmentExecutionLock(interrupted.id, async (attemptId) => {
    retryAttempt = attemptId;
    const restored = await reconcileJudgmentFees(interrupted.id);
    assert.deepEqual(restored, { refundedCount: 1, refundedCredits: 1 });
    assert.equal(await credits(), 199, "only marked abandoned fee is refunded");
    const charged = await reserveJudgmentFee(creator.id, 1, interrupted.id, attemptId);
    assert(charged.success);
    return restored;
  });
  assert.deepEqual(recovered, { refundedCount: 1, refundedCredits: 1 });
  assert.equal(await credits(), 198, "retry is charged once after prior abandoned charge is compensated");
  const staleReuse = await reserveJudgmentFee(creator.id, 1, interrupted.id, oldAttempt);
  assert.equal(staleReuse.success, false, "refunded execution identifiers cannot obtain free inference");
  pass("expired execution recovers its fee before retry and preserves unmarked historical fees");

  const refunded = await Promise.all([
    refundJudgmentFee(creator.id, interrupted.id, retryAttempt, "Retry interrupted"),
    refundJudgmentFee(creator.id, interrupted.id, retryAttempt, "Concurrent compensation retry"),
  ]);
  assert(refunded.every((result) => result.success));
  assert.equal(await credits(), 199);
  assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `refund:judge-fee:${interrupted.id}:${retryAttempt}` } }), 1);
  const reconciliations = await withJudgmentExecutionLock(interrupted.id, async () => [
    await reconcileJudgmentFees(interrupted.id), await reconcileJudgmentFees(interrupted.id),
  ]);
  assert.deepEqual(reconciliations, [{ refundedCount: 0, refundedCredits: 0 }, { refundedCount: 0, refundedCredits: 0 }]);
  assert.equal(await credits(), 199);
  pass("concurrent refunds and repeated crash reconciliation never add credits twice");

  const beforeInvalid = await credits();
  await assert.rejects(reserveJudgmentFee(creator.id, 1, `absent_${runId}`, randomUUID()));
  assert.equal(await credits(), beforeInvalid);
  pass("fee ledger foreign-key failure rolls back the preceding balance debit");

  const rollback = await makeQuest("refund-rollback");
  const rollbackAttempt = randomUUID();
  await reserveJudgmentFee(creator.id, 1, rollback.id, rollbackAttempt);
  const beforeRefund = await credits();
  const functionName = `verify_refund_${runId}`;
  const triggerName = `verify_refund_trigger_${runId}`;
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled refund ledger failure'; END $$`);
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "CreditTx" FOR EACH ROW WHEN (NEW."challengeId" = '${rollback.id}' AND NEW.type = 'refund') EXECUTE FUNCTION "${functionName}"()`);
    try {
      await assert.rejects(refundJudgmentFee(creator.id, rollback.id, rollbackAttempt, "Controlled failure"));
      assert.equal(await credits(), beforeRefund, "refund credit increment must roll back when ledger insert fails");
      assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `refund:judge-fee:${rollback.id}:${rollbackAttempt}` } }), 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "CreditTx"`);
    }
  } finally {
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  }
  assert((await refundJudgmentFee(creator.id, rollback.id, rollbackAttempt, "Recovered after temporary ledger failure")).success);
  assert.equal(await credits(), beforeRefund + 1);
  pass("refund ledger failure rolls back balance increment; subsequent retry credits exactly once");

  const recommendationRollback = await makeQuest("recommendation-rollback");
  await prisma.challenge.update({ where: { id: recommendationRollback.id }, data: { deadline: new Date(Date.now() - 60_000) } });
  const persistFunction = `verify_persist_${runId}`;
  const persistTrigger = `verify_persist_trigger_${runId}`;
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${persistFunction}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled recommendation activity failure'; END $$`);
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${persistTrigger}" BEFORE INSERT ON "ActivityEvent" FOR EACH ROW WHEN (NEW."challengeId" = '${recommendationRollback.id}') EXECUTE FUNCTION "${persistFunction}"()`);
    try {
      const failed = await executeChallengeJudgment(recommendationRollback.id, 1);
      assert(!failed.ok && "status" in failed && failed.status === 503, JSON.stringify(failed));
      assert.equal(await prisma.judgment.count({ where: { challengeId: recommendationRollback.id } }), 0);
      assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: recommendationRollback.id } })).status, "judging");
      assert.equal(await prisma.reviewCase.count({ where: { challengeId: recommendationRollback.id } }), 0);
      assert.equal(await prisma.activityEvent.count({ where: { challengeId: recommendationRollback.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { challengeId: recommendationRollback.id, action: "judgment.completed" } }), 0);
      assert.equal(await prisma.creditTx.count({ where: { challengeId: recommendationRollback.id } }), 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${persistTrigger}" ON "ActivityEvent"`);
    }
  } finally {
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${persistFunction}"()`);
  }
  const persistenceRetry = await executeChallengeJudgment(recommendationRollback.id, 1);
  assert(persistenceRetry.ok, JSON.stringify(persistenceRetry));
  assert.equal(await prisma.judgment.count({ where: { challengeId: recommendationRollback.id } }), 1);
  assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: recommendationRollback.id } })).status, "disputed");
  assert.equal(await prisma.auditLog.count({ where: { challengeId: recommendationRollback.id, action: "judgment.completed" } }), 1);
  assert.equal(await prisma.activityEvent.count({ where: { challengeId: recommendationRollback.id } }), 1);
  pass("last recommendation write failure atomically rolls back judgment, state and audit; retry persists once");

  const completed = await makeQuest("completed-boundary");
  const completedAttempt = randomUUID();
  await reserveJudgmentFee(creator.id, 1, completed.id, completedAttempt);
  const completedBalance = await credits();
  await prisma.judgment.create({ data: {
    challengeId: completed.id, method: "ai", status: "completed", confidence: 0.5,
    reasoning: "Historical crash fixture: recommendation persisted before challenge state", winnerId: creator.id,
  } });
  const reconciliation = await withJudgmentExecutionLock(completed.id, () => reconcileJudgmentFees(completed.id));
  assert.deepEqual(reconciliation, { refundedCount: 0, refundedCredits: 0 });
  assert.equal(await credits(), completedBalance);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${persistFunction}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled recommendation repair failure'; END $$`);
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${persistTrigger}" BEFORE INSERT ON "ActivityEvent" FOR EACH ROW WHEN (NEW."challengeId" = '${completed.id}') EXECUTE FUNCTION "${persistFunction}"()`);
    try {
      await assert.rejects(executeChallengeJudgment(completed.id, 1));
      assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: completed.id } })).status, "judging");
      assert.equal(await prisma.reviewCase.count({ where: { challengeId: completed.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { challengeId: completed.id, action: { in: ["judgment.completed", "review.requested"] } } }), 0);
      assert.equal(await prisma.activityEvent.count({ where: { challengeId: completed.id } }), 0);
      assert.equal(await credits(), completedBalance);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${persistTrigger}" ON "ActivityEvent"`);
    }
  } finally {
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${persistFunction}"()`);
  }
  pass("failed low-confidence repair rolls back automatic review, state, completion audit and activity together");
  const repaired = await executeChallengeJudgment(completed.id, 1);
  assert(!repaired.ok && "skipped" in repaired && repaired.reason === "already_judged");
  assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: completed.id } })).status, "disputed");
  assert.equal(await prisma.judgment.count({ where: { challengeId: completed.id } }), 1);
  assert.equal(await prisma.reviewCase.count({ where: { challengeId: completed.id, status: "pending" } }), 1);
  assert.equal(await credits(), completedBalance);
  const accepted = await recordVerdictDecision({ challengeId: completed.id, userId: creator.id, decision: VerdictDecision.accepted });
  assert.equal(accepted.settled, false);
  assert.deepEqual(accepted.waitingForUserIds, [opponent.id]);
  pass("persisted completed judgment retains fee, repairs state and accepts participant consent without inference");

  console.log(JSON.stringify({ runId, passed, creatorId: creator.id,
    fixtures: [interrupted.id, rollback.id, recommendationRollback.id, completed.id], retained: true, providerCalls: 0, finalCredits: await credits() }));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
