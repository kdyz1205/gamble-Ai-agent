import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, getAiModel, unauthorized, noCredits, type TierId } from "@/lib/auth";
import { judgeChallenge } from "@/lib/ai-engine";
import { getCredits, spendForInference, settleChallenge, TIER_MULTIPLIER } from "@/lib/credits";

/**
 * POST /api/challenges/[id]/judge
 * Body: { tier?: 1|2|3 }
 *
 * Burn 1 model token of the chosen tier, then AI judges + settles.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let tierId: TierId = 1;
  try {
    const body = await req.json();
    if ([1, 2, 3].includes(body?.tier)) tierId = body.tier as TierId;
  } catch { /* default to haiku */ }

  const cost = TIER_MULTIPLIER[tierId];
  const balance = await getCredits(user.userId);
  if (balance < cost) return noCredits(cost, balance, getAiModel(tierId).displayName);

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

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId) return Response.json({ error: "Only the creator can trigger judgment" }, { status: 403 });
  if (challenge.status !== "judging") {
    return Response.json(
      {
        error:
          "AI verdict is unlocked after every player submits evidence. Submit yours below — when all sides are in, status becomes Judging.",
      },
      { status: 400 },
    );
  }

  const spend = await spendForInference(user.userId, tierId, "judge", `Judge: "${challenge.title.slice(0, 40)}"`, id);
  if (!spend.success) return noCredits(cost, spend.balance, getAiModel(tierId).displayName);

  const creator = challenge.participants.find((p: { role: string }) => p.role === "creator");
  const opponent = challenge.participants.find((p: { role: string }) => p.role === "opponent");
  if (!creator) return Response.json({ error: "Creator not found" }, { status: 400 });

  const evidenceA = challenge.evidence.find((e: { userId: string }) => e.userId === creator.userId);
  const evidenceB = opponent ? challenge.evidence.find((e: { userId: string }) => e.userId === opponent.userId) : null;
  const mapEv = (e: { description: string | null; type: string; url: string | null } | null) =>
    e ? { description: e.description, type: e.type, url: e.url } : null;

  const aiModel = getAiModel(tierId);
  const result = await judgeChallenge({
    title: challenge.title,
    type: challenge.type,
    rules: challenge.rules,
    evidencePolicy: challenge.evidenceType,
    evidenceA: mapEv(evidenceA ?? null),
    evidenceB: mapEv(evidenceB ?? null),
    participantAId: creator.userId,
    participantBId: opponent?.userId ?? null,
    model: aiModel.model,
  });

  const judgment = await prisma.judgment.create({
    data: {
      challengeId: id,
      winnerId: result.winnerId,
      method: "ai",
      aiModel: aiModel.displayName,
      reasoning: result.reasoning,
      confidence: result.confidence,
      status: "completed",
    },
    include: { winner: { select: { id: true, username: true } } },
  });

  let settlementResult: { success: boolean; txHash?: string; error?: string } = { success: true };
  if (challenge.stake > 0) {
    settlementResult = await settleChallenge(
      id, result.winnerId, challenge.stake,
      challenge.participants.map((p: { userId: string }) => ({ userId: p.userId })),
    );
  }

  await prisma.challenge.update({ where: { id }, data: { status: "settled", aiModel: aiModel.displayName } });

  const winnerName = judgment.winner?.username || "No one";
  await prisma.activityEvent.create({
    data: {
      type: "challenge_settled",
      message: `"${challenge.title}" judged by ${aiModel.displayName} — ${winnerName} wins!${challenge.stake > 0 ? ` ${challenge.stake} credits` : ""}`,
      userId: result.winnerId,
      challengeId: id,
    },
  });

  return Response.json({
    judgment,
    settlement: settlementResult,
    challenge: { id, status: "settled" },
    model: aiModel.displayName,
    tierId,
    creditsUsed: cost,
    creditsRemaining: spend.balance,
    txHash: spend.txHash || settlementResult.txHash || null,
  });
}
