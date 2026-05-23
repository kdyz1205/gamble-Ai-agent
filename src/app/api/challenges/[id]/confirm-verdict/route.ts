import { after, NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { settleChallenge } from "@/lib/credits";
import { ChallengeStatus, type ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";
import {
  VERDICT_READY_STATUSES,
  assertChallengeTransition,
  isVerdictReadyStatus,
} from "@/lib/challenge-state-machine";
import {
  evaluateAutoSettleEligibility,
  requiresHoldDurationWinnerFromText,
  requiresRepCountWinnerFromText,
  type EvidenceQuality,
  type VerdictRecommendation,
} from "@/lib/judgment-policy";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import {
  combineAutoSettlePolicyWithProtocolGates,
  evaluateProtocolJudgmentGates,
} from "@/lib/protocol-judgment-policy";
import { cleanupChallengeFrameBlobs } from "@/lib/media/blob-cleanup";
import { isStakeTokenAllowed, moneyModeBlock, normalizeStakeToken, paymentJurisdictionFromRequest } from "@/lib/payment-policy";

export const runtime = "nodejs";

function readMetricsJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

/**
 * POST /api/challenges/[id]/confirm-verdict
 *
 * Confirms the latest completed AI recommendation and performs settlement.
 * The AI recommends; the creator makes the final product action explicit.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  try {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        participants: { where: { status: "accepted" } },
        evidence: true,
        evidenceChecks: true,
        participantBindings: true,
        protocol: true,
        judgments: {
          where: { method: "ai", status: "completed" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { winner: { select: { id: true, username: true } } },
        },
      },
    });

    if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
    if (challenge.creatorId !== user.userId) {
      return Response.json({ error: "Only the creator can confirm the AI recommendation" }, { status: 403 });
    }
    if (challenge.status === ChallengeStatus.settled) {
      return Response.json({ error: "Challenge is already settled" }, { status: 409 });
    }

    const status = challenge.status as ChallengeStatusValue;
    if (!isVerdictReadyStatus(status)) {
      return Response.json({ error: "No confirmable AI recommendation for this challenge" }, { status: 400 });
    }

    const judgment = challenge.judgments[0];
    if (!judgment) {
      return Response.json({ error: "No completed AI recommendation found" }, { status: 400 });
    }

    const metrics = readMetricsJson(judgment.metricsJson);
    const evidenceQuality =
      typeof metrics.evidenceQuality === "string"
        ? metrics.evidenceQuality
        : judgment.winnerId && (judgment.confidence ?? 0) >= 0.85 ? "good" : "unclear";
    const recommendation =
      typeof metrics.recommendation === "string"
        ? metrics.recommendation
        : typeof metrics.settlementRecommendation === "string"
          ? metrics.settlementRecommendation
          : judgment.winnerId && (judgment.confidence ?? 0) >= 0.85 ? "settle_winner" : "needs_review";
    const persistedBlockingIssues = stringArray(metrics.blockingIssues);
    const confidence = judgment.confidence ?? 0;
    const opponent = challenge.participants.find((p) => p.role === "opponent");
    const reconstructedResult = {
      winnerId: judgment.winnerId,
      reasoning: judgment.reasoning ?? "",
      confidence,
      evidenceQuality: evidenceQuality as EvidenceQuality,
      recommendation: recommendation as VerdictRecommendation,
      blockingIssues: persistedBlockingIssues,
      source: typeof metrics.source === "string" ? metrics.source as "deterministic" | "vision_llm" | "llm" | "fallback" : undefined,
      videoMetrics: metrics.videoMetrics as never,
    };
    const aiOnlyPolicy = evaluateAutoSettleEligibility(
      reconstructedResult,
      {
        requiresVision: challenge.evidenceType === "video",
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
        participantAId: challenge.creatorId,
        participantBId: opponent?.userId ?? null,
      },
    );
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
      result: reconstructedResult,
    });
    const policy = combineAutoSettlePolicyWithProtocolGates(aiOnlyPolicy, protocolGates);
    const blockingIssues = policy.blockingIssues;
    const persistedEligible = metrics.autoSettleEligible !== false;
    const persistedProtocolEligible =
      !metrics.settlementEligibility ||
      (typeof metrics.settlementEligibility === "object" &&
        metrics.settlementEligibility !== null &&
        (metrics.settlementEligibility as { eligible?: unknown }).eligible !== false);
    const settlementAllowed = policy.eligible && persistedEligible && persistedProtocolEligible;

    if (!settlementAllowed) {
      await prisma.challenge.update({
        where: { id },
        data: { status: ChallengeStatus.manual_review_required },
      });
      return Response.json(
        {
          error: "AI recommendation is not eligible for settlement.",
          verdictGuardrail: {
            recommendation,
            confidence,
            evidenceQuality,
            winnerId: judgment.winnerId,
            blockingIssues,
            autoSettleEligible: persistedEligible,
            protocolCompliance: protocolGates.protocolCompliance,
            identityResult: protocolGates.identityResult,
            evidenceResult: protocolGates.evidenceResult,
            settlementEligibility: protocolGates.settlementEligibility,
          },
          challenge: { id, status: ChallengeStatus.manual_review_required },
          judgment,
        },
        { status: 400 },
      );
    }

    assertChallengeTransition(status, ChallengeStatus.finalized);

    const claim = await prisma.challenge.updateMany({
      where: {
        id,
        status: { in: [...VERDICT_READY_STATUSES] },
      },
      data: { status: ChallengeStatus.finalized },
    });
    if (claim.count === 0) {
      return Response.json(
        { error: "This challenge is already being finalized by another request." },
        { status: 409 },
      );
    }

    let settlement: { success: boolean; txHash?: string; error?: string } = { success: true };
    if (challenge.stake > 0) {
      const stakeToken = normalizeStakeToken(challenge.stakeToken);
      const paymentJurisdiction = paymentJurisdictionFromRequest(req);
      if (!isStakeTokenAllowed(stakeToken, paymentJurisdiction)) {
        return Response.json(moneyModeBlock(stakeToken, paymentJurisdiction), { status: 403 });
      }
      settlement = await settleChallenge(
        id,
        judgment.winnerId,
        challenge.stake,
        challenge.participants.map((p) => ({ userId: p.userId })),
      );

      if (!settlement.success) {
        return Response.json(
          {
            error: settlement.error || "Settlement failed",
            settlement,
            challenge: { id, status: ChallengeStatus.finalized },
          },
          { status: 502 },
        );
      }
    }

    const finalStatus = judgment.winnerId
      ? ChallengeStatus.settled
      : challenge.stake > 0
        ? ChallengeStatus.refunded
        : ChallengeStatus.voided;
    assertChallengeTransition(ChallengeStatus.finalized, finalStatus);

    const updated = await prisma.challenge.update({
      where: { id },
      data: { status: finalStatus },
      include: {
        creator: { select: { id: true, username: true, image: true } },
        participants: { include: { user: { select: { id: true, username: true, image: true } } } },
        evidence: { include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
        judgments: { include: { winner: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
        _count: { select: { evidence: true, participants: true } },
      },
    });
    after(async () => {
      await cleanupChallengeFrameBlobs(id);
    });

    const winnerName = judgment.winner?.username || "No winner";
    await prisma.activityEvent.create({
      data: {
        type: finalStatus === ChallengeStatus.settled ? "challenge_settled" : "challenge_voided",
        message:
          finalStatus === ChallengeStatus.settled
            ? `"${challenge.title}" confirmed by ${user.username}; ${winnerName} wins${challenge.stake > 0 ? ` ${challenge.stake} credits` : ""}.`
            : `"${challenge.title}" finalized with no winner; ${challenge.stake > 0 ? "credits refunded" : "challenge voided"}.`,
        userId: judgment.winnerId,
        challengeId: id,
      },
    });

    return Response.json({ challenge: updated, judgment, settlement });
  } catch (err) {
    console.error(`[confirm-verdict ${id}] uncaught:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Confirm verdict failed" },
      { status: 500 },
    );
  }
}
