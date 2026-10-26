/**
 * Two-person administrative clearance for verified-media profession XP.
 *
 * This is deliberately separate from proof upload, AI review, consent and
 * settlement. A moderator cannot authorize their own Quest. Approval does
 * not mint XP, a ticket or a Familiar. Award-time reconciliation re-reads
 * all authoritative receipt/media state inside the same DB transaction.
 */
import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { assessTrustedQuestXpWithTx } from "./trusted-xp-audit";

export const MANUAL_XP_APPROVAL_VERSION = "private-proof-manual-xp-v1";
const ADVISORY_SCOPE = 843220;

export class ManualXpApprovalError extends Error {
  constructor(public readonly reason: string, public readonly status = 409) {
    super(reason);
    this.name = "ManualXpApprovalError";
  }
}

export function manualXpApprovalEnabled(): boolean {
  return process.env.SUMMON_PERSISTENCE_ENABLED === "true" &&
    process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS === "true" &&
    process.env.SUMMON_XP_MANUAL_REVIEW_ENABLED === "true";
}

export function validateManualReviewReason(reason: string): string {
  if (typeof reason !== "string" ||
      reason.trim().length < 25 || reason.trim().length > 1000) {
    throw new ManualXpApprovalError("Review explanation must be 25–1000 characters", 400);
  }
  return reason.trim();
}

/** Used identically by reviewer approval, revocation and XP issuance. */
export async function lockManualXpReview(
  tx: Prisma.TransactionClient, challengeId: string, ownerId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId + ":" + ownerId}, ${ADVISORY_SCOPE}))`;
}

async function requireIndependentModerator(
  tx: Prisma.TransactionClient, reviewerId: string, challengeId: string,
): Promise<void> {
  const reviewer = await tx.user.findUnique({
    where: { id: reviewerId }, select: { id: true, isReviewer: true },
  });
  if (!reviewer?.isReviewer) {
    throw new ManualXpApprovalError("Independent authorized reviewer required", 403);
  }
  const participant = await tx.participant.findFirst({
    where: { challengeId, userId: reviewerId,
      role: { in: ["creator", "opponent"] } },
    select: { id: true },
  });
  if (participant) {
    throw new ManualXpApprovalError("A competing player cannot review their own Quest", 403);
  }
}

export async function approveTrustedQuestXpForReview(input: {
  challengeId: string;
  ownerId: string;
  reviewerId: string;
  reason: string;
}) {
  if (!manualXpApprovalEnabled()) {
    throw new ManualXpApprovalError("Manual XP approval is disabled", 503);
  }
  const reason = validateManualReviewReason(input.reason);
  if (!input.challengeId?.trim() || !input.ownerId?.trim() || !input.reviewerId?.trim()) {
    throw new ManualXpApprovalError("Challenge, owner and reviewer required", 400);
  }
  return prisma.$transaction(async tx => {
    await lockManualXpReview(tx, input.challengeId, input.ownerId);
    await requireIndependentModerator(tx, input.reviewerId, input.challengeId);
    const audit = await assessTrustedQuestXpWithTx(tx, {
      challengeId: input.challengeId, userId: input.ownerId,
    });
    if (!audit.admittedForManualReview || !audit.finalJudgmentId ||
        !audit.sourceFingerprint) {
      throw new ManualXpApprovalError(
        "Proof/consent/anti-farm source not approved: " + audit.blockers.join(","),
      );
    }
    const existing = await tx.verifiedXpApproval.findUnique({
      where: { challengeId_ownerId: {
        challengeId: input.challengeId, ownerId: input.ownerId,
      } },
    });
    if (existing) {
      if (existing.status === "approved" && !existing.revokedAt &&
          existing.sourceFingerprint === audit.sourceFingerprint &&
          existing.finalJudgmentId === audit.finalJudgmentId &&
          existing.reviewerUserId === input.reviewerId &&
          existing.policyVersion === MANUAL_XP_APPROVAL_VERSION) {
        return { approvalId: existing.id, reused: true, status: "approved" as const,
          issuedXp: false as const, issuedTickets: 0 as const,
          issuedSummons: 0 as const };
      }
      throw new ManualXpApprovalError(
        "Previous independent review conflicts or was revoked; manual reconciliation required",
      );
    }
    const approval = await tx.verifiedXpApproval.create({
      data: {
        challengeId: input.challengeId, ownerId: input.ownerId,
        reviewerUserId: input.reviewerId,
        sourceFingerprint: audit.sourceFingerprint,
        finalJudgmentId: audit.finalJudgmentId,
        policyVersion: MANUAL_XP_APPROVAL_VERSION,
        reason,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "summon.xp.review.approved",
        actorUserId: input.reviewerId, targetUserId: input.ownerId,
        challengeId: input.challengeId,
        payload: JSON.stringify({
          approvalId: approval.id,
          sourceFingerprint: audit.sourceFingerprint,
          finalJudgmentId: audit.finalJudgmentId,
          ruleVersion: MANUAL_XP_APPROVAL_VERSION,
          xpIssued: false, ticketsIssued: 0, summonsIssued: 0,
        }),
      },
    });
    return { approvalId: approval.id, reused: false, status: "approved" as const,
      issuedXp: false as const, issuedTickets: 0 as const,
      issuedSummons: 0 as const };
  }, { maxWait: 15000, timeout: 30000 });
}

export async function revokeTrustedQuestXpReview(input: {
  challengeId: string;
  ownerId: string;
  reviewerId: string;
  reason: string;
}) {
  if (!manualXpApprovalEnabled()) {
    throw new ManualXpApprovalError("Manual XP approval is disabled", 503);
  }
  const reason = validateManualReviewReason(input.reason);
  return prisma.$transaction(async tx => {
    await lockManualXpReview(tx, input.challengeId, input.ownerId);
    await requireIndependentModerator(tx, input.reviewerId, input.challengeId);
    const current = await tx.verifiedXpApproval.findUnique({
      where: { challengeId_ownerId: {
        challengeId: input.challengeId, ownerId: input.ownerId,
      } },
    });
    if (!current) throw new ManualXpApprovalError("No prior approval", 404);
    if (current.status === "revoked") return { revoked: true, reused: true };
    const alreadyAwarded = await tx.professionXpEvent.findFirst({
      where: { challengeId: input.challengeId, ownerId: input.ownerId,
        awardType: "verified_quest" },
      select: { id: true },
    });
    if (alreadyAwarded) {
      throw new ManualXpApprovalError(
        "XP already issued; cannot silently revoke earned inventory; manual correction required",
      );
    }
    await tx.verifiedXpApproval.update({
      where: { id: current.id },
      data: { status: "revoked", revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        action: "summon.xp.review.revoked",
        actorUserId: input.reviewerId, targetUserId: input.ownerId,
        challengeId: input.challengeId,
        payload: JSON.stringify({
          approvalId: current.id, reason,
          xpIssued: false, ticketsIssued: 0, summonsIssued: 0,
        }),
      },
    });
    return { revoked: true, reused: false };
  }, { maxWait: 15000, timeout: 30000 });
}

/** Invoked ONLY from the internal award transaction after finality checks. */
export async function requireCurrentTrustedXpApprovalForAward(
  tx: Prisma.TransactionClient,
  input: { challengeId: string; ownerId: string; judgmentId: string },
): Promise<void> {
  if (!manualXpApprovalEnabled()) {
    throw new ManualXpApprovalError("Manual video/photo XP issuance is disabled", 503);
  }
  const approval = await tx.verifiedXpApproval.findUnique({
    where: { challengeId_ownerId: {
      challengeId: input.challengeId, ownerId: input.ownerId,
    } },
  });
  if (!approval || approval.status !== "approved" || approval.revokedAt ||
      approval.finalJudgmentId !== input.judgmentId ||
      approval.policyVersion !== MANUAL_XP_APPROVAL_VERSION) {
    throw new ManualXpApprovalError("Valid reviewer XP approval missing");
  }
  await requireIndependentModerator(tx, approval.reviewerUserId, input.challengeId);
  const audit = await assessTrustedQuestXpWithTx(tx, {
    challengeId: input.challengeId, userId: input.ownerId,
  });
  if (!audit.admittedForManualReview ||
      audit.finalJudgmentId !== approval.finalJudgmentId ||
      !audit.sourceFingerprint ||
      audit.sourceFingerprint !== approval.sourceFingerprint) {
    throw new ManualXpApprovalError(
      "Review approval became stale or private proof/consent/appeal changed",
    );
  }
}
