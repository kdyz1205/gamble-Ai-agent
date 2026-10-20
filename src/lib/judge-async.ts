import prisma from "./db";
import { executeChallengeJudgment, type JudgmentExecutionFailure } from "./challenge-judgment";
import type { TierId } from "./auth";
import { fetchBinaryCapped, isEvidenceUrlAllowed } from "./media/evidence-url";

export const JUDGE_JOB_TIMEOUT_MS = 6 * 60 * 1000;

const JOB_TIMEOUT_ERROR = "Background review exceeded its time limit. Reload the quest before retrying; credits are not automatically charged again.";

/** Recover bookkeeping only: an audited recommendation already owns the outcome. */
export async function reconcileJudgeJob(jobId: string): Promise<boolean> {
  const recovered = await prisma.$transaction(async (tx) => {
    const job = await tx.judgeJob.findUnique({ where: { id: jobId } });
    if (!job || !(["pending", "processing"].includes(job.status)
      || (job.status === "failed" && ["already_judged", JOB_TIMEOUT_ERROR].includes(job.error ?? "")))) return null;
    const challenge = await tx.challenge.findUnique({ where: { id: job.challengeId },
      select: { status: true, reviewCase: { select: { status: true } } } });
    if (!challenge || !["disputed", "pending_settlement", "settled"].includes(challenge.status)
      || (challenge.status === "settled" && challenge.reviewCase?.status === "processing")) return null;
    // Multiple final records or a later human decision cannot be attributed to this job.
    const judgments = await tx.judgment.findMany({ where: { challengeId: job.challengeId, status: "completed" }, take: 2 });
    if (judgments.length !== 1) return null;
    const judgment = judgments[0];
    if (!["ai", "rules"].includes(judgment.method) || (job.judgmentId && job.judgmentId !== judgment.id)) return null;
    const receipts = await tx.auditLog.findMany({ where: { challengeId: job.challengeId, action: "judgment.completed" }, select: { payload: true } });
    const audited = receipts.some(({ payload }) => {
      try {
        const data = typeof payload === "string" ? JSON.parse(payload) : payload;
        return data && typeof data === "object" && data.judgmentId === judgment.id;
      } catch { return false; }
    });
    if (!audited) return null;
    const snapshot = {
      judgment: { id: judgment.id, method: judgment.method, winnerId: judgment.winnerId,
        reasoning: judgment.reasoning, confidence: judgment.confidence, aiModel: judgment.aiModel },
      settlement: { success: false, error: "Recovery performs no settlement; consult the current quest record." },
      challenge: { id: job.challengeId, status: challenge.status }, model: judgment.aiModel,
      tierId: job.tierId, creditsUsed: job.creditsUsed, creditsRemaining: job.creditsRemaining, txHash: job.txHash,
      recovered: true, feeMetadataAvailable: job.creditsUsed !== null,
    };
    const updated = await tx.judgeJob.updateMany({
      where: { id: job.id, status: job.status, updatedAt: job.updatedAt },
      data: { status: "completed", error: null, judgmentId: judgment.id,
        resultJson: JSON.stringify(snapshot), heartbeatAt: new Date() },
    });
    if (updated.count !== 1) return null;
    await tx.auditLog.create({ data: { action: "judge.job.reconciled", actorUserId: job.requestedByUserId,
      challengeId: job.challengeId, payload: JSON.stringify({ jobId: job.id, judgmentId: judgment.id, previousStatus: job.status }) } });
    return { job, snapshot };
  });
  if (!recovered) return false;
  await deliverWebhook(recovered.job, { status: "completed", ...recovered.snapshot });
  return true;
}

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
  try {
    await fetchBinaryCapped(url, 64 * 1024, 12_000, {
      method: "POST", body: JSON.stringify({ jobId: job.id, challengeId: job.challengeId, ...payload }),
    });
  } catch {
    /* webhook best-effort */
  }
}

/**
 * Runs after HTTP 202 — ffmpeg + vision + recommendation. Idempotent: only runs from `pending`.
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
  if (claim.count === 0) { await reconcileJudgeJob(jobId); return; }

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
    if (await reconcileJudgeJob(job.id)) return;
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
      if (result.reason === "already_judged" && await reconcileJudgeJob(job.id)) return;
      const failed = await prisma.judgeJob.updateMany({
        where: { id: jobId, status: "processing" },
        data: { status: "failed", error: result.reason },
      });
      if (failed.count > 0) await deliverWebhook(job, { status: "failed", error: result.reason });
      return;
    }
    const fail = result as JudgmentExecutionFailure;
    const failed = await prisma.judgeJob.updateMany({
      where: { id: jobId, status: "processing" },
      data: { status: "failed", error: fail.error },
    });
    if (failed.count > 0) await deliverWebhook(job, { status: "failed", error: fail.error });
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

  const finished = await prisma.judgeJob.updateMany({
    where: { id: jobId, OR: [{ status: "processing" }, { status: "failed", error: JOB_TIMEOUT_ERROR }] },
    data: {
      status: "completed",
      error: null,
      judgmentId: result.judgment.id,
      resultJson: JSON.stringify(snapshot),
      creditsUsed: result.creditsUsed,
      creditsRemaining: result.creditsRemaining,
      txHash: result.txHash ?? null,
      heartbeatAt: new Date(),
    },
  });

  if (finished.count > 0) await deliverWebhook(job, { status: "completed", ...snapshot });
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
    if (await reconcileJudgeJob(job.id)) { swept++; continue; }
    // Recheck eligibility atomically. A completion or a fresh runner claim
    // between the query and this write must not be overwritten as failed.
    const result = await prisma.judgeJob.updateMany({
      where: { ...staleWhere, id: job.id },
      data: {
        status: "failed",
        error: JOB_TIMEOUT_ERROR,
      },
    });
    if (result.count === 0) continue;
    swept += result.count;
    await deliverWebhook(job, { status: "failed", error: "stuck_timeout" });
  }
  return { swept };
}
