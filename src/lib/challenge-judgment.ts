/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { PrismaClient } from "@/generated/prisma/client";
import { ChallengeStatus } from "@/lib/enums";
import { assertChallengeTransition } from "@/lib/challenge-state-machine";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import prisma from "./db";
import { judgeChallenge } from "./ai-engine";
import { getAiModel, type TierId } from "./auth";
import { getCredits, spendForInference, settleChallenge, TIER_MULTIPLIER } from "./credits";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "./llm-providers";
import { isAiReviewStatus } from "./challenge-state-machine";
import { cleanupChallengeFrameBlobs } from "./media/blob-cleanup";
import {
  buildJudgmentMetricsJson,
  evaluateAutoSettleEligibility,
  effectiveJudgmentVerdictFields,
  blockingIssuesForJudgment,
  requiresHoldDurationWinnerFromText,
  requiresRepCountWinnerFromText,
  statusForJudgmentResult,
} from "./judgment-policy";
import { parseProtocolSpecV2 } from "./protocol-spec-v2";
import {
  combineAutoSettlePolicyWithProtocolGates,
  evaluateProtocolJudgmentGates,
} from "./protocol-judgment-policy";
import { isStakeTokenAllowed, moneyModeBlock, normalizeStakeToken } from "./payment-policy";

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
      evidenceChecks: true,
      participantBindings: true,
      protocol: true,
    },
  });

  if (!challenge) {
    return { ok: false, error: "Challenge not found", status: 404 };
  }
  if (!isAiReviewStatus(challenge.status)) {
    return { ok: false, error: "Challenge is not in AI reviewing state", status: 400 };
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

  // Require an opponent before judging. Solo challenges used to auto-win at
  // 0.85 confidence (above the settle threshold), turning self-staked markets
  // into a ledger-polluting no-op that still burned inference credit.
  const creator = challenge.participants.find((p) => p.role === "creator");
  const opponent = challenge.participants.find((p) => p.role === "opponent");
  const protocol = challenge.protocol?.specJson
    ? (() => {
        try {
          return parseProtocolSpecV2(JSON.parse(challenge.protocol.specJson));
        } catch {
          return null;
        }
      })()
    : null;
  const isSoloProtocol = protocol?.participantMode === "solo";
  if (!creator) {
    return { ok: false, error: "Creator not found", status: 400 };
  }
  if (!opponent && !isSoloProtocol) {
    return {
      ok: false,
      error: "No opponent has accepted — judgment requires at least two participants.",
      status: 400,
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

  const evidenceA = challenge.evidence.find((e) => e.userId === creator.userId);
  const evidenceB = opponent ? challenge.evidence.find((e) => e.userId === opponent.userId) : null;
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
  const parseMetadata = (raw: string | null | undefined): Record<string, unknown> | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
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
          metadata: parseMetadata(e.metadata),
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
    (pdef?.id === "anthropic"
      ? tierMeta.model
      : (pdef?.defaultModel ?? tierMeta.model));
  if (!options?.model?.trim() && bothHaveVideoUrl && googleVisionReady) {
    judgeModel = "gemini-2.0-flash";
  }
  const aiModelLabel = `${pdef?.shortLabel ?? "LLM"} · ${judgeModel}`;

  // Wrap judgeChallenge so a throw (provider timeout, bad JSON, etc.) refunds
  // the inference spend instead of pocketing it silently.
  let result;
  try {
    result = await judgeChallenge({
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
  } catch (err) {
    // Refund the inference credits since no judgment will be produced.
    const refundCost = cost;
    try {
      await (await import("./credits")).addCredits(
        payerUserId,
        refundCost,
        "refund",
        `Refund — judge call failed: ${err instanceof Error ? err.message.slice(0, 80) : "unknown"}`,
        challengeId,
      );
    } catch (refundErr) {
      console.error("CRITICAL: judge spend refund failed", { payerUserId, refundCost, err, refundErr });
    }
    return { ok: false, error: err instanceof Error ? err.message : "Judge call failed", status: 502 };
  }

  const requiresVision = challenge.evidenceType === "video" || bothHaveVideoUrl;
  const judgmentPolicyOptions = {
    requiresVision,
    requiresRepCountWinner: requiresRepCountWinnerFromText(
      challenge.title,
      challenge.description,
      challenge.proposition,
      challenge.rules,
    ),
    requiresHoldDurationWinner: requiresHoldDurationWinnerFromText(
      challenge.title,
      challenge.description,
      challenge.proposition,
      challenge.rules,
    ),
    participantAId: creator.userId,
    participantBId: opponent?.userId ?? null,
    solo: isSoloProtocol,
  };
  const protocolGates = evaluateProtocolJudgmentGates({
    protocol,
    participants: challenge.participants,
    participantBindings: challenge.participantBindings,
    evidence: challenge.evidence,
    evidenceChecks: challenge.evidenceChecks,
    result,
  });
  const aiOnlyAutoSettlePolicy = evaluateAutoSettleEligibility(result, judgmentPolicyOptions);
  const autoSettlePolicy = combineAutoSettlePolicyWithProtocolGates(aiOnlyAutoSettlePolicy, protocolGates);
  const aiOnlyVerdictStatus = statusForJudgmentResult(result, judgmentPolicyOptions);
  const verdictStatus =
    aiOnlyVerdictStatus === ChallengeStatus.ai_verdict_ready && !protocolGates.settlementEligibility.eligible
      ? ChallengeStatus.manual_review_required
      : aiOnlyVerdictStatus;
  const blockingIssues = autoSettlePolicy.blockingIssues.length
    ? autoSettlePolicy.blockingIssues
    : blockingIssuesForJudgment(result, judgmentPolicyOptions);
  const { evidenceQuality, recommendation } = effectiveJudgmentVerdictFields(result, autoSettlePolicy);
  const providerCallAudit = result.providerCall ? JSON.parse(JSON.stringify(result.providerCall)) : null;

  const judgment = await prisma.judgment.create({
    data: {
      challengeId,
      winnerId: result.winnerId,
      method: "ai",
      aiModel: aiModelLabel,
      reasoning: result.reasoning,
      confidence: result.confidence,
      status: "completed",
      metricsJson: buildJudgmentMetricsJson(result, {
        model: aiModelLabel,
        autoSettlePolicy,
        status: verdictStatus,
        protocolGates,
      }),
    },
    include: { winner: { select: { id: true, username: true } } },
  });

  if (process.env.AI_VERDICT_MODE !== "auto_settle") {
    const nextStatus =
      verdictStatus === ChallengeStatus.ai_verdict_ready
        ? ChallengeStatus.dispute_window_open
        : verdictStatus;
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { status: nextStatus, aiModel: aiModelLabel },
    });

    await appendAuditLog({
      action: AuditActions.JUDGMENT_COMPLETED,
      actorUserId: payerUserId,
      challengeId,
      payload: {
        winnerId: result.winnerId,
        judgmentId: judgment.id,
        confidence: result.confidence,
        settlementOk: false,
        reviewRequired: nextStatus !== ChallengeStatus.dispute_window_open,
        newStatus: nextStatus,
        source: result.source,
        providerCall: providerCallAudit,
        evidenceQuality,
        recommendation,
        settlementRecommendation: recommendation,
        blockingIssues,
        protocolCompliance: protocolGates.protocolCompliance,
        identityResult: protocolGates.identityResult,
        evidenceResult: protocolGates.evidenceResult,
        settlementEligibility: protocolGates.settlementEligibility,
        autoSettleBlockReason: autoSettlePolicy.reason,
        reasoning: result.reasoning?.slice(0, 500),
      },
    });

    const winnerName = judgment.winner?.username || "No one";
    await prisma.activityEvent.create({
      data: {
        type: "challenge_verdict_recommended",
        message: `"${challenge.title}" has an AI recommendation from ${aiModelLabel}: ${winnerName} wins. Creator confirmation required.`,
        userId: result.winnerId,
        challengeId,
      },
    });

    return {
      ok: true,
      judgment,
      settlementResult: { success: false, error: "Manual confirmation required" },
      challengeId,
      model: aiModelLabel,
      tierId,
      creditsUsed: cost,
      creditsRemaining: spend.balance,
      txHash: spend.txHash || null,
    };
  }

  // Strict policy gate: do not auto-settle unclear, fallback, or incomplete video judgments.
  if (!autoSettlePolicy.eligible) {
    const nextStatus =
      verdictStatus === ChallengeStatus.ai_verdict_ready
        ? ChallengeStatus.manual_review_required
        : verdictStatus;
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { status: nextStatus },
    });

    await appendAuditLog({
      action: AuditActions.CHALLENGE_STATUS,
      actorUserId: payerUserId,
      challengeId,
      payload: {
        previousStatus: challenge.status,
        newStatus: nextStatus,
        reason: autoSettlePolicy.reason ?? "auto_settle_policy_blocked",
        confidence: result.confidence,
        source: result.source,
        providerCall: providerCallAudit,
        evidenceQuality,
        recommendation,
        settlementRecommendation: recommendation,
        blockingIssues,
        protocolCompliance: protocolGates.protocolCompliance,
        identityResult: protocolGates.identityResult,
        evidenceResult: protocolGates.evidenceResult,
        settlementEligibility: protocolGates.settlementEligibility,
        judgmentId: judgment.id,
      },
    });

    return {
      ok: true,
      judgment,
      settlementResult: { success: false, error: autoSettlePolicy.reason || "Marked for review" },
      challengeId,
      model: aiModelLabel,
      tierId,
      creditsUsed: cost,
      creditsRemaining: spend.balance,
      txHash: null,
    };
  }

  let settlementResult: { success: boolean; txHash?: string; error?: string } = { success: true };
  const freshChallenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { status: true },
  });
  if (freshChallenge?.status === ChallengeStatus.settled) {
    await appendAuditLog({
      action: AuditActions.CHALLENGE_STATUS,
      actorUserId: payerUserId,
      challengeId,
      payload: {
        event: "duplicate_settlement_skipped",
        currentStatus: freshChallenge.status,
        judgmentId: judgment.id,
      },
    });
    return {
      ok: true,
      judgment,
      settlementResult: { success: true },
      challengeId,
      model: aiModelLabel,
      tierId,
      creditsUsed: cost,
      creditsRemaining: spend.balance,
      txHash: null,
    };
  }

  const reviewStatus = freshChallenge?.status ?? challenge.status;
  assertChallengeTransition(reviewStatus, ChallengeStatus.ai_verdict_ready);
  await prisma.challenge.update({
    where: { id: challengeId },
    data: { status: ChallengeStatus.ai_verdict_ready, aiModel: aiModelLabel },
  });
  assertChallengeTransition(ChallengeStatus.ai_verdict_ready, ChallengeStatus.dispute_window_open);
  await prisma.challenge.update({
    where: { id: challengeId },
    data: { status: ChallengeStatus.dispute_window_open, aiModel: aiModelLabel },
  });
  assertChallengeTransition(ChallengeStatus.dispute_window_open, ChallengeStatus.finalized);
  await prisma.challenge.update({
    where: { id: challengeId },
    data: { status: ChallengeStatus.finalized, aiModel: aiModelLabel },
  });

  if (challenge.stake > 0) {
    const stakeToken = normalizeStakeToken(challenge.stakeToken);
    if (!isStakeTokenAllowed(stakeToken, null)) {
      settlementResult = {
        success: false,
        error: JSON.stringify(moneyModeBlock(stakeToken, null)),
      };
    } else {
    settlementResult = await settleChallenge(
      challengeId,
      result.winnerId,
      challenge.stake,
      challenge.participants.map((p) => ({ userId: p.userId })),
      { reasoning: result.reasoning, confidence: result.confidence },
    );
    }

    if (!settlementResult.success) {
      // Settlement failed (chain reverted, out of gas, ledger failed, etc.)
      // Stay finalized and do not mark as settled.
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
  const fromStatus = ChallengeStatus.finalized;
  const finalStatus = result.winnerId
    ? ChallengeStatus.settled
    : challenge.stake > 0
      ? ChallengeStatus.refunded
      : ChallengeStatus.voided;
  assertChallengeTransition(fromStatus, finalStatus);

  // Use updateMany with status guard to prevent race-condition double-settle
  const updateResult = await prisma.challenge.updateMany({
    where: { id: challengeId, status: fromStatus },
    data: { status: finalStatus, aiModel: aiModelLabel },
  });

  if (updateResult.count === 0) {
    // Another process already moved the status — log and continue gracefully
    await appendAuditLog({
      action: AuditActions.CHALLENGE_STATUS,
      actorUserId: payerUserId,
      challengeId,
      payload: {
        event: "duplicate_settlement_skipped",
        expectedStatus: fromStatus,
        judgmentId: judgment.id,
      },
    });
  }
  if (updateResult.count > 0) {
    await cleanupChallengeFrameBlobs(challengeId);
  }

  await appendAuditLog({
    action: AuditActions.JUDGMENT_COMPLETED,
    actorUserId: payerUserId,
    challengeId,
    payload: {
      winnerId: result.winnerId,
      judgmentId: judgment.id,
      confidence: result.confidence,
      settlementOk: settlementResult.success,
      source: result.source,
      providerCall: providerCallAudit,
      evidenceQuality,
      recommendation,
      settlementRecommendation: recommendation,
      blockingIssues,
      protocolCompliance: protocolGates.protocolCompliance,
      identityResult: protocolGates.identityResult,
      evidenceResult: protocolGates.evidenceResult,
      settlementEligibility: protocolGates.settlementEligibility,
      autoSettleEligible: autoSettlePolicy.eligible,
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
