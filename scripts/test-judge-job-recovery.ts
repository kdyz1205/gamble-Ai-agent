import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { getOrCreateJudgeJob, runJudgeJob, sweepStuckJudgeJobs } from "../src/lib/judge-async";

// Real DB integration. Creates only isolated zero-stake fixtures and never invokes
// a model or the credits ledger. DATABASE_URL may target a disposable DB or Neon.
async function main() {
  const suffix = randomUUID().replaceAll("-", "");
  const user = await prisma.user.create({ data: {
    email: `judge-recovery-${suffix}@example.invalid`, username: `recovery_${suffix}`,
  } });
  let opponentId: string | undefined;
  try {
    const challenge = await prisma.challenge.create({ data: {
      creatorId: user.id, title: "Recovery integration fixture", description: "No AI or credits used",
      type: "General", status: "cancelled", stake: 0,
    } });
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => getOrCreateJudgeJob({
      challengeId: challenge.id, requestedByUserId: user.id, tierId: 1,
      providerId: null, model: null, webhookUrl: null,
    })));
    assert.equal(new Set(concurrent.map(({ job }) => job.id)).size, 1);
    assert.equal(concurrent.filter(({ reused }) => !reused).length, 1);
    assert.equal(await prisma.judgeJob.count({ where: { challengeId: challenge.id } }), 1);
    await prisma.judgeJob.update({ where: { id: concurrent[0].job.id }, data: { status: "failed" } });
    const retried = await getOrCreateJudgeJob({
      challengeId: challenge.id, requestedByUserId: user.id, tierId: 1,
      providerId: null, model: null, webhookUrl: null,
    });
    assert.notEqual(retried.job.id, concurrent[0].job.id);
    assert.equal(retried.reused, false);
    await prisma.judgeJob.update({ where: { id: retried.job.id }, data: { status: "failed" } });
    console.log("PASS five simultaneous intake requests reuse one job; failed work can create a new job");

    const old = new Date(Date.now() - 7 * 60 * 1000);
    const makeJob = (data: { status: string; startedAt?: Date | null; createdAt?: Date }) =>
      prisma.judgeJob.create({ data: {
        challengeId: challenge.id, requestedByUserId: user.id, ...data,
      } });
    const pending = await makeJob({ status: "pending", createdAt: old });
    const processing = await makeJob({ status: "processing", startedAt: old });
    const fresh = await makeJob({ status: "processing", startedAt: new Date() });
    const completed = await makeJob({ status: "completed", startedAt: old });
    const otherPending = await makeJob({ status: "pending", createdAt: old });

    assert.equal((await sweepStuckJudgeJobs(pending.id)).swept, 1);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: pending.id } })).status, "failed");
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: otherPending.id } })).status, "pending");
    console.log("PASS abandoned pending work fails; targeted recovery leaves other jobs untouched");

    assert.equal((await sweepStuckJudgeJobs(processing.id)).swept, 1);
    assert.equal((await sweepStuckJudgeJobs(processing.id)).swept, 0);
    console.log("PASS crashed processing work fails once; repeated recovery is idempotent");

    assert.equal((await sweepStuckJudgeJobs(fresh.id)).swept, 0);
    assert.equal((await sweepStuckJudgeJobs(completed.id)).swept, 0);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: completed.id } })).status, "completed");
    console.log("PASS active and completed jobs remain unchanged");

    const invalid = await makeJob({ status: "pending" });
    await Promise.all([runJudgeJob(invalid.id), runJudgeJob(invalid.id)]);
    const invalidResult = await prisma.judgeJob.findUniqueOrThrow({ where: { id: invalid.id } });
    assert.equal(invalidResult.status, "failed");
    assert.match(invalidResult.error ?? "", /not in judging state/i);
    await runJudgeJob(invalid.id);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: invalid.id } })).updatedAt.toISOString(), invalidResult.updatedAt.toISOString());
    console.log("PASS concurrent runners claim once; invalid-state failure is terminal without inference");

    const opponent = await prisma.user.create({ data: {
      email: `judge-opponent-${suffix}@example.invalid`, username: `opponent_${suffix}`,
    } });
    opponentId = opponent.id;
    const ready = await prisma.challenge.create({ data: {
      creatorId: user.id, title: "Expired zero-stake recovery fixture", description: "No evidence; deterministic void recommendation",
      type: "General", status: "judging", stake: 0, deadline: old,
      participants: { create: [
        { userId: user.id, role: "creator", status: "accepted" },
        { userId: opponent.id, role: "opponent", status: "accepted" },
      ] },
    } });
    const successfulJob = await prisma.judgeJob.create({ data: {
      challengeId: ready.id, requestedByUserId: user.id, status: "pending",
    } });
    await runJudgeJob(successfulJob.id);
    const finished = await prisma.judgeJob.findUniqueOrThrow({ where: { id: successfulJob.id } });
    const snapshot = JSON.parse(finished.resultJson ?? "null");
    assert.equal(finished.status, "completed");
    assert.equal(snapshot.challenge.status, "disputed");
    assert.equal(snapshot.settlement.success, false);
    assert.equal(snapshot.creditsUsed, 0);
    const persisted = await prisma.challenge.findUniqueOrThrow({ where: { id: ready.id }, include: { judgments: true } });
    assert.equal(persisted.status, snapshot.challenge.status);
    assert.equal(persisted.judgments.length, 1);
    assert.equal(persisted.judgments[0].winnerId, null);
    const judgmentAudit = await prisma.auditLog.findFirst({ where: { challengeId: ready.id, action: "judgment.completed" } });
    assert.ok(judgmentAudit, "persisted recommendation must retain its judgment audit receipt");
    assert.equal(JSON.parse(judgmentAudit.payload ?? "null").judgmentId, persisted.judgments[0].id);
    await runJudgeJob(successfulJob.id);
    assert.equal(await prisma.judgment.count({ where: { challengeId: ready.id } }), 1);
    console.log("PASS completed async recommendation reports persisted disputed state, never false settlement; retry creates no duplicate judgment");

    const balance = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { credits: true, _count: { select: { transactions: true } } } });
    assert.equal(balance.credits, user.credits);
    assert.equal(balance._count.transactions, 0);
    console.log("PASS recovery preserves credits and creates no financial transactions");
  } finally {
    // Only this run's isolated fixtures; remove linked test audit/activity first.
    const fixtureChallenges = await prisma.challenge.findMany({ where: { creatorId: user.id }, select: { id: true } });
    const challengeIds = fixtureChallenges.map((row) => row.id);
    await prisma.auditLog.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.activityEvent.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.user.delete({ where: { id: user.id } });
    if (opponentId) await prisma.user.delete({ where: { id: opponentId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
