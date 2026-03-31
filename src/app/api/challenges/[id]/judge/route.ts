import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { judgeChallenge } from "@/lib/ai-engine";

/**
 * POST /api/challenges/[id]/judge — Trigger AI judgment
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
    include: {
      participants: {
        where: { status: "accepted" },
        include: { user: { select: { id: true, username: true } } },
      },
      evidence: true,
    },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  // Only creator or admin can trigger judgment
  if (challenge.creatorId !== payload.userId) {
    return Response.json({ error: "Only the creator can trigger judgment" }, { status: 403 });
  }

  if (!["live", "judging"].includes(challenge.status)) {
    return Response.json({ error: "Challenge is not ready for judgment" }, { status: 400 });
  }

  // Get participants
  const creator = challenge.participants.find(p => p.role === "creator");
  const opponent = challenge.participants.find(p => p.role === "opponent");

  if (!creator) {
    return Response.json({ error: "Creator participant not found" }, { status: 400 });
  }

  // Get evidence for each side
  const evidenceA = challenge.evidence.find(e => e.userId === creator.userId);
  const evidenceB = opponent ? challenge.evidence.find(e => e.userId === opponent.userId) : null;

  // Run AI judge
  const result = judgeChallenge(
    challenge.title,
    challenge.type,
    evidenceA ? { description: evidenceA.description, type: evidenceA.type } : null,
    evidenceB ? { description: evidenceB.description, type: evidenceB.type } : null,
    creator.userId,
    opponent?.userId || "",
  );

  // Record judgment
  const judgment = await prisma.judgment.create({
    data: {
      challengeId: id,
      winnerId: result.winnerId,
      method: "ai",
      reasoning: result.reasoning,
      confidence: result.confidence,
      status: "completed",
    },
    include: {
      winner: { select: { id: true, username: true } },
    },
  });

  // Settle funds
  if (challenge.stake > 0 && challenge.currency === "USD") {
    const totalPot = challenge.stake * challenge.participants.length;

    if (result.winnerId) {
      // Winner gets the pot
      await prisma.wallet.update({
        where: { userId: result.winnerId },
        data: {
          balance: { increment: totalPot },
          escrow: { decrement: challenge.stake },
          totalWon: { increment: totalPot - challenge.stake },
        },
      });

      const winnerWallet = await prisma.wallet.findUnique({ where: { userId: result.winnerId } });
      await prisma.transaction.create({
        data: {
          userId: result.winnerId,
          type: "win",
          amount: totalPot,
          balanceAfter: winnerWallet!.balance,
          description: `Won "${challenge.title}" — $${totalPot}`,
          challengeId: id,
        },
      });

      // Loser releases escrow
      const loserId = challenge.participants.find(p => p.userId !== result.winnerId)?.userId;
      if (loserId) {
        await prisma.wallet.update({
          where: { userId: loserId },
          data: {
            escrow: { decrement: challenge.stake },
            totalLost: { increment: challenge.stake },
          },
        });

        const loserWallet = await prisma.wallet.findUnique({ where: { userId: loserId } });
        await prisma.transaction.create({
          data: {
            userId: loserId,
            type: "loss",
            amount: -challenge.stake,
            balanceAfter: loserWallet!.balance,
            description: `Lost "${challenge.title}" — -$${challenge.stake}`,
            challengeId: id,
          },
        });
      }
    } else {
      // Draw / void — refund all participants
      for (const p of challenge.participants) {
        await prisma.wallet.update({
          where: { userId: p.userId },
          data: {
            balance: { increment: challenge.stake },
            escrow: { decrement: challenge.stake },
          },
        });

        const refundWallet = await prisma.wallet.findUnique({ where: { userId: p.userId } });
        await prisma.transaction.create({
          data: {
            userId: p.userId,
            type: "refund",
            amount: challenge.stake,
            balanceAfter: refundWallet!.balance,
            description: `Refund for "${challenge.title}" — draw/void`,
            challengeId: id,
          },
        });
      }
    }
  }

  // Update challenge status
  await prisma.challenge.update({
    where: { id },
    data: { status: "settled" },
  });

  // Activity event
  const winnerName = judgment.winner?.username || "No one";
  await prisma.activityEvent.create({
    data: {
      type: "challenge_settled",
      message: `"${challenge.title}" settled — ${winnerName} wins!${challenge.stake > 0 ? ` $${challenge.stake * 2} pot` : ""}`,
      userId: result.winnerId,
      challengeId: id,
    },
  });

  return Response.json({ judgment, challenge: { id, status: "settled" } });
}
