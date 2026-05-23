import { after, NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import { settleChallenge } from "@/lib/credits";
import { ChallengeStatus, type ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";
import { assertChallengeTransition, isTerminalStatus } from "@/lib/challenge-state-machine";
import { cleanupChallengeFrameBlobs } from "@/lib/media/blob-cleanup";
import { isStakeTokenAllowed, moneyModeBlock, normalizeStakeToken, paymentJurisdictionFromRequest } from "@/lib/payment-policy";

export const runtime = "nodejs";

const CANCELLABLE_BEFORE_EVIDENCE: readonly ChallengeStatusValue[] = [
  ChallengeStatus.waiting_for_opponent,
  ChallengeStatus.open,
  ChallengeStatus.opponent_accepted,
  ChallengeStatus.escrow_locked,
  ChallengeStatus.evidence_window_open,
  ChallengeStatus.matched,
  ChallengeStatus.live,
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

async function readReason(req: NextRequest): Promise<string> {
  try {
    const body = await req.json();
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    return reason ? reason.slice(0, 1000) : "Creator cancelled before evidence was submitted.";
  } catch {
    return "Creator cancelled before evidence was submitted.";
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const reason = await readReason(req);

  try {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        participants: true,
        _count: { select: { evidence: true, judgments: true, judgeJobs: true } },
      },
    });

    if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
    if (challenge.creatorId !== user.userId) {
      return Response.json({ error: "Only the creator can cancel this challenge" }, { status: 403 });
    }

    const status = challenge.status as ChallengeStatusValue;
    if (isTerminalStatus(status)) {
      return Response.json({ error: `Challenge is already terminal (status=${status})` }, { status: 409 });
    }
    if (!CANCELLABLE_BEFORE_EVIDENCE.includes(status)) {
      return Response.json(
        { error: `Cancel/refund is only available before evidence or judging starts (status=${status})` },
        { status: 409 },
      );
    }
    if (challenge._count.evidence > 0 || challenge._count.judgments > 0 || challenge._count.judgeJobs > 0) {
      return Response.json(
        { error: "Evidence or judgment history already exists. Use dispute/manual resolution instead." },
        { status: 409 },
      );
    }

    const acceptedParticipants = challenge.participants.filter((participant) => participant.status === "accepted");
    const participantsToRefund = acceptedParticipants.length > 0
      ? acceptedParticipants
      : [{ userId: challenge.creatorId }];

    const existingSettlementRows = await prisma.creditTx.count({
      where: { challengeId: id, type: { in: ["win", "loss", "refund"] } },
    });
    if (existingSettlementRows > 0) {
      return Response.json(
        { error: "Settlement rows already exist for this challenge; refusing duplicate refund" },
        { status: 409 },
      );
    }

    assertChallengeTransition(status, ChallengeStatus.cancelled);
    const claim = await prisma.challenge.updateMany({
      where: { id, status },
      data: { status: ChallengeStatus.cancelled },
    });
    if (claim.count === 0) {
      return Response.json(
        { error: "This challenge was already changed by another request." },
        { status: 409 },
      );
    }

    if (challenge.stake > 0) {
      const stakeToken = normalizeStakeToken(challenge.stakeToken);
      const paymentJurisdiction = paymentJurisdictionFromRequest(req);
      if (!isStakeTokenAllowed(stakeToken, paymentJurisdiction)) {
        return Response.json(moneyModeBlock(stakeToken, paymentJurisdiction), { status: 403 });
      }
    }

    const settlement = await settleChallenge(
      id,
      null,
      challenge.stake,
      participantsToRefund.map((participant) => ({ userId: participant.userId })),
    );
    if (!settlement.success) {
      await prisma.challenge.update({
        where: { id },
        data: { status: ChallengeStatus.manual_review_required },
      }).catch(() => null);
      return Response.json(
        { error: settlement.error || "Refund settlement failed; manual review required" },
        { status: 500 },
      );
    }

    const finalStatus = challenge.stake > 0 ? ChallengeStatus.refunded : ChallengeStatus.cancelled;
    if (finalStatus !== ChallengeStatus.cancelled) {
      assertChallengeTransition(ChallengeStatus.cancelled, finalStatus);
      await prisma.challenge.update({
        where: { id },
        data: { status: finalStatus },
      });
    }

    await appendAuditLog({
      action: AuditActions.CHALLENGE_STATUS,
      actorUserId: user.userId,
      challengeId: id,
      payload: {
        previousStatus: status,
        finalStatus,
        reason,
        participantsRefunded: participantsToRefund.map((participant) => participant.userId),
        stake: challenge.stake,
      },
    });

    await prisma.activityEvent.create({
      data: {
        type: finalStatus === ChallengeStatus.refunded ? "challenge_refunded" : "challenge_cancelled",
        message: `"${challenge.title}" cancelled by creator before evidence${challenge.stake > 0 ? "; credits refunded" : ""}.`,
        userId: user.userId,
        challengeId: id,
      },
    }).catch(() => null);

    after(async () => {
      await cleanupChallengeFrameBlobs(id);
    });

    const updated = await prisma.challenge.findUnique({
      where: { id },
      include: challengeDetailInclude(),
    });

    return Response.json({
      challenge: updated,
      cancellation: {
        finalStatus,
        refunded: challenge.stake > 0,
        stake: challenge.stake,
        participantCount: participantsToRefund.length,
        reason,
      },
      settlement,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Cancel/refund failed" },
      { status: 500 },
    );
  }
}
