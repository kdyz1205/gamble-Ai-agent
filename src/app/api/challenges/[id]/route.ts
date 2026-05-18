import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { isOpenForOpponentStatus } from "@/lib/challenge-state-machine";

/**
 * GET /api/challenges/[id] - Get a single challenge with full details.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, image: true } },
      participants: {
        include: { user: { select: { id: true, username: true, image: true } } },
      },
      evidence: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "desc" },
      },
      judgments: {
        include: {
          winner: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { evidence: true, participants: true } },
    },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  return Response.json({ challenge });
}

/**
 * DELETE /api/challenges/[id] - creator closes/deletes their own empty market.
 *
 * Safety rules:
 * - Must be the creator.
 * - Status must be draft, open, or cancelled.
 * - Must not have any non-creator participant.
 * - Refund and delete happen in one transaction.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: {
      id: true,
      creatorId: true,
      status: true,
      stake: true,
      title: true,
      participants: { select: { userId: true, status: true } },
    },
  });
  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only the creator can delete a market" }, { status: 403 });
  }

  const deletable = ["draft", "cancelled"];
  if (!deletable.includes(challenge.status) && !isOpenForOpponentStatus(challenge.status)) {
    return Response.json(
      {
        error: `Can't delete a market in status "${challenge.status}". Only draft / waiting-for-opponent / cancelled markets can be deleted.`,
      },
      { status: 409 },
    );
  }

  const hasOtherParticipant = challenge.participants.some(
    (participant) => participant.userId !== challenge.creatorId && participant.status !== "declined",
  );
  if (hasOtherParticipant) {
    return Response.json(
      { error: "Can't close this market because another participant has already joined." },
      { status: 409 },
    );
  }

  let refundedStake = 0;
  try {
    refundedStake = await prisma.$transaction(async (tx) => {
      let refunded = 0;

      if (challenge.stake > 0) {
        const updated = await tx.user.update({
          where: { id: user.userId },
          data: { credits: { increment: challenge.stake } },
          select: { credits: true },
        });

        await tx.creditTx.create({
          data: {
            userId: user.userId,
            type: "refund",
            amount: challenge.stake,
            balanceAfter: updated.credits,
            description: `Refund - closed empty market "${challenge.title.slice(0, 40)}"`,
            challengeId: id,
          },
        });

        refunded = challenge.stake;
      }

      await tx.challenge.delete({ where: { id } });
      return refunded;
    });
  } catch (err) {
    return Response.json(
      { error: "Close failed, market was not deleted", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    deletedId: id,
    refundedStake,
  });
}
