import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ChallengeStatus } from "@/lib/enums";
import { AuditActions } from "@/lib/audit-log";
import prisma from "./db";
import { judgeChallenge } from "./ai-engine";
import { getAiModel, type TierId } from "./auth";
import { getCredits, spendForInference, TIER_MULTIPLIER } from "./credits";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "./llm-providers";
import { ensureAutomaticReviewCase } from "./verdict-review";
import { currentAiCallCount, withAiContext } from "./ai-governance";
import { withJudgmentExecutionLock } from "./judgment-execution-lock";
import { isOnChainEnabled } from "./contracts";
import { reconcileJudgmentFees, refundJudgmentFee, reserveJudgmentFee } from "./judgment-fees";

export type JudgmentExecutionSuccess = {
  ok: true;
  judgment: Awaited<
    ReturnType<
      PrismaClient["judgment"]["create"]
    >
  >;
  settlementResult: { success: boolean; txHash?: string; error?: string };
  challengeId: string;
  model: string;
  tierId: TierId;
  creditsUsed: number;
  creditsRemaining: number;
  txHash: string | null;
};

export type JudgmentExecutionFailure = {
  ok: false;
  error: string;
  status: number;
  creditsRemaining?: number;
};

export type JudgmentExecutionSkipped = {
  ok: false;
  skipped: true;
  reason: string;
};

export type JudgmentExecutionResult =
  | JudgmentExecutionSuccess
  | JudgmentExecutionFailure
  | JudgmentExecutionSkipped;

export interface ExecuteJudgmentOptions {
  providerId?: string;
  model?: string;
  allowLive?: boolean;
}

/**
 * Runs AI judgment and persists a recommendation for participant consent or review.
 * Idempotent: skips if a completed judgment already exists for this challenge.
 */
export async function executeChallengeJudgment(
  challengeId: string,
  tierId: TierId,
  options?: ExecuteJudgmentOptions,
): Promise<JudgmentExecutionResult> {
  if (!await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true } })) {
    return { ok: false, error: "Challenge not found", status: 404 };
  }
  const result = await withJudgmentExecutionLock(challengeId, (attemptId) => executeClaimedJudgment(challengeId, tierId, attemptId, options));
  return result ?? { ok: false, error: "Judgment is already processing", status: 409 };
}

async function executeClaimedJudgment(
  challengeId: string, tierId: TierId, attemptId: string, options?: ExecuteJudgmentOptions,
): Promise<JudgmentExecutionResult> {
  const existing = await prisma.judgment.findFirst({
    where: { challengeId, status: "completed" },
    include: { winner: { select: { id: true, username: true } } },
  });
  if (existing) {
    // Repair historical crash boundaries without another inference or charge.
    const priorChallenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } });
    if (priorChallenge.status === "judging") {
      await prisma.$transaction((tx) => persistRecommendation(tx, priorChallenge, existing));
    }
    return { ok: false, skipped: true, reason: "already_judged" };
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      participants: {
        where: { status: "accepted" },
        include: { user: { select: { id: true, username: true } } },
      },
      evidence: true,
    },
  });

  if (!challenge) {
    return { ok: false, error: "Challenge not found", status: 404 };
  }
  if (challenge.status !== "judging" && !(options?.allowLive && challenge.status === "live")) {
    return { ok: false, error: "Challenge is not in judging state", status: 400 };
  }

  const offChain = !isOnChainEnabled();
  if (offChain) await reconcileJudgmentFees(challengeId);

  const payerUserId = challenge.creatorId;
  const proofUserIds = new Set(challenge.evidence.map((e) => e.userId));
  const hasBothProof = challenge.participants.filter((p) => p.role === "creator" || p.role === "opponent")
    .every((p) => proofUserIds.has(p.userId));
  let cost = challenge.stake > 0 && hasBothProof ? TIER_MULTIPLIER[tierId] : 0;
  const balance = await getCredits(payerUserId);
  if (balance < cost) {
    return {
      ok: false,
      error: `Not enough tokens. Need ${cost}, have ${balance}.`,
      status: 402,
      creditsRemaining: balance,
    };
  }

  // Require an opponent before judging. Solo challenges used to auto-win at
  // 0.85 confidence (above the settle threshold), turning self-staked markets
  // into a ledger-polluting no-op that still burned inference credit.
  const creator = challenge.participants.find((p) => p.role === "creator");
  const opponent = challenge.participants.find((p) => p.role === "opponent");
  if (!creator) {
    return { ok: false, error: "Creator not found", status: 400 };
  }
  if (!opponent) {
    return {
      ok: false,
      error: "No opponent has accepted — judgment requires at least two participants.",
      status: 400,
    };
  }

  const evidenceA = challenge.evidence.find((e) => e.userId === creator.userId);
  const evidenceB = challenge.evidence.find((e) => e.userId === opponent.userId);
  if ((!evidenceA || !evidenceB) && (!challenge.deadline || challenge.deadline.getTime() > Date.now())) {
    return { ok: false, error: "Both participants must submit proof before early judgment", status: 409 };
  }
  if (challenge.status === "live") {
    const claimed = await prisma.challenge.updateMany({ where: { id: challengeId, status: "live" }, data: { status: "judging" } });
    if (claimed.count === 0) return { ok: false, error: "Challenge state changed", status: 409 };
    challenge.status = "judging";
  }

  const spend = cost > 0 ? (offChain ? await reserveJudgmentFee(payerUserId, tierId, challengeId, attemptId) : await spendForInference(
    payerUserId,
    tierId,
    "judge",
    `Judge: "${challenge.title.slice(0, 40)}"`,
    challengeId,
  )) : { success: true, balance, txHash: undefined, error: undefined };
  if (!spend.success) {
    return {
      ok: false,
      error: spend.error || "Inference spend failed",
      status: 402,
      creditsRemaining: spend.balance,
    };
  }

  const refundInference = async (reason: string) => {
    if (offChain) {
      const refund = await refundJudgmentFee(payerUserId, challengeId, attemptId, reason);
      if (!refund.success) throw new Error(refund.error ?? "Inference refund failed");
      return refund;
    }
    return (await import("./credits")).addCredits(payerUserId, cost, "refund", reason, challengeId);
  };

  // Lift the pre-extracted Blob frame URLs from JSON-text into a string[] so the
  // judge can skip ffmpeg entirely when the POST /evidence hook already cached them.
  const parseFrames = (raw: string | null | undefined): string[] | null => {
    if (!raw) return null;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : null;
    } catch {
      return null;
    }
  };
  const mapEv = (e: (typeof challenge.evidence)[0] | null | undefined) =>
    e
      ? {
          description: e.description,
          type: e.type,
          url: e.url,
          preparedFrames: parseFrames(e.preparedFrames),
          preparedDurationSec: e.preparedDurationSec,
          preparedMode: e.preparedMode,
        }
      : null;

  const bothHaveVideoUrl =
    evidenceA?.type === "video" &&
    evidenceB?.type === "video" &&
    Boolean(String(evidenceA?.url ?? "").trim()) &&
    Boolean(String(evidenceB?.url ?? "").trim());
  const googleVisionReady =
    Boolean(process.env.GOOGLE_AI_API_KEY) && Boolean(getProviderById("google"));

  const tierMeta = getAiModel(tierId);
  const envDefault = process.env.ORACLE_DEFAULT_PROVIDER;
  let providerId =
    options?.providerId ??
    (envDefault && getProviderById(envDefault) ? envDefault : DEFAULT_LLM_PROVIDER_ID);
  if (!options?.providerId && bothHaveVideoUrl && googleVisionReady) {
    providerId = "google";
  }
  const pdef = getProviderById(providerId);
  let judgeModel =
    options?.model?.trim() ||
    (providerId === DEFAULT_LLM_PROVIDER_ID
      ? tierMeta.model
      : (pdef?.defaultModel ?? tierMeta.model));
  if (!options?.model?.trim() && bothHaveVideoUrl && googleVisionReady) {
    judgeModel = "gemini-2.0-flash";
  }
  let aiModelLabel = `${pdef?.shortLabel ?? "LLM"} · ${judgeModel}`;

  // Wrap judgeChallenge so a throw (provider timeout, bad JSON, etc.) refunds
  // the inference spend instead of pocketing it silently.
  let result;
  let inferenceCalls = 0;
  try {
    result = await withAiContext({ userId: payerUserId, challengeId, purpose: "challenge.judge", deadlineMs: 270_000 }, async () => {
      const before = currentAiCallCount();
      const verdict = await judgeChallenge({
      title: challenge.title,
      description: challenge.description,
      deadlineIso: challenge.deadline?.toISOString() ?? null,
      type: challenge.type,
      rules: challenge.rules,
      evidencePolicy: challenge.evidenceType,
      evidenceA: mapEv(evidenceA ?? null),
      evidenceB: mapEv(evidenceB ?? null),
      participantAId: creator.userId,
      participantBId: opponent?.userId ?? null,
      model: judgeModel,
      providerId,
      });
      inferenceCalls = currentAiCallCount() - before;
      return verdict;
    });
    if (result.unavailable) throw new Error("AI could not evaluate the proof. Please retry later; no verdict was saved.");
    if (inferenceCalls === 0) aiModelLabel = evidenceA && evidenceB ? "Proof requirements" : "Deadline rule";
    if (cost > 0 && inferenceCalls === 0) {
      const refunded = await refundInference("No model inference required");
      spend.balance = refunded.balance;
      cost = 0;
    }
  } catch (err) {
    // Refund the inference credits since no judgment will be produced.
    const refundCost = cost;
    try {
      if (refundCost > 0) {
      await refundInference("Refund — judge provider could not evaluate proof");
      }
    } catch (refundErr) {
      console.error("CRITICAL: judge spend refund failed", { payerUserId, refundCost, err, refundErr });
    }
    return { ok: false, error: err instanceof Error ? err.message : "Judge call failed", status: 502 };
  }

  try {
    const judgment = await prisma.$transaction(async (tx) => {
      const saved = await tx.judgment.create({
        data: { challengeId, winnerId: result.winnerId, method: inferenceCalls === 0 ? "rules" : "ai", aiModel: aiModelLabel,
          reasoning: result.reasoning, confidence: result.confidence, status: "completed" },
        include: { winner: { select: { id: true, username: true } } },
      });
      await persistRecommendation(tx, challenge, saved);
      return saved;
    });
    return {
      ok: true, judgment, settlementResult: { success: false, error: "Manual confirmation required" },
      challengeId, model: aiModelLabel, tierId, creditsUsed: cost,
      creditsRemaining: spend.balance, txHash: spend.txHash || null,
    };
  } catch (error) {
    if (cost > 0) {
      await refundInference("Refund — recommendation could not be saved");
    }
    return { ok: false, error: error instanceof Error ? error.message : "Could not save recommendation", status: 503 };
  }
}

async function persistRecommendation(
  tx: Prisma.TransactionClient,
  challenge: { id: string; creatorId: string; title: string },
  judgment: { id: string; winnerId: string | null; reasoning: string | null; confidence: number | null; aiModel: string | null; winner: { username: string } | null },
): Promise<void> {
  const updated = await tx.challenge.updateMany({ where: { id: challenge.id, status: "judging" },
    data: { status: ChallengeStatus.disputed, aiModel: judgment.aiModel } });
  if (updated.count !== 1) throw new Error("Challenge state changed before recommendation was saved");
  if (judgment.confidence === null || judgment.confidence < 0.85) {
    await ensureAutomaticReviewCase({ challengeId: challenge.id, judgmentId: judgment.id,
      reason: judgment.confidence === null ? "Automatic review: recommendation has no confidence metadata."
        : `Automatic review: Familiar confidence was ${Math.round(judgment.confidence * 100)}%.` }, tx);
  }
  await tx.auditLog.create({ data: {
    action: AuditActions.JUDGMENT_COMPLETED, actorUserId: challenge.creatorId, challengeId: challenge.id,
    payload: JSON.stringify({ winnerId: judgment.winnerId, judgmentId: judgment.id, confidence: judgment.confidence,
      settlementOk: false, reviewRequired: true, reasoning: judgment.reasoning?.slice(0, 500) ?? null }),
  } });
  await tx.activityEvent.create({ data: {
    type: "challenge_verdict_recommended", userId: judgment.winnerId, challengeId: challenge.id,
    message: `"${challenge.title}" has a Familiar recommendation from ${judgment.aiModel}: ${judgment.winner?.username ?? "No winner"}. Both participants must accept or request review.`,
  } });
}
