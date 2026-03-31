import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

/**
 * POST /api/challenges/[id]/accept — Accept / join a challenge
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = getUserFromRequest(req);
  if (!payload) return unauthorized();

  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  if (challenge.status !== "open") {
    return Response.json({ error: "Challenge is not open for joining" }, { status: 400 });
  }

  if (challenge.creatorId === payload.userId) {
    return Response.json({ error: "You cannot accept your own challenge" }, { status: 400 });
  }

  // Check if already participating
  const existing = challenge.participants.find(p => p.userId === payload.userId);
  if (existing) {
    return Response.json({ error: "You are already in this challenge" }, { status: 400 });
  }

  // Check max participants
  if (challenge.participants.length >= challenge.maxParticipants) {
    return Response.json({ error: "Challenge is full" }, { status: 400 });
  }

  // If staking, lock funds
  if (challenge.stake > 0 && challenge.currency === "USD") {
    const wallet = await prisma.wallet.findUnique({ where: { userId: payload.userId } });
    if (!wallet || wallet.balance < challenge.stake) {
      return Response.json({ error: "Insufficient balance to match the stake" }, { status: 400 });
    }

    await prisma.wallet.update({
      where: { userId: payload.userId },
      data: {
        balance: { decrement: challenge.stake },
        escrow: { increment: challenge.stake },
      },
    });

    const updatedWallet = await prisma.wallet.findUnique({ where: { userId: payload.userId } });
    await prisma.transaction.create({
      data: {
        userId: payload.userId,
        type: "stake",
        amount: -challenge.stake,
        balanceAfter: updatedWallet!.balance,
        description: `Matched stake for: ${challenge.title}`,
        challengeId: challenge.id,
      },
    });
  }

  // Add participant and update challenge status
  await prisma.participant.create({
    data: {
      challengeId: challenge.id,
      userId: payload.userId,
      role: "opponent",
      status: "accepted",
    },
  });

  // If now at max participants, set to "matched" → "live"
  const newStatus = challenge.participants.length + 1 >= challenge.maxParticipants ? "live" : "open";

  const updated = await prisma.challenge.update({
    where: { id },
    data: { status: newStatus },
    include: {
      creator: { select: { id: true, username: true, avatar: true } },
      participants: {
        include: { user: { select: { id: true, username: true, avatar: true } } },
      },
    },
  });

  // Activity event
  await prisma.activityEvent.create({
    data: {
      type: "challenge_accepted",
      message: `${payload.username} accepted "${challenge.title}"${challenge.stake > 0 ? ` — $${challenge.stake} matched` : ""}`,
      userId: payload.userId,
      challengeId: challenge.id,
    },
  });

  return Response.json({ challenge: updated });
}
