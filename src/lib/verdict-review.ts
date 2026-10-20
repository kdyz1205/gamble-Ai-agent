import prisma from "@/lib/db";
import { ChallengeStatus } from "@/lib/enums";
import { isOnChainEnabled, settleChallenge } from "@/lib/credits";
import { withJudgmentExecutionLock } from "./judgment-execution-lock";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import type { CreditTx, Prisma } from "@/generated/prisma/client";

export const VerdictDecision = {
  accepted: "accepted",
  reviewRequested: "review_requested",
} as const;

export type VerdictDecisionValue = (typeof VerdictDecision)[keyof typeof VerdictDecision];
export type ReviewResolution = "uphold" | "override" | "refund";

const ACTIVE_REVIEW_STATUSES = ["pending", "processing"] as const;
const DEFAULT_DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REVIEW_SLA_HOURS = 72;
export const REVIEW_PROCESSING_TIMEOUT_MS = 6 * 60 * 1000;
const REVIEW_RESOLUTION_STARTED = "review.resolution.started";
const CONSENT_SETTLEMENT_STARTED = "verdict.settlement.started";
type ResolutionSource = "manual_review" | "review_expiry" | "review_recovery";
interface ReviewResolutionInput {
  reviewId: string;
  reviewerUserId: string | null;
  resolution: ReviewResolution;
  winnerId?: string | null;
  notes: string;
  source: ResolutionSource;
}

function auditPayload(payload: unknown): Record<string, unknown> | null {
  try {
    const value = typeof payload === "string" ? JSON.parse(payload) : payload;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function playerIds(challenge: { creatorId: string; participants: Array<{ userId: string; role: string }> }): string[] {
  const ids = challenge.participants.map((participant) => participant.userId).sort();
  const creators = challenge.participants.filter((participant) => participant.role === "creator");
  if (ids.length < 2 || new Set(ids).size !== ids.length || creators.length !== 1 || creators[0].userId !== challenge.creatorId) {
    throw new ReviewFlowError("Recorded quest players are inconsistent; reconciliation is required", 409);
  }
  return ids;
}

async function assertRecordedEscrow(challengeId: string, stake: number, participantIds: string[]) {
  const ledger = await prisma.creditTx.findMany({ where: { challengeId } });
  if (!Number.isSafeInteger(stake) || stake < 0 || ledger.some((row) => row.type === "stake"
    && (row.amount >= 0 || !participantIds.includes(row.userId) || stake === 0))) {
    throw new ReviewFlowError("Recorded stake does not match the quest escrow; reconciliation is required", 409);
  }
  const isFeeRefund = (refund: CreditTx) => {
    const fee = refund.idempotencyKey?.startsWith(`refund:judge-fee:${challengeId}:`)
      ? ledger.find((row) => row.idempotencyKey === refund.idempotencyKey!.slice("refund:".length)) : null;
    return !!fee && fee.type === "ai_judge" && fee.userId === refund.userId && fee.amount === -refund.amount && refund.amount > 0;
  };
  const outcomes = ledger.filter((row) => row.type === "win" || row.type === "loss" || (row.type === "refund" && !isFeeRefund(row)));
  if (stake === 0) {
    if (outcomes.length) throw new ReviewFlowError("Free quest has an unexpected settlement; reconciliation is required", 409);
    return;
  }
  for (const userId of participantIds) {
    const debits = ledger.filter((row) => row.userId === userId && row.type === "stake");
    if (debits.some((row) => row.amount >= 0) || debits.reduce((sum, row) => sum - row.amount, 0) !== stake) {
      throw new ReviewFlowError("Recorded stake does not match the quest escrow; reconciliation is required", 409);
    }
  }
  const marker = ledger.find((row) => row.idempotencyKey === `settlement:${challengeId}`);
  if (marker) {
    const validWin = marker.type === "win" && participantIds.includes(marker.userId) && marker.amount === stake * participantIds.length
      && outcomes.length === participantIds.length && outcomes.filter((row) => row.type === "win").length === 1
      && participantIds.filter((id) => id !== marker.userId).every((id) => outcomes.some((row) => row.userId === id && row.type === "loss" && row.amount === 0));
    const validRefund = marker.type === "refund" && participantIds.includes(marker.userId)
      && outcomes.length === participantIds.length && outcomes.every((row) => row.type === "refund" && row.amount === stake)
      && participantIds.every((id) => outcomes.some((row) => row.userId === id));
    if (!validWin && !validRefund) throw new ReviewFlowError("Recorded settlement does not match the stake receipts; reconciliation is required", 409);
    return;
  }
  if (outcomes.length) throw new ReviewFlowError("Unmarked stake return or settlement requires reconciliation", 409);
}

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
}, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<void> {
  const now = new Date();
  await db.reviewCase.upsert({
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
  await db.auditLog.create({ data: {
    action: AuditActions.REVIEW_REQUESTED,
    challengeId: input.challengeId,
    payload: JSON.stringify({ source: "automatic_low_confidence", judgmentId: input.judgmentId, reason: input.reason.slice(0, 500) }),
  } });
}

async function finalizeOutcome(input: {
  challengeId: string;
  winnerId: string | null;
  judgmentId: string;
  actorUserId?: string | null;
  source: "mutual_acceptance" | ResolutionSource;
}) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: input.challengeId },
    include: {
      participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } },
    },
  });
  if (!challenge) throw new ReviewFlowError("Challenge not found", 404);
  const participantIds = playerIds(challenge);
  await assertRecordedEscrow(challenge.id, challenge.stake, participantIds);
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

  await prisma.$transaction(async (tx) => {
    const completed = await tx.challenge.updateMany({
      where: { id: challenge.id, status: ChallengeStatus.pending_settlement },
      data: { status: ChallengeStatus.settled },
    });
    if (completed.count === 0) return;
    const winner = input.winnerId
      ? await tx.user.findUnique({ where: { id: input.winnerId }, select: { username: true } })
      : null;
    await tx.activityEvent.create({
      data: {
        type: input.winnerId ? "challenge_settled" : "challenge_refunded",
        message: input.winnerId
          ? `"${challenge.title}" settled after ${input.source}; ${winner?.username ?? "winner"} wins.`
          : `"${challenge.title}" ended inconclusively; all stakes were refunded.`,
        userId: input.winnerId,
        challengeId: challenge.id,
      },
    });
    await tx.auditLog.create({ data: {
      action: AuditActions.CHALLENGE_SETTLED,
      actorUserId: input.actorUserId,
      challengeId: challenge.id,
      payload: JSON.stringify({ source: input.source, judgmentId: input.judgmentId, winnerId: input.winnerId, txHash: settlement.txHash ?? null }),
    } });
  });

  return { settled: true, status: ChallengeStatus.settled, settlement };
}

interface VerdictDecisionInput {
  challengeId: string;
  userId: string;
  decision: VerdictDecisionValue;
  reason?: string;
}

export async function recordVerdictDecision(input: VerdictDecisionInput) {
  // Settled retries are read-only and need not contend with another no-op retry.
  const terminal = await prisma.challenge.findUnique({ where: { id: input.challengeId },
    include: { participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } }, reviewCase: true } });
  if (!terminal) throw new ReviewFlowError("Challenge not found", 404);
  if (!terminal.participants.some((participant) => participant.userId === input.userId)) throw new ReviewFlowError("Only accepted players can respond to the verdict", 403);
  if (terminal?.status === ChallengeStatus.settled) {
    return { settled: true, status: terminal.status, waitingForUserIds: [] as string[], reviewCase: terminal.reviewCase };
  }
  const result = await withJudgmentExecutionLock(input.challengeId, () => recordClaimedVerdictDecision(input));
  if (!result) throw new ReviewFlowError("Outcome is already being finalized; retry after it completes", 409);
  return result;
}

async function recordClaimedVerdictDecision(input: VerdictDecisionInput) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: input.challengeId },
    include: {
      participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } },
      judgments: { where: { method: { in: ["ai", "rules"] }, status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
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
  if (challenge.status === ChallengeStatus.pending_settlement) {
    if (input.decision !== VerdictDecision.accepted) throw new ReviewFlowError("Outcome is already being finalized", 409);
    const finalized = await resumeConsentSettlement(challenge.id);
    return { ...finalized, waitingForUserIds: [], reviewCase: challenge.reviewCase };
  }
  if (challenge.status !== ChallengeStatus.disputed) {
    throw new ReviewFlowError(`Verdict response is not allowed in status ${challenge.status}`, 409);
  }
  const judgment = challenge.judgments[0];
  if (!judgment) throw new ReviewFlowError("No completed recommendation found", 400);
  playerIds(challenge);

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
      participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } },
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

  const consentingPlayers = playerIds({ creatorId: challenge.creatorId, participants: current.participants });
  await assertRecordedEscrow(challenge.id, challenge.stake, consentingPlayers);

  await prisma.$transaction(async (tx) => {
    const claim = await tx.challenge.updateMany({ where: { id: challenge.id, status: ChallengeStatus.disputed }, data: { status: ChallengeStatus.pending_settlement } });
    if (claim.count === 0) throw new ReviewFlowError("Outcome is already being finalized", 409);
    await tx.auditLog.create({ data: {
      action: CONSENT_SETTLEMENT_STARTED, actorUserId: input.userId, challengeId: challenge.id,
      payload: JSON.stringify({ judgmentId: judgment.id, winnerId: judgment.winnerId,
        participantIds: consentingPlayers }),
    } });
  });
  const finalized = await resumeConsentSettlement(challenge.id, false);
  return { ...finalized, waitingForUserIds: [], reviewCase: current.reviewCase };
}

/** Called only under the challenge execution lease; never invent a missing intent. */
async function resumeConsentSettlement(challengeId: string, resuming = true) {
  const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId }, include: {
    participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } }, verdictResponses: true, reviewCase: true,
  } });
  const intentRow = await prisma.auditLog.findFirst({ where: { challengeId, action: CONSENT_SETTLEMENT_STARTED }, orderBy: { createdAt: "desc" } });
  const intent = auditPayload(intentRow?.payload);
  const participantIds = playerIds(challenge);
  const accepted = new Set(challenge.verdictResponses.filter((response) => response.decision === VerdictDecision.accepted).map((response) => response.userId));
  if (!intent || typeof intent.judgmentId !== "string" || !participantIds.length
    || JSON.stringify(intent.participantIds) !== JSON.stringify(participantIds)
    || participantIds.some((userId) => !accepted.has(userId)) || isActiveReview(challenge.reviewCase?.status)
    || !intentRow?.actorUserId || !participantIds.includes(intentRow.actorUserId)) {
    throw new ReviewFlowError("Recorded participant consent is incomplete; reconciliation is required", 409);
  }
  const judgment = await prisma.judgment.findFirst({ where: { id: intent.judgmentId, challengeId, status: "completed", method: { in: ["ai", "rules"] } } });
  if (!judgment || judgment.winnerId !== intent.winnerId || (judgment.winnerId && !participantIds.includes(judgment.winnerId))) {
    throw new ReviewFlowError("Recorded recommendation does not match participant consent; reconciliation is required", 409);
  }
  const marker = await prisma.creditTx.findUnique({ where: { idempotencyKey: `settlement:${challengeId}` } });
  if (marker && (judgment.winnerId === null ? marker.type !== "refund" : marker.type !== "win" || marker.userId !== judgment.winnerId)) {
    throw new ReviewFlowError("Committed settlement does not match participant consent; reconciliation is required", 409);
  }
  if (resuming && challenge.stake > 0 && isOnChainEnabled() && !marker) throw new ReviewFlowError("On-chain settlement status is unknown; reconciliation is required", 409);
  return finalizeOutcome({ challengeId, winnerId: judgment.winnerId, judgmentId: judgment.id, actorUserId: intentRow.actorUserId, source: "mutual_acceptance" });
}

export async function recoverPendingConsentSettlements(limit = 20) {
  const pending = await prisma.challenge.findMany({ where: { status: ChallengeStatus.pending_settlement, reviewCase: null,
    auditLogs: { some: { action: CONSENT_SETTLEMENT_STARTED } } },
    select: { id: true }, take: Math.min(Math.max(limit, 1), 100), orderBy: { updatedAt: "asc" } });
  const outcomes: Array<{ challengeId: string; ok: boolean; error?: string }> = [];
  for (const quest of pending) {
    try {
      const result = await withJudgmentExecutionLock(quest.id, () => resumeConsentSettlement(quest.id));
      outcomes.push({ challengeId: quest.id, ok: result?.settled === true,
        ...(result?.settled ? {} : { error: result ? result.settlement.error ?? "Settlement not completed" : "Outcome is already being finalized" }) });
    } catch (error) { outcomes.push({ challengeId: quest.id, ok: false, error: error instanceof Error ? error.message : "Recovery failed" }); }
  }
  return outcomes;
}

async function resolveReviewCaseCore(input: ReviewResolutionInput) {
  const row = await prisma.reviewCase.findUnique({ where: { id: input.reviewId }, select: {
    challengeId: true, reviewerUserId: true, status: true,
    challenge: { select: { creatorId: true, participants: { where: { status: "accepted" }, select: { userId: true } } } },
  } });
  if (!row) throw new ReviewFlowError("Review case not found", 404);
  const reviewerId = row.status === "processing" ? row.reviewerUserId : input.reviewerUserId;
  if (reviewerId && (reviewerId === row.challenge.creatorId || row.challenge.participants.some((participant) => participant.userId === reviewerId))) {
    throw new ReviewFlowError("A reviewer cannot resolve their own quest or a quest they joined", 403);
  }
  // Reuse the existing six-minute execution lease. It serializes all outcome
  // writers outside the inference/settlement call and survives a crashed worker.
  const result = await withJudgmentExecutionLock(row.challengeId, () => resolveClaimedReviewCase(input));
  if (!result) throw new ReviewFlowError("Review resolution is already processing", 409);
  return result;
}

async function resolveClaimedReviewCase(input: ReviewResolutionInput) {
  let review = await prisma.reviewCase.findUnique({
    where: { id: input.reviewId },
    include: {
      challenge: {
        include: {
          participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } },
          judgments: { where: { method: { in: ["ai", "rules"] }, status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!review) throw new ReviewFlowError("Review case not found", 404);
  if (["resolved", "expired"].includes(review.status)) {
    return { resolved: true, settled: review.challenge.status === ChallengeStatus.settled, review };
  }
  if (!ACTIVE_REVIEW_STATUSES.includes(review.status as (typeof ACTIVE_REVIEW_STATUSES)[number])) {
    throw new ReviewFlowError(`Review cannot be resolved from status ${review.status}`, 409);
  }

  const resuming = review.status === "processing";
  const participantIds = playerIds(review.challenge);
  if (input.source === "manual_review" && input.reviewerUserId
    && (input.reviewerUserId === review.challenge.creatorId || participantIds.includes(input.reviewerUserId))) {
    throw new ReviewFlowError("A reviewer cannot resolve their own quest or a quest they joined", 403);
  }
  let winnerId: string | null;
  let resolutionSource = input.source;
  if (resuming) {
    if (review.resolution !== input.resolution || !review.finalJudgmentId
      || (input.resolution === "override" && (input.winnerId ?? null) !== review.resolvedWinnerId)) {
      throw new ReviewFlowError("A different or incomplete review resolution is already processing", 409);
    }
    winnerId = review.resolvedWinnerId;
    const recorded = await prisma.judgment.findFirst({ where: {
      id: review.finalJudgmentId, challengeId: review.challengeId, method: "manual", status: { in: ["pending", "completed"] },
    } });
    if (!recorded || recorded.winnerId !== winnerId || recorded.judgeId !== review.reviewerUserId
      || (input.resolution === "refund" && winnerId !== null)) {
      throw new ReviewFlowError("Recorded review decision is incomplete or inconsistent; reconciliation is required", 409);
    }
    // Source/actor come from the first persisted decision, not a later caller.
    resolutionSource = review.reviewerUserId ? "manual_review" : "review_recovery";
    const started = await prisma.auditLog.findFirst({ where: {
      challengeId: review.challengeId, action: REVIEW_RESOLUTION_STARTED,
    }, orderBy: { createdAt: "desc" } });
    const intent = auditPayload(started?.payload);
    if (intent?.reviewId === review.id && intent.finalJudgmentId === review.finalJudgmentId
      && intent.resolution === review.resolution && intent.winnerId === winnerId
      && (intent.source === "manual_review" || intent.source === "review_expiry")) resolutionSource = intent.source;
  } else {
    const original = await prisma.judgment.findFirst({ where: {
      id: review.originalJudgmentId, challengeId: review.challengeId, method: { in: ["ai", "rules"] }, status: "completed",
    } });
    if (!original) throw new ReviewFlowError("Original recommendation not found", 409);
    winnerId = input.resolution === "uphold" ? original.winnerId : input.resolution === "override" ? input.winnerId ?? null : null;
  }
  if ((winnerId && !participantIds.includes(winnerId)) || (input.resolution === "override" && !winnerId)) {
    throw new ReviewFlowError("Review winner must be an accepted participant", 400);
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
      await tx.auditLog.create({ data: {
        action: REVIEW_RESOLUTION_STARTED, actorUserId: input.reviewerUserId, challengeId: review!.challengeId,
        payload: JSON.stringify({ reviewId: review!.id, source: input.source, resolution: input.resolution, winnerId, finalJudgmentId: judgment.id }),
      } });
      return judgment;
    });
    if (!claimed) throw new ReviewFlowError("Review is already being resolved", 409);
    review = await prisma.reviewCase.findUnique({
      where: { id: review.id },
      include: {
        challenge: {
          include: {
            participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } },
            judgments: { where: { method: { in: ["ai", "rules"] }, status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!review) throw new ReviewFlowError("Review case not found after claim", 500);
  }

  const settlementMarker = await prisma.creditTx.findUnique({ where: { idempotencyKey: `settlement:${review.challengeId}` } });
  if (settlementMarker && (winnerId === null ? settlementMarker.type !== "refund"
    : !(settlementMarker.userId === winnerId && (settlementMarker.type === "win" || (participantIds.length === 1 && settlementMarker.type === "refund"))))) {
    throw new ReviewFlowError("Committed settlement does not match the recorded review decision; reconciliation is required", 409);
  }
  if (resuming && review.challenge.stake > 0 && isOnChainEnabled()
    && !settlementMarker) {
    throw new ReviewFlowError("On-chain settlement status is unknown; reconcile the transaction before retrying", 409);
  }

  const finalized = await finalizeOutcome({
    challengeId: review.challengeId,
    winnerId,
    judgmentId: review.finalJudgmentId!,
    actorUserId: review.reviewerUserId,
    source: resolutionSource,
  });
  if (!finalized.settled) return { resolved: false, ...finalized, review };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.judgment.update({ where: { id: review!.finalJudgmentId! }, data: { status: "completed" } });
    await tx.reviewCase.update({
      where: { id: review!.id },
      data: { status: resolutionSource === "review_expiry" ? "expired" : "resolved", resolvedAt: now },
    });
    await tx.auditLog.create({ data: {
      action: AuditActions.REVIEW_RESOLVED,
      actorUserId: review!.reviewerUserId,
      challengeId: review!.challengeId,
      payload: JSON.stringify({ reviewId: review!.id, source: resolutionSource, resolution: review!.resolution, winnerId, finalJudgmentId: review!.finalJudgmentId }),
    } });
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
  const now = new Date();
  const overdue = await prisma.reviewCase.findMany({
    where: { OR: [
      { status: "pending", expiresAt: { lte: now } },
      { status: "processing", updatedAt: { lte: new Date(now.getTime() - REVIEW_PROCESSING_TIMEOUT_MS) } },
    ] },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, status: true, resolution: true, resolvedWinnerId: true, reviewerUserId: true, notes: true },
  });
  const outcomes: Array<{ reviewId: string; ok: boolean; error?: string }> = [];
  for (const item of overdue) {
    try {
      const resuming = item.status === "processing";
      if (resuming && !["uphold", "override", "refund"].includes(item.resolution ?? "")) {
        throw new ReviewFlowError("Recorded review decision is missing; reconciliation is required", 409);
      }
      const result = await resolveReviewCaseCore({
        reviewId: item.id,
        reviewerUserId: resuming ? item.reviewerUserId : null,
        resolution: resuming ? item.resolution as ReviewResolution : "refund",
        winnerId: resuming ? item.resolvedWinnerId : null,
        notes: resuming ? item.notes ?? "" : "Review SLA expired without a moderator decision; all stakes refunded.",
        source: resuming ? "review_recovery" : "review_expiry",
      });
      outcomes.push({ reviewId: item.id, ok: result.resolved,
        ...(!result.resolved ? { error: "settlement" in result ? result.settlement.error ?? "Settlement not completed" : "Settlement not completed" } : {}),
      });
    } catch (error) {
      outcomes.push({ reviewId: item.id, ok: false, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return outcomes;
}

export async function listReviewQueue(status = "pending") {
  return prisma.reviewCase.findMany({
    where: status === "all" ? undefined : status === "pending" ? { status: { in: [...ACTIVE_REVIEW_STATUSES] } } : { status },
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
