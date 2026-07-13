import prisma from "@/lib/db";
import { ChallengeStatus } from "@/lib/enums";
import { settleChallenge } from "@/lib/credits";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";

export const VerdictDecision = {
  accepted: "accepted",
  reviewRequested: "review_requested",
} as const;

export type VerdictDecisionValue = (typeof VerdictDecision)[keyof typeof VerdictDecision];
export type ReviewResolution = "uphold" | "override" | "refund";

const ACTIVE_REVIEW_STATUSES = ["pending", "processing"] as const;
const DEFAULT_DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REVIEW_SLA_HOURS = 72;

export class ReviewFlowError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ReviewFlowError";
  }
}

export function parseDisputeWindowMs(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_DISPUTE_WINDOW_MS;
  if (/-\s*\d/.test(raw)) return DEFAULT_DISPUTE_WINDOW_MS;
  const match = raw.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(minute|min|hour|hr|day|week)s?/);
  if (!match) return DEFAULT_DISPUTE_WINDOW_MS;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return DEFAULT_DISPUTE_WINDOW_MS;
  const unit = match[2];
  const multiplier = unit.startsWith("min")
    ? 60 * 1000
    : unit.startsWith("hour") || unit === "hr"
      ? 60 * 60 * 1000
      : unit.startsWith("week")
        ? 7 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  return Math.min(amount * multiplier, 30 * 24 * 60 * 60 * 1000);
}

function reviewExpiryFrom(now: Date): Date {
  const configured = Number(process.env.REVIEW_SLA_HOURS ?? DEFAULT_REVIEW_SLA_HOURS);
  const hours = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 24 * 30) : DEFAULT_REVIEW_SLA_HOURS;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function isActiveReview(status: string | undefined): boolean {
  return !!status && ACTIVE_REVIEW_STATUSES.includes(status as (typeof ACTIVE_REVIEW_STATUSES)[number]);
}

export async function isReviewModerator(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isReviewer: true } });
  return user?.isReviewer === true;
}

export async function ensureAutomaticReviewCase(input: {
  challengeId: string;
  judgmentId: string;
  reason: string;
}): Promise<void> {
  const now = new Date();
  await prisma.reviewCase.upsert({
    where: { challengeId: input.challengeId },
    create: {
      challengeId: input.challengeId,
      requestedByUserId: null,
      originalJudgmentId: input.judgmentId,
      reason: input.reason.slice(0, 2000),
      status: "pending",
      expiresAt: reviewExpiryFrom(now),
    },
    update: {},
  });
  await appendAuditLog({
    action: AuditActions.REVIEW_REQUESTED,
    challengeId: input.challengeId,
    payload: { source: "automatic_low_confidence", judgmentId: input.judgmentId, reason: input.reason.slice(0, 500) },
  });
}

async function finalizeOutcome(input: {
  challengeId: string;
  winnerId: string | null;
  judgmentId: string;
  actorUserId?: string | null;
  source: "mutual_acceptance" | "manual_review" | "review_expiry";
}) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: input.challengeId },
    include: {
      participants: { where: { status: "accepted" }, select: { userId: true } },
    },
  });
  if (!challenge) throw new ReviewFlowError("Challenge not found", 404);
  if (challenge.status === ChallengeStatus.settled) {
    return { settled: true, status: ChallengeStatus.settled, settlement: { success: true } };
  }

  if (challenge.status === ChallengeStatus.disputed) {
    const claim = await prisma.challenge.updateMany({
      where: { id: challenge.id, status: ChallengeStatus.disputed },
      data: { status: ChallengeStatus.pending_settlement },
    });
    if (claim.count === 0) {
      throw new ReviewFlowError("Outcome is already being finalized", 409);
    }
  } else if (challenge.status !== ChallengeStatus.pending_settlement) {
    throw new ReviewFlowError(`Challenge cannot settle from status ${challenge.status}`, 409);
  }

  const settlement = await settleChallenge(
    challenge.id,
    input.winnerId,
    challenge.stake,
    challenge.participants,
  );
  if (!settlement.success) {
    await appendAuditLog({
      action: AuditActions.SETTLEMENT_FAILED,
      actorUserId: input.actorUserId,
      challengeId: challenge.id,
      payload: { source: input.source, judgmentId: input.judgmentId, error: settlement.error },
    });
    return { settled: false, status: ChallengeStatus.pending_settlement, settlement };
  }

  const completed = await prisma.challenge.updateMany({
    where: { id: challenge.id, status: ChallengeStatus.pending_settlement },
    data: { status: ChallengeStatus.settled },
  });

  if (completed.count > 0) {
    const winner = input.winnerId
      ? await prisma.user.findUnique({ where: { id: input.winnerId }, select: { username: true } })
      : null;
    await prisma.activityEvent.create({
      data: {
        type: input.winnerId ? "challenge_settled" : "challenge_refunded",
        message: input.winnerId
          ? `"${challenge.title}" settled after ${input.source}; ${winner?.username ?? "winner"} wins.`
          : `"${challenge.title}" ended inconclusively; all stakes were refunded.`,
        userId: input.winnerId,
        challengeId: challenge.id,
      },
    });
    await appendAuditLog({
      action: AuditActions.CHALLENGE_SETTLED,
      actorUserId: input.actorUserId,
      challengeId: challenge.id,
      payload: { source: input.source, judgmentId: input.judgmentId, winnerId: input.winnerId, txHash: settlement.txHash ?? null },
    });
  }

  return { settled: true, status: ChallengeStatus.settled, settlement };
}

export async function recordVerdictDecision(input: {
  challengeId: string;
  userId: string;
  decision: VerdictDecisionValue;
  reason?: string;
}) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: input.challengeId },
    include: {
      participants: { where: { status: "accepted" }, select: { userId: true } },
      judgments: { where: { method: "ai", status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
      verdictResponses: true,
      reviewCase: true,
    },
  });
  if (!challenge) throw new ReviewFlowError("Challenge not found", 404);
  if (!challenge.participants.some((participant) => participant.userId === input.userId)) {
    throw new ReviewFlowError("Only accepted participants can respond to the verdict", 403);
  }
  if (challenge.status === ChallengeStatus.settled) {
    return { settled: true, status: challenge.status, waitingForUserIds: [] as string[], reviewCase: challenge.reviewCase };
  }
  if (challenge.status !== ChallengeStatus.disputed) {
    throw new ReviewFlowError(`Verdict response is not allowed in status ${challenge.status}`, 409);
  }
  const judgment = challenge.judgments[0];
  if (!judgment) throw new ReviewFlowError("No completed AI recommendation found", 400);

  if (input.decision === VerdictDecision.reviewRequested) {
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 10) throw new ReviewFlowError("Explain the review request in at least 10 characters", 400);
    const closesAt = new Date(judgment.createdAt.getTime() + parseDisputeWindowMs(challenge.disputeWindow));
    if (Date.now() > closesAt.getTime()) throw new ReviewFlowError("The review-request window has closed", 409);
    if (challenge.reviewCase?.status === "resolved") throw new ReviewFlowError("This review has already been resolved", 409);

    const now = new Date();
    const [, reviewCase] = await prisma.$transaction([
      prisma.verdictResponse.upsert({
        where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } },
        create: { challengeId: challenge.id, userId: input.userId, decision: input.decision, reason },
        update: { decision: input.decision, reason },
      }),
      prisma.reviewCase.upsert({
        where: { challengeId: challenge.id },
        create: {
          challengeId: challenge.id,
          requestedByUserId: input.userId,
          originalJudgmentId: judgment.id,
          reason,
          status: "pending",
          expiresAt: reviewExpiryFrom(now),
        },
        update: {},
      }),
    ]);
    await appendAuditLog({
      action: AuditActions.REVIEW_REQUESTED,
      actorUserId: input.userId,
      challengeId: challenge.id,
      payload: { judgmentId: judgment.id, reason: reason.slice(0, 500) },
    });
    return { settled: false, status: challenge.status, waitingForUserIds: [], reviewCase };
  }

  await prisma.verdictResponse.upsert({
    where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } },
    create: { challengeId: challenge.id, userId: input.userId, decision: input.decision },
    update: { decision: input.decision, reason: null },
  });
  await appendAuditLog({
    action: AuditActions.VERDICT_ACCEPTED,
    actorUserId: input.userId,
    challengeId: challenge.id,
    payload: { judgmentId: judgment.id },
  });

  const current = await prisma.challenge.findUnique({
    where: { id: challenge.id },
    include: {
      participants: { where: { status: "accepted" }, select: { userId: true } },
      verdictResponses: true,
      reviewCase: true,
    },
  });
  if (!current) throw new ReviewFlowError("Challenge not found", 404);
  const activeReview = isActiveReview(current.reviewCase?.status);
  const acceptedIds = new Set(
    current.verdictResponses
      .filter((response) => response.decision === VerdictDecision.accepted)
      .map((response) => response.userId),
  );
  const waitingForUserIds = current.participants
    .map((participant) => participant.userId)
    .filter((userId) => !acceptedIds.has(userId));

  if (activeReview || waitingForUserIds.length > 0) {
    return { settled: false, status: current.status, waitingForUserIds, reviewCase: current.reviewCase };
  }

  const finalized = await finalizeOutcome({
    challengeId: challenge.id,
    winnerId: judgment.winnerId,
    judgmentId: judgment.id,
    actorUserId: input.userId,
    source: "mutual_acceptance",
  });
  return { ...finalized, waitingForUserIds: [], reviewCase: current.reviewCase };
}

async function resolveReviewCaseCore(input: {
  reviewId: string;
  reviewerUserId: string | null;
  resolution: ReviewResolution;
  winnerId?: string | null;
  notes: string;
  source: "manual_review" | "review_expiry";
}) {
  let review = await prisma.reviewCase.findUnique({
    where: { id: input.reviewId },
    include: {
      challenge: {
        include: {
          participants: { where: { status: "accepted" }, select: { userId: true } },
          judgments: { where: { method: "ai", status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!review) throw new ReviewFlowError("Review case not found", 404);
  if (review.status === "resolved") {
    return { resolved: true, settled: review.challenge.status === ChallengeStatus.settled, review };
  }
  if (!ACTIVE_REVIEW_STATUSES.includes(review.status as (typeof ACTIVE_REVIEW_STATUSES)[number])) {
    throw new ReviewFlowError(`Review cannot be resolved from status ${review.status}`, 409);
  }

  const aiJudgment = review.challenge.judgments[0];
  if (!aiJudgment) throw new ReviewFlowError("Original AI judgment not found", 409);
  const participantIds = review.challenge.participants.map((participant) => participant.userId);
  const winnerId = input.resolution === "uphold"
    ? aiJudgment.winnerId
    : input.resolution === "override"
      ? input.winnerId ?? null
      : null;
  if (input.resolution === "override" && (!winnerId || !participantIds.includes(winnerId))) {
    throw new ReviewFlowError("Override winner must be an accepted participant", 400);
  }

  if (review.status === "pending") {
    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.reviewCase.updateMany({
        where: { id: review!.id, status: "pending" },
        data: {
          status: "processing",
          resolution: input.resolution,
          resolvedWinnerId: winnerId,
          reviewerUserId: input.reviewerUserId,
          notes: input.notes.slice(0, 4000),
        },
      });
      if (claim.count === 0) return null;
      const judgment = await tx.judgment.create({
        data: {
          challengeId: review!.challengeId,
          judgeId: input.reviewerUserId,
          winnerId,
          method: "manual",
          reasoning: input.notes.slice(0, 4000),
          confidence: 1,
          status: "pending",
        },
      });
      await tx.reviewCase.update({ where: { id: review!.id }, data: { finalJudgmentId: judgment.id } });
      return judgment;
    });
    if (!claimed) throw new ReviewFlowError("Review is already being resolved", 409);
    review = await prisma.reviewCase.findUnique({
      where: { id: review.id },
      include: {
        challenge: {
          include: {
            participants: { where: { status: "accepted" }, select: { userId: true } },
            judgments: { where: { method: "ai", status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!review) throw new ReviewFlowError("Review case not found after claim", 500);
  } else if (
    review.resolution !== input.resolution
    || review.resolvedWinnerId !== winnerId
    || !review.finalJudgmentId
  ) {
    throw new ReviewFlowError("A different review resolution is already processing", 409);
  }

  const finalized = await finalizeOutcome({
    challengeId: review.challengeId,
    winnerId,
    judgmentId: review.finalJudgmentId!,
    actorUserId: input.reviewerUserId,
    source: input.source,
  });
  if (!finalized.settled) return { resolved: false, ...finalized, review };

  const now = new Date();
  await prisma.$transaction([
    prisma.judgment.update({ where: { id: review.finalJudgmentId! }, data: { status: "completed" } }),
    prisma.reviewCase.update({
      where: { id: review.id },
      data: { status: input.source === "review_expiry" ? "expired" : "resolved", resolvedAt: now },
    }),
  ]);
  await appendAuditLog({
    action: AuditActions.REVIEW_RESOLVED,
    actorUserId: input.reviewerUserId,
    challengeId: review.challengeId,
    payload: { reviewId: review.id, resolution: input.resolution, winnerId, finalJudgmentId: review.finalJudgmentId },
  });
  return { resolved: true, ...finalized, reviewId: review.id, finalJudgmentId: review.finalJudgmentId };
}

export async function resolveReviewCase(input: {
  reviewId: string;
  reviewerUserId: string;
  resolution: ReviewResolution;
  winnerId?: string | null;
  notes: string;
}) {
  if (!(await isReviewModerator(input.reviewerUserId))) {
    throw new ReviewFlowError("Reviewer permission required", 403);
  }
  if (input.notes.trim().length < 10) throw new ReviewFlowError("Reviewer notes must be at least 10 characters", 400);
  return resolveReviewCaseCore({ ...input, notes: input.notes.trim(), source: "manual_review" });
}

export async function expireOverdueReviewCases(limit = 20) {
  const overdue = await prisma.reviewCase.findMany({
    where: { status: "pending", expiresAt: { lte: new Date() } },
    orderBy: { expiresAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true },
  });
  const outcomes: Array<{ reviewId: string; ok: boolean; error?: string }> = [];
  for (const item of overdue) {
    try {
      await resolveReviewCaseCore({
        reviewId: item.id,
        reviewerUserId: null,
        resolution: "refund",
        winnerId: null,
        notes: "Review SLA expired without a moderator decision; all stakes refunded.",
        source: "review_expiry",
      });
      outcomes.push({ reviewId: item.id, ok: true });
    } catch (error) {
      outcomes.push({ reviewId: item.id, ok: false, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return outcomes;
}

export async function listReviewQueue(status = "pending") {
  return prisma.reviewCase.findMany({
    where: status === "all" ? undefined : { status },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      requestedBy: { select: { id: true, username: true } },
      reviewer: { select: { id: true, username: true } },
      winner: { select: { id: true, username: true } },
      challenge: {
        include: {
          creator: { select: { id: true, username: true } },
          participants: { include: { user: { select: { id: true, username: true } } } },
          evidence: { include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: "asc" } },
          judgments: { include: { winner: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
}
