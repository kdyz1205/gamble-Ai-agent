import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import { settleChallenge } from "@/lib/credits";
import { ChallengeStatus, type ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";
import { assertChallengeTransition, isTerminalStatus } from "@/lib/challenge-state-machine";

export const runtime = "nodejs";

type ManualOutcome = "winner" | "refund" | "void";

const MANUAL_RESOLUTION_STATUSES: readonly ChallengeStatusValue[] = [
  ChallengeStatus.manual_review_required,
  ChallengeStatus.disputed,
  ChallengeStatus.ai_inconclusive,
  ChallengeStatus.dispute_window_open,
];

function challengeDetailInclude() {
  return {
    creator: { select: { id: true, username: true, image: true } },
    participants: {
      include: { user: { select: { id: true, username: true, image: true } } },
    },
    evidence: {
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" as const },
    },
    judgments: {
      include: { winner: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" as const },
    },
    _count: { select: { evidence: true, participants: true } },
  };
}

async function readBody(req: NextRequest): Promise<{
  outcome: ManualOutcome | null;
  winnerId: string | null;
  reason: string;
}> {
  try {
    const body = await req.json();
    const outcome = ["winner", "refund", "void"].includes(String(body?.outcome))
      ? String(body.outcome) as ManualOutcome
      : null;
    const winnerId = typeof body?.winnerId === "string" && body.winnerId.trim()
      ? body.winnerId.trim()
      : null;
    const reason = typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 2000)
      : "Manual review resolution.";
    return { outcome, winnerId, reason };
  } catch {
    return { outcome: null, winnerId: null, reason: "Manual review resolution." };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await readBody(req);

  try {
    if (!body.outcome) {
      return Response.json({ error: "outcome must be winner, refund, or void" }, { status: 400 });
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });

    if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
    if (challenge.creatorId !== user.userId) {
      return Response.json({ error: "Only the creator can resolve manual review in this MVP" }, { status: 403 });
    }

    const status = challenge.status as ChallengeStatusValue;
    if (isTerminalStatus(status)) {
      return Response.json({ error: `Challenge is already terminal (status=${status})` }, { status: 409 });
    }
    if (!MANUAL_RESOLUTION_STATUSES.includes(status)) {
      return Response.json(
        { error: `Manual resolution requires manual-review/disputed status (status=${status})` },
        { status: 409 },
      );
    }

    const acceptedParticipants = challenge.participants.filter((participant) => participant.status === "accepted");
    if (acceptedParticipants.length === 0) {
      return Response.json({ error: "No accepted participants to resolve" }, { status: 409 });
    }

    let winnerId: string | null = null;
    if (body.outcome === "winner") {
      const winner = acceptedParticipants.find((participant) => participant.userId === body.winnerId);
      if (!winner) {
        return Response.json({ error: "winnerId must be an accepted participant" }, { status: 400 });
      }
      winnerId = winner.userId;
    }

    if (body.outcome === "void" && challenge.stake > 0) {
      return Response.json(
        { error: "Staked challenges cannot be voided without refunding locked credits" },
        { status: 400 },
      );
    }

    const existingSettlementRows = await prisma.creditTx.count({
      where: { challengeId: id, type: { in: ["win", "loss", "refund"] } },
    });
    if (existingSettlementRows > 0) {
      return Response.json(
        { error: "Settlement rows already exist for this challenge; refusing duplicate manual settlement" },
        { status: 409 },
      );
    }

    assertChallengeTransition(status, ChallengeStatus.finalized);
    const claim = await prisma.challenge.updateMany({
      where: { id, status: { in: [...MANUAL_RESOLUTION_STATUSES] } },
      data: { status: ChallengeStatus.finalized },
    });
    if (claim.count === 0) {
      return Response.json(
        { error: "This manual review is already being resolved by another request." },
        { status: 409 },
      );
    }

    let settlement: { success: boolean; txHash?: string; error?: string } = { success: true };
    if (challenge.stake > 0 && body.outcome !== "void") {
      settlement = await settleChallenge(
        id,
        body.outcome === "winner" ? winnerId : null,
        challenge.stake,
        acceptedParticipants.map((participant) => ({ userId: participant.userId })),
      );
      if (!settlement.success) {
        await prisma.challenge.update({
          where: { id },
          data: { status: ChallengeStatus.manual_review_required },
        });
        await appendAuditLog({
          action: AuditActions.MANUAL_REVIEW_RESOLVED,
          actorUserId: user.userId,
          challengeId: id,
          targetUserId: winnerId,
          payload: {
            previousStatus: status,
            attemptedOutcome: body.outcome,
            settlementOk: false,
            settlementError: settlement.error ?? null,
            reason: body.reason,
          },
        });
        return Response.json(
          { error: settlement.error || "Manual settlement failed", settlement },
          { status: 502 },
        );
      }
    }

    const finalStatus =
      body.outcome === "winner"
        ? ChallengeStatus.settled
        : body.outcome === "refund" && challenge.stake > 0
          ? ChallengeStatus.refunded
          : ChallengeStatus.voided;
    assertChallengeTransition(ChallengeStatus.finalized, finalStatus);

    const manualJudgment = await prisma.judgment.create({
      data: {
        challengeId: id,
        judgeId: user.userId,
        winnerId,
        method: "manual",
        aiModel: "manual-review-v1",
        reasoning: body.reason,
        confidence: body.outcome === "winner" ? 1 : null,
        status: "completed",
        metricsJson: JSON.stringify({
          source: "manual_review",
          outcome: body.outcome,
          previousStatus: status,
          reason: body.reason,
          settlement,
          actorUserId: user.userId,
          resolvedAt: new Date().toISOString(),
        }),
      },
      include: { winner: { select: { id: true, username: true } } },
    });

    const updated = await prisma.challenge.update({
      where: { id },
      data: { status: finalStatus, aiModel: "manual-review-v1" },
      include: challengeDetailInclude(),
    });

    await appendAuditLog({
      action: AuditActions.MANUAL_REVIEW_RESOLVED,
      actorUserId: user.userId,
      targetUserId: winnerId,
      challengeId: id,
      payload: {
        previousStatus: status,
        finalStatus,
        outcome: body.outcome,
        winnerId,
        manualJudgmentId: manualJudgment.id,
        settlementOk: settlement.success,
        settlementTxHash: settlement.txHash ?? null,
        reason: body.reason,
      },
    });

    const winnerName = manualJudgment.winner?.username ?? "No winner";
    await prisma.activityEvent.create({
      data: {
        type: finalStatus === ChallengeStatus.settled
          ? "challenge_settled"
          : finalStatus === ChallengeStatus.refunded
            ? "challenge_refunded"
            : "challenge_voided",
        message: finalStatus === ChallengeStatus.settled
          ? `"${challenge.title}" resolved by manual review; ${winnerName} wins.`
          : `"${challenge.title}" resolved by manual review; ${finalStatus}.`,
        userId: winnerId,
        challengeId: id,
        metadata: JSON.stringify({ outcome: body.outcome, reason: body.reason }),
      },
    });

    return Response.json({
      challenge: updated,
      judgment: manualJudgment,
      settlement,
      manualReview: {
        outcome: body.outcome,
        finalStatus,
        winnerId,
        reason: body.reason,
      },
    });
  } catch (err) {
    console.error(`[manual-resolve ${id}] uncaught:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Manual resolution failed" },
      { status: 500 },
    );
  }
}
