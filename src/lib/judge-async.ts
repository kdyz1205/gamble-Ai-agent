import prisma from "./db";
import { executeChallengeJudgment, type JudgmentExecutionFailure } from "./challenge-judgment";
import type { TierId } from "./auth";
import { isEvidenceUrlAllowed } from "./media/evidence-url";

export const JUDGE_JOB_TIMEOUT_MS = 6 * 60 * 1000;

/** One active async job per challenge, including concurrent HTTP retries. */
export async function getOrCreateJudgeJob(input: {
  challengeId: string;
  requestedByUserId: string;
  tierId: number;
  providerId: string | null;
  model: string | null;
  webhookUrl: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    // A separate key from the judgment execution lease: intake never holds the
    // inference lock while waiting for the background worker.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.challengeId}, 7118))`;
    const active = await tx.judgeJob.findFirst({
      where: { challengeId: input.challengeId, status: { in: ["pending", "processing"] } },
      orderBy: { createdAt: "asc" },
    });
    if (active) return { job: active, reused: true };
    return { job: await tx.judgeJob.create({ data: { ...input, status: "pending" } }), reused: false };
  });
}

async function deliverWebhook(
  job: { id: string; challengeId: string; webhookUrl: string | null },
  payload: Record<string, unknown>,
): Promise<void> {
  const url = job.webhookUrl?.trim();
  if (!url || !isEvidenceUrlAllowed(url)) return;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, challengeId: job.challengeId, ...payload }),
      signal: ac.signal,
    });
  } catch {
    /* webhook best-effort */
  } finally {
    clearTimeout(t);
  }
}

/**
 * Runs after HTTP 202 — ffmpeg + vision + settle. Idempotent: only runs from `pending`.
 *
 * Atomic state machine:
 *   pending → processing    (atomic updateMany; only one runner wins)
 *   processing → completed | failed
 *
 * A stuck-job sweeper (see sweepStuckJudgeJobs below) fails any job that sits
 * in `processing` longer than ~6 minutes (beyond our 5min maxDuration), so a
 * crashed lambda doesn't wedge a judgment forever.
 */
export async function runJudgeJob(jobId: string): Promise<void> {
  // Atomic claim: only one runner (or retry attempt) can transition pending → processing.
  const claim = await prisma.judgeJob.updateMany({
    where: { id: jobId, status: "pending" },
    data: { status: "processing", startedAt: new Date(), heartbeatAt: new Date() },
  });
  if (claim.count === 0) return; // someone else already took it, or it's no longer pending

  const job = await prisma.judgeJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const tierId = job.tierId as TierId;
  let result;
  try {
    result = await executeChallengeJudgment(job.challengeId, tierId, {
      providerId: job.providerId ?? undefined,
      model: job.model ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Background judgment failed";
    const failed = await prisma.judgeJob.updateMany({
      where: { id: jobId, status: "processing" },
      data: { status: "failed", error: message },
    });
    if (failed.count > 0) await deliverWebhook(job, { status: "failed", error: message });
    return;
  }

  if (!result.ok) {
    if ("skipped" in result && result.skipped) {
      await prisma.judgeJob.update({
        where: { id: jobId },
        data: { status: "failed", error: result.reason },
      });
      await deliverWebhook(job, { status: "failed", error: result.reason });
      return;
    }
    const fail = result as JudgmentExecutionFailure;
    await prisma.judgeJob.update({
      where: { id: jobId },
      data: { status: "failed", error: fail.error },
    });
    await deliverWebhook(job, { status: "failed", error: fail.error });
    return;
  }

  // A completed AI recommendation still needs participant consent. Never report
  // settlement from job completion: the challenge row owns lifecycle truth.
  const challenge = await prisma.challenge.findUniqueOrThrow({
    where: { id: job.challengeId },
    select: { status: true },
  });
  const snapshot = {
    judgment: {
      id: result.judgment.id,
      method: result.judgment.method,
      winnerId: result.judgment.winnerId,
      reasoning: result.judgment.reasoning,
      confidence: result.judgment.confidence,
      aiModel: result.judgment.aiModel,
    },
    settlement: result.settlementResult,
    challenge: { id: job.challengeId, status: challenge.status },
    model: result.model,
    tierId: result.tierId,
    creditsUsed: result.creditsUsed,
    creditsRemaining: result.creditsRemaining,
    txHash: result.txHash,
  };

  await prisma.judgeJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      judgmentId: result.judgment.id,
      resultJson: JSON.stringify(snapshot),
      creditsUsed: result.creditsUsed,
      creditsRemaining: result.creditsRemaining,
      txHash: result.txHash ?? null,
      heartbeatAt: new Date(),
    },
  });

  await deliverWebhook(job, { status: "completed", ...snapshot });
}

/**
 * Sweep any JudgeJob that has been stuck in "processing" longer than the Vercel
 * lambda maxDuration (300s) plus a grace buffer. Called by the judgment cron
 * on its regular schedule. Without this, a lambda cold-recycle mid-ffmpeg
 * would leave the job permanently pending and the client polling forever.
 */
export async function sweepStuckJudgeJobs(jobId?: string): Promise<{ swept: number }> {
  const threshold = new Date(Date.now() - JUDGE_JOB_TIMEOUT_MS);
  // Include pending work: after() may never start if its hosting process dies.
  const staleWhere = {
    ...(jobId ? { id: jobId } : {}),
    OR: [
      { status: "pending", createdAt: { lt: threshold } },
      { status: "processing", startedAt: { lt: threshold } },
      { status: "processing", startedAt: null, updatedAt: { lt: threshold } },
    ],
  };
  const stale = await prisma.judgeJob.findMany({
    where: staleWhere,
    select: { id: true, challengeId: true, webhookUrl: true },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let swept = 0;
  for (const job of stale) {
    // Recheck eligibility atomically. A completion or a fresh runner claim
    // between the query and this write must not be overwritten as failed.
    const result = await prisma.judgeJob.updateMany({
      where: { ...staleWhere, id: job.id },
      data: {
        status: "failed",
        error: "Background review exceeded its time limit. Reload the quest before retrying; credits are not automatically charged again.",
      },
    });
    if (result.count === 0) continue;
    swept += result.count;
    await deliverWebhook(job, { status: "failed", error: "stuck_timeout" });
  }
  return { swept };
}
