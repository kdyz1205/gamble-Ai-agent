import { after, NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, getAiModel, unauthorized, noCredits, type TierId } from "@/lib/auth";
import { judgeChallenge } from "@/lib/ai-engine";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";
import { addCredits, getCredits, settleChallenge, spendForInference, TIER_MULTIPLIER } from "@/lib/credits";
import { spendDailyAiQuota, refundDailyAiQuota, type DailyAiQuotaStatus } from "@/lib/daily-ai-quota";
import { ChallengeStatus } from "@/lib/enums";
import {
  assertChallengeTransition,
  isAiReviewStatus,
  isTerminalStatus,
  isVerdictReadyStatus,
} from "@/lib/challenge-state-machine";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import { cleanupChallengeFrameBlobs } from "@/lib/media/blob-cleanup";
import { logAiUsage } from "@/lib/ai-usage-log";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import {
  combineAutoSettlePolicyWithProtocolGates,
  evaluateProtocolJudgmentGates,
} from "@/lib/protocol-judgment-policy";
import {
  buildJudgmentMetricsJson,
  evaluateAutoSettleEligibility,
  effectiveJudgmentVerdictFields,
  blockingIssuesForJudgment,
  requiresRepCountWinnerFromText,
  statusForJudgmentResult,
  type EvidenceQuality,
  type VerdictRecommendation,
  type VerdictStatus,
} from "@/lib/judgment-policy";

/**
 * POST /api/challenges/[id]/judge
 * Body: { tier?: 1|2|3, autoSettle?: boolean }
 *
 * Burn 1 model token of the chosen tier, then AI writes a strict verdict.
 * In auto-settle mode, a high-confidence winner settles credits on this route.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let tierId: TierId = 1;
  let providerIdOverride: string | undefined;
  let modelOverride: string | undefined;
  let autoSettleRequested = false;
  let rejudgeRequested = false;
  let rejudgeReason = "";
  try {
    const body = await req.json();
    if ([1, 2, 3].includes(body?.tier)) tierId = body.tier as TierId;
    if (typeof body?.providerId === "string") providerIdOverride = body.providerId;
    if (typeof body?.model === "string") modelOverride = body.model;
    autoSettleRequested = body?.autoSettle === true;
    rejudgeRequested = body?.rejudge === true;
    if (typeof body?.reason === "string") rejudgeReason = body.reason.trim().slice(0, 500);
  } catch { /* default to the Light tier */ }

  const cost = TIER_MULTIPLIER[tierId];

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      participants: {
        where: { status: "accepted" },
        include: { user: { select: { id: true, username: true } } },
      },
      evidence: true,
      evidenceChecks: true,
      participantBindings: true,
      protocol: true,
      _count: { select: { judgments: true } },
    },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId) return Response.json({ error: "Only the creator can trigger judgment" }, { status: 403 });
  if (isTerminalStatus(challenge.status)) {
    return Response.json({ error: "Terminal challenges cannot be rejudged after settlement/refund/void." }, { status: 409 });
  }
  const isRejudge = rejudgeRequested && isVerdictReadyStatus(challenge.status) && challenge._count.judgments > 0;
  if (!isAiReviewStatus(challenge.status) && !isRejudge) {
    return Response.json(
      { error: rejudgeRequested ? "No previous AI verdict is available to rejudge." : "Not ready for judgment" },
      { status: 400 },
    );
  }

  // Free Mode: when the challenge has no stake, AI judgment is free.
  // Paid challenges still charge the user's credits for the judgment inference.
  const isFreeChallenge = (challenge.stake ?? 0) === 0;
  const evidenceType = String(challenge.evidenceType ?? "").toLowerCase();
  const isVideoJudgment =
    evidenceType.includes("video") ||
    challenge.evidence.some((e) => String(e.type ?? "").toLowerCase() === "video");
  const quotaKind = isVideoJudgment ? "video_judge" : "judge";

  let inferenceSpendCharged = false;
  if (!isFreeChallenge) {
    const balance = await getCredits(user.userId);
    if (balance < cost) return noCredits(cost, balance, getAiModel(tierId).displayName);
  }

  const quota = await spendDailyAiQuota(user.userId, quotaKind);
  if (!quota.ok) {
    return Response.json(
      { error: quota.error, dailyQuota: quota.status, retryAt: quota.retryAt },
      { status: 429 },
    );
  }
  let dailyQuotaStatus: DailyAiQuotaStatus = quota.status;

  if (!isFreeChallenge) {
    const spend = await spendForInference(
      user.userId,
      tierId,
      "judge",
      `${isRejudge ? "Rejudge" : "Judge"}: "${challenge.title.slice(0, 40)}"`,
      id,
    );
    if (!spend.success) {
      dailyQuotaStatus = await refundDailyAiQuota(user.userId, quotaKind);
      return noCredits(cost, spend.balance, getAiModel(tierId).displayName);
    }
    inferenceSpendCharged = true;
  }

  const judgeStartStatus = isRejudge ? ChallengeStatus.judging : challenge.status;
  if (isRejudge) {
    if (challenge.status !== ChallengeStatus.disputed) {
      assertChallengeTransition(challenge.status, ChallengeStatus.disputed);
      await prisma.challenge.update({
        where: { id },
        data: { status: ChallengeStatus.disputed },
      });
    }
    assertChallengeTransition(ChallengeStatus.disputed, ChallengeStatus.judging);
    await prisma.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.judging },
    });
    await appendAuditLog({
      action: "judgment.rejudge_requested",
      actorUserId: user.userId,
      challengeId: id,
      payload: {
        previousStatus: challenge.status,
        reason: rejudgeReason || "Creator requested another AI judgment.",
        tierId,
        providerId: providerIdOverride ?? null,
        model: modelOverride ?? null,
      },
    });
  }

  const creator = challenge.participants.find((p: { role: string }) => p.role === "creator");
  const opponent = challenge.participants.find((p: { role: string }) => p.role === "opponent");
  if (!creator) return Response.json({ error: "Creator not found" }, { status: 400 });

  const evidenceA = challenge.evidence.find((e: { userId: string }) => e.userId === creator.userId);
  const evidenceB = opponent ? challenge.evidence.find((e: { userId: string }) => e.userId === opponent.userId) : null;
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

  const aiModel = getAiModel(tierId);
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const bothHaveVideoUrl =
    evidenceA?.type === "video" &&
    evidenceB?.type === "video" &&
    Boolean(String(evidenceA?.url ?? "").trim()) &&
    Boolean(String(evidenceB?.url ?? "").trim());
  const googleVisionReady =
    Boolean(process.env.GOOGLE_AI_API_KEY) && Boolean(getProviderById("google"));
  const providerId =
    providerIdOverride && getProviderById(providerIdOverride)
      ? providerIdOverride
      : !providerIdOverride && bothHaveVideoUrl && googleVisionReady
        ? "google"
        : envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const pdef = getProviderById(providerId);
  // tier model names are Claude IDs; only valid when routing to Anthropic.
  // For other providers, fall back to that provider's default model so the
  // call doesn't 404 and silently degrade to the random-winner fallback.
  const judgeModel =
    modelOverride?.trim() ||
    (!providerIdOverride && !modelOverride && bothHaveVideoUrl && googleVisionReady
      ? "gemini-2.0-flash"
      : pdef?.id === "anthropic"
        ? aiModel.model
        : (pdef?.defaultModel ?? aiModel.model));
  const aiModelLabel = `${pdef?.shortLabel ?? aiModel.displayName} · ${judgeModel}`;

  const result = await judgeChallenge({
    title: challenge.title,
    description: challenge.description,
    type: challenge.type,
    deadlineIso: challenge.deadline?.toISOString() ?? null,
    rules: challenge.rules,
    evidencePolicy: challenge.evidenceType,
    evidenceA: evidenceA
      ? {
          description: evidenceA.description,
          type: evidenceA.type,
          url: evidenceA.url,
          metadata: parseMetadata(evidenceA.metadata),
          preparedFrames: parseFrames(evidenceA.preparedFrames),
          preparedDurationSec: evidenceA.preparedDurationSec,
          preparedMode: evidenceA.preparedMode,
        }
      : null,
    evidenceB: evidenceB
      ? {
          description: evidenceB.description,
          type: evidenceB.type,
          url: evidenceB.url,
          metadata: parseMetadata(evidenceB.metadata),
          preparedFrames: parseFrames(evidenceB.preparedFrames),
          preparedDurationSec: evidenceB.preparedDurationSec,
          preparedMode: evidenceB.preparedMode,
        }
      : null,
    participantAId: creator.userId,
    participantBId: opponent?.userId ?? null,
    model: judgeModel,
    providerId,
    livenessPrompt: challenge.livenessPrompt,
  });
  const requiresVision = challenge.evidenceType === "video" || bothHaveVideoUrl;
  const judgmentPolicyOptions = {
    requiresVision,
    requiresRepCountWinner: requiresRepCountWinnerFromText(
      challenge.title,
      challenge.description,
      challenge.proposition,
      challenge.rules,
    ),
    participantAId: creator.userId,
    participantBId: opponent?.userId ?? null,
  };
  const protocol = challenge.protocol?.specJson
    ? (() => {
        try {
          return parseProtocolSpecV2(JSON.parse(challenge.protocol.specJson));
        } catch {
          return null;
        }
      })()
    : null;
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
  const effectiveAiModelLabel =
    result.source === "deterministic"
      ? "Deterministic · objective-answer-v1"
      : result.source === "fallback"
        ? "Fallback - no-settlement-v1"
        : aiModelLabel;
  const providerCallAudit = result.providerCall ? JSON.parse(JSON.stringify(result.providerCall)) : null;
  await logAiUsage({
    userId: user.userId,
    challengeId: id,
    route: "/api/challenges/[id]/judge",
    metadata: result.providerCall ?? null,
    extra: { source: result.source ?? "llm", tierId, autoSettleRequested },
  });

  let inferenceRefunded = false;
  if (result.source === "fallback" && inferenceSpendCharged) {
    await addCredits(
      user.userId,
      cost,
      "refund",
      `AI judge refunded - no usable model verdict for "${challenge.title.slice(0, 40)}"`,
      id,
    );
    inferenceRefunded = true;
  }

  const shouldAutoSettle =
    autoSettlePolicy.eligible &&
    (
      autoSettleRequested ||
      process.env.AI_VERDICT_MODE === "auto_settle" ||
      /auto[_-]?settle/i.test(String(challenge.settlementMode ?? ""))
    );

  const judgment = await prisma.judgment.create({
    data: {
      challengeId: id,
      winnerId: result.winnerId,
      method: "ai",
      aiModel: effectiveAiModelLabel,
      reasoning: result.reasoning,
      confidence: result.confidence,
      status: "completed",
      metricsJson: buildJudgmentMetricsJson(result, {
        model: effectiveAiModelLabel,
        autoSettlePolicy,
        status: verdictStatus,
        protocolGates,
      }),
    },
    include: { winner: { select: { id: true, username: true } } },
  });

  const winnerName = judgment.winner?.username || "No one";
  const verdict = {
    status: verdictStatus,
    winnerId: result.winnerId,
    confidence: result.confidence,
    reasoning: result.reasoning,
    evidenceQuality,
    recommendation,
    settlementRecommendation: recommendation,
    source: result.source ?? "llm",
    providerCall: providerCallAudit,
    videoMetrics: result.videoMetrics ?? null,
    autoSettleEligible: autoSettlePolicy.eligible,
    autoSettleBlockReason: autoSettlePolicy.reason,
    blockingIssues,
    protocolCompliance: protocolGates.protocolCompliance,
    identityResult: protocolGates.identityResult,
    evidenceResult: protocolGates.evidenceResult,
    settlementEligibility: protocolGates.settlementEligibility,
  } satisfies {
    status: VerdictStatus;
    winnerId: string | null;
    confidence: number;
    reasoning: string;
    evidenceQuality: EvidenceQuality;
    recommendation: VerdictRecommendation;
    settlementRecommendation: VerdictRecommendation;
    source: string;
    providerCall: unknown;
    videoMetrics: unknown;
    autoSettleEligible: boolean;
    autoSettleBlockReason: string | null;
    blockingIssues: string[];
    protocolCompliance: unknown;
    identityResult: unknown;
    evidenceResult: unknown;
    settlementEligibility: unknown;
  };

  if (!shouldAutoSettle) {
    await prisma.challenge.update({
      where: { id },
      data: { status: verdictStatus, aiModel: effectiveAiModelLabel },
    });

    await appendAuditLog({
      action: AuditActions.JUDGMENT_COMPLETED,
      actorUserId: user.userId,
      challengeId: id,
      payload: {
        winnerId: result.winnerId,
        judgmentId: judgment.id,
        confidence: result.confidence,
        settlementOk: false,
        reviewRequired: verdictStatus !== ChallengeStatus.ai_verdict_ready,
        newStatus: verdictStatus,
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
        rejudge: isRejudge,
        rejudgeReason: rejudgeReason || null,
        inferenceRefunded,
        reasoning: result.reasoning?.slice(0, 500),
      },
    });

    await prisma.activityEvent.create({
      data: {
        type: "challenge_verdict_recommended",
        message: `"${challenge.title}" has an AI recommendation from ${effectiveAiModelLabel}: ${winnerName} wins. Creator confirmation required.`,
        userId: result.winnerId,
        challengeId: id,
      },
    });

    const postBalance = isFreeChallenge || inferenceRefunded ? await getCredits(user.userId) : undefined;

    return Response.json({
      ...verdict,
      verdict,
      judgment,
      settlement: { success: false, error: "Manual confirmation required" },
      challenge: { id, status: verdictStatus },
      model: effectiveAiModelLabel,
      tierId,
      creditsUsed: isFreeChallenge ? 0 : cost,
      creditsRefunded: inferenceRefunded ? cost : 0,
      creditsRemaining: isFreeChallenge || inferenceRefunded ? postBalance : undefined,
      dailyQuota: dailyQuotaStatus,
      txHash: null,
      freeMode: isFreeChallenge,
    });
  }

  assertChallengeTransition(judgeStartStatus, ChallengeStatus.ai_verdict_ready);
  await prisma.challenge.update({
    where: { id },
    data: { status: ChallengeStatus.ai_verdict_ready, aiModel: effectiveAiModelLabel },
  });
  assertChallengeTransition(ChallengeStatus.ai_verdict_ready, ChallengeStatus.dispute_window_open);
  await prisma.challenge.update({
    where: { id },
    data: { status: ChallengeStatus.dispute_window_open, aiModel: effectiveAiModelLabel },
  });
  assertChallengeTransition(ChallengeStatus.dispute_window_open, ChallengeStatus.finalized);
  await prisma.challenge.update({
    where: { id },
    data: { status: ChallengeStatus.finalized, aiModel: effectiveAiModelLabel },
  });

  let settlement: { success: boolean; txHash?: string; error?: string } = { success: true };
  if (challenge.stake > 0) {
    settlement = await settleChallenge(
      id,
      result.winnerId,
      challenge.stake,
      challenge.participants.map((p: { userId: string }) => ({ userId: p.userId })),
    );
    if (!settlement.success) {
      await appendAuditLog({
        action: AuditActions.JUDGMENT_COMPLETED,
        actorUserId: user.userId,
        challengeId: id,
        payload: {
          winnerId: result.winnerId,
          judgmentId: judgment.id,
          confidence: result.confidence,
          settlementOk: false,
          settlementError: settlement.error,
          source: result.source,
          providerCall: providerCallAudit,
          reasoning: result.reasoning?.slice(0, 500),
        },
      });
      return Response.json(
        {
          error: settlement.error || "Settlement failed",
          ...verdict,
          verdict,
          judgment,
          settlement,
          challenge: { id, status: ChallengeStatus.finalized },
          model: effectiveAiModelLabel,
          tierId,
          creditsUsed: isFreeChallenge ? 0 : cost,
          creditsRefunded: inferenceRefunded ? cost : 0,
          dailyQuota: dailyQuotaStatus,
          freeMode: isFreeChallenge,
        },
        { status: 502 },
      );
    }
  }

  assertChallengeTransition(ChallengeStatus.finalized, ChallengeStatus.settled);
  await prisma.challenge.update({
    where: { id },
    data: { status: ChallengeStatus.settled, aiModel: effectiveAiModelLabel },
  });
  after(async () => {
    await cleanupChallengeFrameBlobs(id);
  });

  await appendAuditLog({
    action: AuditActions.JUDGMENT_COMPLETED,
    actorUserId: user.userId,
    challengeId: id,
    payload: {
      winnerId: result.winnerId,
      judgmentId: judgment.id,
      confidence: result.confidence,
      settlementOk: settlement.success,
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
      rejudge: isRejudge,
      rejudgeReason: rejudgeReason || null,
      inferenceRefunded,
      reasoning: result.reasoning?.slice(0, 500),
    },
  });

  await prisma.activityEvent.create({
    data: {
      type: "challenge_settled",
      message: `"${challenge.title}" judged by ${effectiveAiModelLabel}; ${winnerName} wins${challenge.stake > 0 ? ` ${challenge.stake} credits` : ""}.`,
      userId: result.winnerId,
      challengeId: id,
    },
  });

  const postBalance = isFreeChallenge || inferenceRefunded ? await getCredits(user.userId) : undefined;

  return Response.json({
    ...verdict,
    status: ChallengeStatus.settled,
    verdict: { ...verdict, status: ChallengeStatus.settled },
    judgment,
    settlement,
    challenge: { id, status: ChallengeStatus.settled },
    model: effectiveAiModelLabel,
    tierId,
    creditsUsed: isFreeChallenge ? 0 : cost,
    creditsRefunded: inferenceRefunded ? cost : 0,
    creditsRemaining: isFreeChallenge || inferenceRefunded ? postBalance : undefined,
    dailyQuota: dailyQuotaStatus,
    txHash: settlement.txHash ?? null,
    freeMode: isFreeChallenge,
  });
}
