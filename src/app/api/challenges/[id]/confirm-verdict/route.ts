import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { settleChallenge } from "@/lib/credits";
import { ChallengeStatus, type ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";
import {
  VERDICT_READY_STATUSES,
  assertChallengeTransition,
  isVerdictReadyStatus,
} from "@/lib/challenge-state-machine";

export const runtime = "nodejs";

/**
 * POST /api/challenges/[id]/confirm-verdict
 *
 * Confirms the latest completed AI recommendation and performs settlement.
 * The AI recommends; the creator makes the final product action explicit.
 */
export async function POST(
  _req: NextRequest,
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
