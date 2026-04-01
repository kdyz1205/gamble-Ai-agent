import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, getAiModel, unauthorized, noCredits, type TierId } from "@/lib/auth";
import {
  executeChallengeJudgment,
  type JudgmentExecutionFailure,
} from "@/lib/challenge-judgment";
import { getCredits, TIER_MULTIPLIER } from "@/lib/credits";

export const runtime = "nodejs";
/** Vision + ffmpeg can exceed default Vercel limit; adjust per host. */
export const maxDuration = 300;

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
  let providerId: string | undefined;
  let model: string | undefined;
  try {
    const body = await req.json();
    if ([1, 2, 3].includes(body?.tier)) tierId = body.tier as TierId;
    if (typeof body?.providerId === "string") providerId = body.providerId;
    if (typeof body?.model === "string") model = body.model;
  } catch {
    /* default to haiku */
  }

  const cost = TIER_MULTIPLIER[tierId];
  const balance = await getCredits(user.userId);
  if (balance < cost) return noCredits(cost, balance, getAiModel(tierId).displayName);

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { creatorId: true, status: true, title: true },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only the creator can trigger judgment" }, { status: 403 });
  }
  if (challenge.status !== "judging") {
    return Response.json(
      {
        error:
          "AI verdict is unlocked after every player submits evidence. Submit yours below — when all sides are in, status becomes Judging.",
      },
      { status: 400 },
    );
  }

  const result = await executeChallengeJudgment(id, tierId, { providerId, model });

  if (!result.ok) {
    if ("skipped" in result && result.skipped) {
      return Response.json({ error: "Challenge already judged", reason: result.reason }, { status: 409 });
    }
    const fail = result as JudgmentExecutionFailure;
    if (fail.status === 402) {
      return noCredits(
        cost,
        fail.creditsRemaining ?? (await getCredits(user.userId)),
        getAiModel(tierId).displayName,
      );
    }
    return Response.json({ error: fail.error }, { status: fail.status });
  }

  return Response.json({
    judgment: result.judgment,
    settlement: result.settlementResult,
    challenge: { id, status: "settled" },
    model: result.model,
    tierId: result.tierId,
    creditsUsed: result.creditsUsed,
    creditsRemaining: result.creditsRemaining,
    txHash: result.txHash,
  });
}
