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
 */
export async function runJudgeJob(jobId: string): Promise<void> {
  const job = await prisma.judgeJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") return;

  await prisma.judgeJob.update({ where: { id: jobId }, data: { status: "processing" } });

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
    },
  });

  await deliverWebhook(job, { status: "completed", ...snapshot });
}
