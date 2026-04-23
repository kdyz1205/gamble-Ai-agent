import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { settleChallenge } from "@/lib/credits";
import { ChallengeStatus, type ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";
import { assertChallengeTransition } from "@/lib/challenge-state-machine";

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
  if (status !== ChallengeStatus.disputed && status !== ChallengeStatus.judging) {
    return Response.json({ error: "No confirmable AI recommendation for this challenge" }, { status: 400 });
  }

  const judgment = challenge.judgments[0];
  if (!judgment) {
    return Response.json({ error: "No completed AI recommendation found" }, { status: 400 });
  }

  let settlement: { success: boolean; txHash?: string; error?: string } = { success: true };
  if (challenge.stake > 0) {
    assertChallengeTransition(status, ChallengeStatus.pending_settlement);
    await prisma.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.pending_settlement },
    });

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
          challenge: { id, status: ChallengeStatus.pending_settlement },
        },
        { status: 502 },
      );
    }
  }

  const fromStatus = challenge.stake > 0
    ? ChallengeStatus.pending_settlement
    : status;
  assertChallengeTransition(fromStatus, ChallengeStatus.settled);

  const updated = await prisma.challenge.update({
    where: { id },
    data: { status: ChallengeStatus.settled },
    include: {
      creator: { select: { id: true, username: true, image: true } },
      participants: { include: { user: { select: { id: true, username: true, image: true } } } },
      evidence: { include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
      judgments: { include: { winner: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
      _count: { select: { evidence: true, participants: true } },
    },
  });

  const winnerName = judgment.winner?.username || "No one";
  await prisma.activityEvent.create({
    data: {
      type: "challenge_settled",
      message: `"${challenge.title}" confirmed by ${user.username}; ${winnerName} wins${challenge.stake > 0 ? ` ${challenge.stake} credits` : ""}.`,
      userId: judgment.winnerId,
      challengeId: id,
    },
  });

  return Response.json({ challenge: updated, judgment, settlement });
}
