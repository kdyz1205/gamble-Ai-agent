import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, noCredits } from "@/lib/auth";
import { getCredits, spendCredits } from "@/lib/credits";
import { ChallengeStatus } from "@/generated/prisma/enums";
import { assertChallengeTransition } from "@/lib/challenge-state-machine";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.status !== "open") return Response.json({ error: "Challenge is not open for joining" }, { status: 400 });
  if (challenge.creatorId === user.userId) return Response.json({ error: "You cannot accept your own challenge" }, { status: 400 });

  const existing = challenge.participants.find((p: { userId: string }) => p.userId === user.userId);
  if (existing) return Response.json({ error: "You are already in this challenge" }, { status: 400 });
  if (challenge.participants.length >= challenge.maxParticipants) return Response.json({ error: "Challenge is full" }, { status: 400 });

  // Escrow: deduct staked credits upfront (must happen BEFORE the transaction)
  if (challenge.stake > 0) {
    const balance = await getCredits(user.userId);
    if (balance < challenge.stake) return noCredits(challenge.stake, balance);

    const result = await spendCredits(user.userId, challenge.stake, "stake", `Staked ${challenge.stake} credits on "${challenge.title.slice(0, 40)}"`, id);
    if (!result.success) return noCredits(challenge.stake, result.balance);
  }

  // Wrap participant creation + status update in a transaction to prevent race conditions
  let updated: Awaited<ReturnType<typeof prisma.challenge.update>>;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.challenge.findUnique({
        where: { id },
        include: { participants: true },
      });
      if (!fresh || fresh.status !== "open") throw new Error("Already taken");
      if (fresh.participants.length >= fresh.maxParticipants) throw new Error("Already taken");
      if (fresh.participants.some((p: { userId: string }) => p.userId === user.userId)) {
        throw new Error("You are already in this challenge");
      }

      await tx.participant.create({
        data: { challengeId: id, userId: user.userId, role: "opponent", status: "accepted" },
      });

      const newStatus =
        fresh.participants.length + 1 >= fresh.maxParticipants
          ? ChallengeStatus.live
          : ChallengeStatus.open;

      if (newStatus !== fresh.status) {
        assertChallengeTransition(fresh.status, newStatus);
      }

      return tx.challenge.update({
        where: { id },
        data: { status: newStatus },
        include: {
          creator: { select: { id: true, username: true, image: true } },
          participants: {
            include: { user: { select: { id: true, username: true, image: true } } },
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && (err.message === "Already taken" || err.message === "You are already in this challenge")) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  await prisma.activityEvent.create({
    data: {
      type: "challenge_accepted",
      message: `${user.username} accepted "${challenge.title}"${challenge.stake > 0 ? ` — ${challenge.stake} credits on the line` : ""}`,
      userId: user.userId,
      challengeId: challenge.id,
    },
  });

  await appendAuditLog({
    action: AuditActions.CHALLENGE_ACCEPTED,
    actorUserId: user.userId,
    challengeId: challenge.id,
    payload: { previousStatus: challenge.status, newStatus: updated.status, stake: challenge.stake },
  });

  return Response.json({ challenge: updated });
}
