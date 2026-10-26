/**
 * Internal read-only XP provenance audit. NO reward side effects, no
 * user-triggerable endpoint, no automatic award after settlement.
 *
 * This produces CANDIDATES for separate anti-collusion/manual assessment.
 * It MUST NOT be interpreted as proof of liveness, legitimate match result
 * or permission to mint an XP event / Summon ticket.
 */
import prisma from "@/lib/db";
import {
  evaluateTrustedXpAdmission,
  TRUSTED_XP_PAIR_WINDOW_DAYS,
  type TrustedXpAdmission,
} from "./trusted-xp-admission";

export type TrustedXpAudit = TrustedXpAdmission & {
  challengeId: string;
  userId: string;
  basis: "private-video-review-v1";
  xpGranted: false;
  ticketsGranted: 0;
  ownedSummonsGranted: 0;
};

export async function assessTrustedQuestXpForManualReview(input: {
  challengeId: string;
  userId: string;
}): Promise<TrustedXpAudit> {
  const wrap = (blockers: string[]): TrustedXpAudit => ({
    challengeId: input.challengeId,
    userId: input.userId,
    basis: "private-video-review-v1",
    admittedForManualReview: false,
    blockers,
    xpGranted: false,
    ticketsGranted: 0,
    ownedSummonsGranted: 0,
  });
  if (process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS !== "true") {
    return wrap(["trusted_uploads_not_enabled"]);
  }
  if (!input.challengeId?.trim() || !input.userId?.trim()) {
    return wrap(["invalid_quest_or_user"]);
  }

  // A read-only snapshot: never use a browser-supplied hash/proof flag.
  return prisma.$transaction(async tx => {
    const quest = await tx.challenge.findUnique({
      where: { id: input.challengeId },
      select: {
        id: true, creatorId: true, status: true, evidenceType: true,
        participants: { select: { userId: true, role: true, status: true } },
        evidence: { select: { id: true, userId: true, type: true } },
        judgments: { where: { status: "completed" }, orderBy: { createdAt: "desc" },
          select: { id: true, winnerId: true, confidence: true } },
        verdictResponses: { select: { userId: true, decision: true } },
        reviewCase: { select: {
          status: true, resolution: true, resolvedWinnerId: true,
          finalJudgmentId: true,
        } },
      },
    });
    if (!quest) return wrap(["quest_not_found"]);
    const players = quest.participants.filter(player =>
      ["creator", "opponent"].includes(player.role) &&
      ["accepted", "completed"].includes(player.status));
    if (!players.some(player => player.userId === input.userId)) {
      return wrap(["not_a_competitor"]);
    }
    const other = players.find(player => player.userId !== input.userId);
    if (!other) return wrap(["two_distinct_players_required"]);

    const evidenceIds = quest.evidence.map(row => row.id);
    const uploads = await tx.trustedEvidenceUpload.findMany({
      where: { challengeId: quest.id, evidenceId: { in: evidenceIds } },
      select: {
        id: true, challengeId: true, evidenceId: true, userId: true,
        status: true, sha256: true, contentType: true,
        expectedSizeBytes: true, observedSizeBytes: true,
        verifiedAt: true, consumedAt: true,
      },
    });

    const digests = uploads.map(upload => upload.sha256).filter(
      (value): value is string => typeof value === "string" &&
        /^[a-f0-9]{64}$/i.test(value),
    );
    const duplicated = digests.length > 0 ?
      await tx.trustedEvidenceUpload.count({
        where: {
          challengeId: { not: quest.id }, status: "consumed",
          sha256: { in: digests },
        },
      }) : 0;

    const since = new Date(Date.now() - TRUSTED_XP_PAIR_WINDOW_DAYS * 24 * 3600 * 1000);
    const recentXp = await tx.professionXpEvent.findMany({
      where: {
        ownerId: input.userId, awardType: "verified_quest",
        createdAt: { gte: since }, challengeId: { not: quest.id },
      },
      select: {
        challenge: {
          select: {
            participants: { select: { userId: true, role: true, status: true } },
          },
        },
      },
      take: 101,
    });
    // Only full result sets can establish a rate limit. Large histories
    // are sent to manual review rather than treated as zero.
    const historicPairCount = recentXp.length > 100
      ? Number.POSITIVE_INFINITY
      : recentXp.filter(event => event.challenge?.participants.some(
        p => p.userId === other.userId &&
          ["creator", "opponent"].includes(p.role) &&
          ["accepted", "completed"].includes(p.status),
      )).length;

    const review = quest.reviewCase;
    const reviewResolved = review?.status === "resolved" &&
      ["uphold", "override"].includes(review.resolution ?? "") &&
      Boolean(review.resolvedWinnerId) &&
      (review.resolution !== "override" || Boolean(review.finalJudgmentId));

    const receipt = review?.finalJudgmentId
      ? quest.judgments.find(j => j.id === review.finalJudgmentId)
      : quest.judgments[0];
    const validWinner = receipt && (!reviewResolved ||
      review?.resolvedWinnerId === receipt.winnerId);
    const admission = evaluateTrustedXpAdmission({
      challengeId: quest.id,
      creatorId: quest.creatorId,
      status: quest.status,
      evidenceType: quest.evidenceType,
      players,
      proofs: quest.evidence,
      uploads,
      winningUserId: validWinner ? receipt.winnerId : null,
      judgmentId: validWinner ? receipt.id : null,
      confidence: receipt?.confidence ?? null,
      reviewResolved: Boolean(reviewResolved),
      acceptedVerdictUserIds: quest.verdictResponses
        .filter(row => row.decision === "accepted").map(row => row.userId),
      pastSamePairXpAwards: historicPairCount,
      reusedMediaHashesInOtherQuests: duplicated,
    });
    return {
      ...admission,
      challengeId: quest.id,
      userId: input.userId,
      basis: "private-video-review-v1" as const,
      xpGranted: false as const,
      ticketsGranted: 0 as const,
      ownedSummonsGranted: 0 as const,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
