import { readOptionalJsonObject } from "@/lib/request-input";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, type TierId } from "@/lib/auth";
import { executeChallengeJudgment } from "@/lib/challenge-judgment";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Sync and async judges share the same claim, charge, evidence and consent path. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const challenge = await prisma.challenge.findUnique({ where: { id }, select: { creatorId: true, status: true, stake: true } });
  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId) return Response.json({ error: "Only the creator can trigger judgment" }, { status: 403 });
  const body = await readOptionalJsonObject(req);
  if (!body) return Response.json({ error: "A JSON object is required" }, { status: 400 });
  const tierId = ([1, 2, 3].includes(Number(body.tier)) ? Number(body.tier) : 1) as TierId;
  try {
    const result = await executeChallengeJudgment(id, tierId, {
      providerId: typeof body.providerId === "string" ? body.providerId : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      allowLive: true,
    });
    if (!result.ok) {
      if ("skipped" in result) {
        const judgment = await prisma.judgment.findFirst({ where: { challengeId: id, status: "completed" }, orderBy: { createdAt: "desc" } });
        const current = await prisma.challenge.findUniqueOrThrow({ where: { id }, select: { status: true } });
        return Response.json({ judgment, challenge: { id, status: current.status }, creditsUsed: 0, reused: true,
          settlement: { success: current.status === "settled" }, txHash: null });
      }
      return Response.json({ error: result.error, creditsRemaining: result.creditsRemaining }, { status: result.status });
    }
    const current = await prisma.challenge.findUniqueOrThrow({ where: { id }, select: { status: true } });
    return Response.json({ judgment: result.judgment, settlement: result.settlementResult,
      challenge: { id, status: current.status }, model: result.model, tierId: result.tierId,
      creditsUsed: result.creditsUsed, creditsRemaining: result.creditsRemaining, txHash: result.txHash,
      freeMode: challenge.stake === 0,
    });
  } catch {
    return Response.json({ error: "Judgment could not complete. Please retry." }, { status: 503 });
  }
}
