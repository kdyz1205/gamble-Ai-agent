import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";
import { getOrCreateJudgeJob, reconcileJudgeJob, runJudgeJob, sweepStuckJudgeJobs } from "../src/lib/judge-async";
import { reserveJudgmentFee } from "../src/lib/judgment-fees";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/summoner_verification", "Only isolated local verification database allowed");
  const tag = randomUUID().replaceAll("-", "");
  const functionName = `job_crash_${tag}`;
  const triggerName = `job_crash_trigger_${tag}`;
  const priorEnabled = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "false";
  const creator = await prisma.user.create({ data: { username: `job_${tag}_a`, email: `job_${tag}_a@example.invalid`, credits: 200 } });
  const opponent = await prisma.user.create({ data: { username: `job_${tag}_b`, email: `job_${tag}_b@example.invalid`, credits: 200 } });
  const challengeIds: string[] = [];
  let passed = 0;
  const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
  async function quest(label: string, status = "judging") {
    const challenge = await prisma.challenge.create({ data: { creatorId: creator.id, title: `Job crash ${label} ${tag}`,
      type: "General", status, stake: 0, deadline: new Date(Date.now() - 60_000), participants: { create: [
        { userId: creator.id, role: "creator", status: "accepted" }, { userId: opponent.id, role: "opponent", status: "accepted" },
      ] } } });
    challengeIds.push(challenge.id); return challenge;
  }
  const job = async (challengeId: string) => (await getOrCreateJudgeJob({ challengeId, requestedByUserId: creator.id,
    tierId: 1, providerId: null, model: null, webhookUrl: null })).job;
  const financial = async () => ({
    balances: await prisma.user.findMany({ where: { id: { in: [creator.id, opponent.id] } }, select: { id: true, credits: true }, orderBy: { id: "asc" } }),
    ledger: await prisma.creditTx.findMany({ where: { userId: { in: [creator.id, opponent.id] } }, orderBy: { id: "asc" } }),
    reservations: await prisma.auditLog.count({ where: { challengeId: { in: challengeIds }, action: "ai.call.reserved" } }),
  });
  const stale = async (id: string) => prisma.judgeJob.update({ where: { id }, data: { status: "processing", startedAt: new Date(Date.now() - 7 * 60_000) } });
  try {
    const existing = await quest("already-completed");
    assert((await executeChallengeJudgment(existing.id, 1)).ok);
    const existingJob = await job(existing.id);
    const before = await financial();
    await runJudgeJob(existingJob.id);
    const completed = await prisma.judgeJob.findUniqueOrThrow({ where: { id: existingJob.id } });
    assert.equal(completed.status, "completed");
    const snapshot = JSON.parse(completed.resultJson!);
    assert.equal(snapshot.judgment.id, (await prisma.judgment.findFirstOrThrow({ where: { challengeId: existing.id } })).id);
    assert.equal(snapshot.settlement.success, false);
    assert.equal(snapshot.challenge.status, "disputed");
    assert.equal(snapshot.creditsUsed, null, "unknown execution fee must not become synthetic zero");
    assert.equal(snapshot.feeMetadataAvailable, false);
    assert.deepEqual(await financial(), before);
    pass("already_judged recovers exact audited recommendation without AI, fees or settlement");

    const interrupted = await quest("commit-then-job-update-crash");
    const interruptedJob = await job(interrupted.id);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${interruptedJob.id}' AND NEW.status = 'completed' THEN RAISE EXCEPTION 'Injected crash after judgment commit before job update'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON "JudgeJob" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    await assert.rejects(runJudgeJob(interruptedJob.id), /Injected crash/);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: interruptedJob.id } })).status, "processing");
    assert.equal(await prisma.judgment.count({ where: { challengeId: interrupted.id, status: "completed" } }), 1);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: interrupted.id } })).status, "disputed");
    await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "JudgeJob"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
    const committedFinancial = await financial();
    await stale(interruptedJob.id);
    assert.equal((await sweepStuckJudgeJobs(interruptedJob.id)).swept, 1);
    const repaired = await prisma.judgeJob.findUniqueOrThrow({ where: { id: interruptedJob.id } });
    assert.equal(repaired.status, "completed");
    assert.equal(JSON.parse(repaired.resultJson!).recovered, true);
    assert.deepEqual(await financial(), committedFinancial);
    pass("actual PostgreSQL injected post-judgment crash reconciles stale job to completed");

    await Promise.all(Array.from({ length: 5 }, () => reconcileJudgeJob(interruptedJob.id)));
    await runJudgeJob(interruptedJob.id);
    assert.equal((await sweepStuckJudgeJobs(interruptedJob.id)).swept, 0);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: interruptedJob.id } })).updatedAt.toISOString(), repaired.updatedAt.toISOString());
    assert.equal(await prisma.auditLog.count({ where: { challengeId: interrupted.id, action: "judge.job.reconciled" } }), 1);
    assert.deepEqual(await financial(), committedFinancial);
    pass("duplicate recovery and runner/poll retries preserve snapshot, balances and ledger");

    const missing = await quest("no-final-verdict");
    await prisma.judgment.create({ data: { challengeId: missing.id, status: "pending", method: "ai" } });
    const missingJob = await job(missing.id); await stale(missingJob.id);
    assert.equal((await sweepStuckJudgeJobs(missingJob.id)).swept, 1);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: missingJob.id } })).status, "failed");
    assert.equal(await reconcileJudgeJob(missingJob.id), false);
    pass("pending or absent verdict remains explicit timeout failure");

    const ambiguous = await quest("ambiguous");
    assert((await executeChallengeJudgment(ambiguous.id, 1)).ok);
    await prisma.judgment.create({ data: { challengeId: ambiguous.id, status: "completed", method: "manual", winnerId: opponent.id } });
    const ambiguousJob = await job(ambiguous.id); await runJudgeJob(ambiguousJob.id);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: ambiguousJob.id } })).status, "failed");
    assert.equal(await reconcileJudgeJob(ambiguousJob.id), false);
    pass("later human decision or multiple completed judgments cannot be attributed to job");

    const unaudited = await quest("missing-commit-receipt", "disputed");
    await prisma.judgment.create({ data: { challengeId: unaudited.id, status: "completed", method: "ai", winnerId: creator.id } });
    const unauditedJob = await job(unaudited.id); await runJudgeJob(unauditedJob.id);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: unauditedJob.id } })).status, "failed");
    pass("unaudited completed row is not invented into successful job receipt");

    const paid = await quest("existing-paid-receipt", "disputed");
    const fee = await reserveJudgmentFee(creator.id, 1, paid.id, randomUUID()); assert(fee.success);
    // Explicit bookkeeping fixture: this does not claim AI accuracy or perform inference.
    const paidVerdict = await prisma.judgment.create({ data: { challengeId: paid.id, status: "completed", method: "ai", winnerId: creator.id, aiModel: "bookkeeping fixture" } });
    await prisma.auditLog.create({ data: { challengeId: paid.id, action: "judgment.completed", payload: JSON.stringify({ judgmentId: paidVerdict.id }) } });
    const paidJob = await job(paid.id);
    await prisma.judgeJob.update({ where: { id: paidJob.id }, data: { creditsUsed: 1, creditsRemaining: fee.balance } });
    const paidFinancial = await financial();
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => reconcileJudgeJob(paidJob.id)));
    assert.equal(concurrent.filter(Boolean).length, 1);
    const paidRecovered = await prisma.judgeJob.findUniqueOrThrow({ where: { id: paidJob.id } });
    assert.equal(paidRecovered.creditsUsed, 1); assert.equal(paidRecovered.creditsRemaining, fee.balance);
    assert.deepEqual(await financial(), paidFinancial);
    pass("concurrent reconciliation preserves known real fee receipt without another debit/refund");

    const failedJob = await prisma.judgeJob.create({ data: { challengeId: paid.id, requestedByUserId: creator.id, status: "failed", error: "Provider unavailable" } });
    assert.equal(await reconcileJudgeJob(failedJob.id), false);
    assert.equal((await prisma.judgeJob.findUniqueOrThrow({ where: { id: failedJob.id } })).error, "Provider unavailable");
    assert.equal((await financial()).reservations, 0);
    pass("genuine provider failures remain explicit and entire suite performs zero provider reservations");
    console.log(`PASS ${passed}/${passed} committed job recovery checks`);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "JudgeJob"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    await prisma.auditLog.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.activityEvent.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.creditTx.deleteMany({ where: { userId: { in: [creator.id, opponent.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, opponent.id] } } });
    if (priorEnabled === undefined) delete process.env.AI_ENABLED; else process.env.AI_ENABLED = priorEnabled;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
