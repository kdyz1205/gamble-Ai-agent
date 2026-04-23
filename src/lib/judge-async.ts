import prisma from "./db";
import { executeChallengeJudgment, type JudgmentExecutionFailure } from "./challenge-judgment";
import type { TierId } from "./auth";
import { isEvidenceUrlAllowed } from "./media/evidence-url";

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
  const result = await executeChallengeJudgment(job.challengeId, tierId, {
    providerId: job.providerId ?? undefined,
    model: job.model ?? undefined,
  });

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

  const snapshot = {
    judgment: {
      id: result.judgment.id,
      winnerId: result.judgment.winnerId,
      reasoning: result.judgment.reasoning,
      confidence: result.judgment.confidence,
      aiModel: result.judgment.aiModel,
    },
    settlement: result.settlementResult,
    challenge: { id: job.challengeId, status: "settled" as const },
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
export async function sweepStuckJudgeJobs(): Promise<{ swept: number }> {
  const threshold = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
  const stale = await prisma.judgeJob.findMany({
    where: {
      status: "processing",
      OR: [
        { startedAt: { lt: threshold } },
        // Legacy jobs from before startedAt existed
        { startedAt: null, updatedAt: { lt: threshold } },
      ],
    },
    select: { id: true, challengeId: true, webhookUrl: true },
  });
  for (const job of stale) {
    await prisma.judgeJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: "Sweeper: job exceeded max duration with no result — probably a crashed lambda.",
      },
    });
    // Best-effort webhook so clients polling externally can stop.
    await deliverWebhook(
      { id: job.id, challengeId: job.challengeId, webhookUrl: job.webhookUrl ?? null },
      { status: "failed", error: "stuck_timeout" },
    );
  }
  return { swept: stale.length };
}
