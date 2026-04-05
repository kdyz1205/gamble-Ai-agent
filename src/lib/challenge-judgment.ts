import type { PrismaClient } from "@/generated/prisma/client";
import { ChallengeStatus } from "@/generated/prisma/enums";
import { assertChallengeTransition } from "@/lib/challenge-state-machine";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import prisma from "./db";
import { judgeChallenge } from "./ai-engine";
import { getAiModel, type TierId } from "./auth";
import { getCredits, spendForInference, settleChallenge, TIER_MULTIPLIER } from "./credits";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "./llm-providers";

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
}

/**
 * Runs AI judgment, persists Judgment, settles stakes, marks challenge settled.
 * Idempotent: skips if a completed judgment already exists for this challenge.
 */
export async function executeChallengeJudgment(
  challengeId: string,
  tierId: TierId,
  options?: ExecuteJudgmentOptions,
): Promise<JudgmentExecutionResult> {
  const existing = await prisma.judgment.findFirst({
    where: { challengeId, status: "completed" },
  });
  if (existing) {
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
  if (challenge.status !== "judging") {
    return { ok: false, error: "Challenge is not in judging state", status: 400 };
  }

  const payerUserId = challenge.creatorId;
  const cost = TIER_MULTIPLIER[tierId];
  const balance = await getCredits(payerUserId);
  if (balance < cost) {
    return {
      ok: false,
      error: `Not enough tokens. Need ${cost}, have ${balance}.`,
      status: 402,
      creditsRemaining: balance,
    };
  }

  const spend = await spendForInference(
    payerUserId,
    tierId,
    "judge",
    `Judge: "${challenge.title.slice(0, 40)}"`,
    challengeId,
  );
  if (!spend.success) {
    return {
      ok: false,
      error: spend.error || "Inference spend failed",
      status: 402,
      creditsRemaining: spend.balance,
    };
  }

  const creator = challenge.participants.find((p) => p.role === "creator");
  const opponent = challenge.participants.find((p) => p.role === "opponent");
  if (!creator) {
    return { ok: false, error: "Creator not found", status: 400 };
  }

  const evidenceA = challenge.evidence.find((e) => e.userId === creator.userId);
  const evidenceB = opponent ? challenge.evidence.find((e) => e.userId === opponent.userId) : null;
  const mapEv = (e: (typeof challenge.evidence)[0] | null | undefined) =>
    e ? { description: e.description, type: e.type, url: e.url } : null;

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
  const aiModelLabel = `${pdef?.shortLabel ?? "LLM"} · ${judgeModel}`;

  const result = await judgeChallenge({
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
    livenessPrompt: challenge.livenessPrompt,
  });

  const judgment = await prisma.judgment.create({
    data: {
      challengeId,
      winnerId: result.winnerId,
      method: "ai",
      aiModel: aiModelLabel,
      reasoning: result.reasoning,
      confidence: result.confidence,
      status: "completed",
    },
    include: { winner: { select: { id: true, username: true } } },
  });

  // Low confidence — don't settle, mark as disputed
  if (result.confidence < 0.85) {
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { status: ChallengeStatus.disputed },
    });

    await appendAuditLog({
      action: AuditActions.CHALLENGE_STATUS,
      actorUserId: payerUserId,
      challengeId,
      payload: {
        previousStatus: "judging",
        newStatus: "disputed",
        reason: "low_confidence",
        confidence: result.confidence,
        judgmentId: judgment.id,
      },
    });

    return {
      ok: true,
      judgment,
      settlementResult: { success: false, error: "Low confidence — marked for review" },
      challengeId,
      model: aiModelLabel,
      tierId,
      creditsUsed: cost,
      creditsRemaining: spend.balance,
      txHash: null,
    };
  }

  let settlementResult: { success: boolean; txHash?: string; error?: string } = { success: true };
  if (challenge.stake > 0) {
    // Move to pending_settlement BEFORE attempting on-chain tx
    assertChallengeTransition(challenge.status, ChallengeStatus.pending_settlement);
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { status: ChallengeStatus.pending_settlement, aiModel: aiModelLabel },
    });

    settlementResult = await settleChallenge(
      challengeId,
      result.winnerId,
      challenge.stake,
      challenge.participants.map((p) => ({ userId: p.userId })),
      { reasoning: result.reasoning, confidence: result.confidence },
    );

    if (!settlementResult.success) {
      // Settlement failed (blockchain reverted, out of gas, etc.)
      // Stay in pending_settlement — DO NOT mark as settled.
      // A retry job or admin can resolve this later.
      await appendAuditLog({
        action: AuditActions.JUDGMENT_COMPLETED,
        actorUserId: payerUserId,
        challengeId,
        payload: {
          winnerId: result.winnerId,
          judgmentId: judgment.id,
          confidence: result.confidence,
          settlementOk: false,
          settlementError: settlementResult.error,
          reasoning: result.reasoning?.slice(0, 500),
        },
      });

      return {
        ok: true,
        judgment,
        settlementResult,
        challengeId,
        model: aiModelLabel,
        tierId,
        creditsUsed: cost,
        creditsRemaining: spend.balance,
        txHash: null,
      };
    }
  }

  // Only reach here if settlement succeeded (or no stake)
  const fromStatus = challenge.stake > 0 ? ChallengeStatus.pending_settlement : challenge.status;
  assertChallengeTransition(fromStatus, ChallengeStatus.settled);
  await prisma.challenge.update({
    where: { id: challengeId },
    data: { status: ChallengeStatus.settled, aiModel: aiModelLabel },
  });

  await appendAuditLog({
    action: AuditActions.JUDGMENT_COMPLETED,
    actorUserId: payerUserId,
    challengeId,
    payload: {
      winnerId: result.winnerId,
      judgmentId: judgment.id,
      confidence: result.confidence,
      settlementOk: settlementResult.success,
      reasoning: result.reasoning?.slice(0, 500),
    },
  });

  const winnerName = judgment.winner?.username || "No one";
  await prisma.activityEvent.create({
    data: {
      type: "challenge_settled",
      message: `"${challenge.title}" judged by ${aiModelLabel} — ${winnerName} wins!${challenge.stake > 0 ? ` ${challenge.stake} credits` : ""}`,
      userId: result.winnerId,
      challengeId,
    },
  });

  return {
    ok: true,
    judgment,
    settlementResult,
    challengeId,
    model: aiModelLabel,
    tierId,
    creditsUsed: cost,
    creditsRemaining: spend.balance,
    txHash: spend.txHash || settlementResult.txHash || null,
  };
}
