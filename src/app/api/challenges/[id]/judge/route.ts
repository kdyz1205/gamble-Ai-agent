import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, getAiModel, unauthorized, noCredits, type TierId } from "@/lib/auth";
import { judgeChallenge } from "@/lib/ai-engine";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";
import { getCredits, spendForInference, TIER_MULTIPLIER } from "@/lib/credits";
import { ChallengeStatus } from "@/lib/enums";

/**
 * POST /api/challenges/[id]/judge
 * Body: { tier?: 1|2|3 }
 *
 * Burn 1 model token of the chosen tier, then AI writes a recommended verdict.
 * A human must confirm the recommendation before credits are settled.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let tierId: TierId = 1;
  let providerIdOverride: string | undefined;
  let modelOverride: string | undefined;
  try {
    const body = await req.json();
    if ([1, 2, 3].includes(body?.tier)) tierId = body.tier as TierId;
    if (typeof body?.providerId === "string") providerIdOverride = body.providerId;
    if (typeof body?.model === "string") modelOverride = body.model;
  } catch { /* default to haiku */ }

  const cost = TIER_MULTIPLIER[tierId];

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
  if (!["live", "judging"].includes(challenge.status)) return Response.json({ error: "Not ready for judgment" }, { status: 400 });

  // Free Mode: when the challenge has no stake, AI judgment is free.
  // Paid challenges still charge the user's credits for the judgment inference.
  const isFreeChallenge = (challenge.stake ?? 0) === 0;

  if (!isFreeChallenge) {
    const balance = await getCredits(user.userId);
    if (balance < cost) return noCredits(cost, balance, getAiModel(tierId).displayName);
    const spend = await spendForInference(user.userId, tierId, "judge", `Judge: "${challenge.title.slice(0, 40)}"`, id);
    if (!spend.success) return noCredits(cost, spend.balance, getAiModel(tierId).displayName);
  }

  const creator = challenge.participants.find((p: { role: string }) => p.role === "creator");
  const opponent = challenge.participants.find((p: { role: string }) => p.role === "opponent");
  if (!creator) return Response.json({ error: "Creator not found" }, { status: 400 });

  const evidenceA = challenge.evidence.find((e: { userId: string }) => e.userId === creator.userId);
  const evidenceB = opponent ? challenge.evidence.find((e: { userId: string }) => e.userId === opponent.userId) : null;
  const parseFrames = (raw: string | null | undefined): string[] | null => {
    if (!raw) return null;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : null;
    } catch {
      return null;
    }
  };

  const aiModel = getAiModel(tierId);
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const providerId =
    providerIdOverride && getProviderById(providerIdOverride)
      ? providerIdOverride
      : envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const pdef = getProviderById(providerId);
  // tier model names are Claude IDs; only valid when routing to Anthropic.
  // For other providers, fall back to that provider's default model so the
  // call doesn't 404 and silently degrade to the random-winner fallback.
  const judgeModel =
    modelOverride?.trim() ||
    (providerId === DEFAULT_LLM_PROVIDER_ID
      ? aiModel.model
      : (pdef?.defaultModel ?? aiModel.model));
  const aiModelLabel = `${pdef?.shortLabel ?? aiModel.displayName} · ${judgeModel}`;

  const result = await judgeChallenge({
    title: challenge.title,
    type: challenge.type,
    rules: challenge.rules,
    evidencePolicy: challenge.evidenceType,
    evidenceA: evidenceA
      ? {
          description: evidenceA.description,
          type: evidenceA.type,
          url: evidenceA.url,
          preparedFrames: parseFrames(evidenceA.preparedFrames),
          preparedDurationSec: evidenceA.preparedDurationSec,
          preparedMode: evidenceA.preparedMode,
        }
      : null,
    evidenceB: evidenceB
      ? {
          description: evidenceB.description,
          type: evidenceB.type,
          url: evidenceB.url,
          preparedFrames: parseFrames(evidenceB.preparedFrames),
          preparedDurationSec: evidenceB.preparedDurationSec,
          preparedMode: evidenceB.preparedMode,
        }
      : null,
    participantAId: creator.userId,
    participantBId: opponent?.userId ?? null,
    model: judgeModel,
    providerId,
  });

  const judgment = await prisma.judgment.create({
    data: {
      challengeId: id,
      winnerId: result.winnerId,
      method: "ai",
      aiModel: aiModelLabel,
      reasoning: result.reasoning,
      confidence: result.confidence,
      status: "completed",
    },
    include: { winner: { select: { id: true, username: true } } },
  });

  await prisma.challenge.update({
    where: { id },
    data: { status: ChallengeStatus.disputed, aiModel: aiModelLabel },
  });

  const winnerName = judgment.winner?.username || "No one";
  await prisma.activityEvent.create({
    data: {
      type: "challenge_verdict_recommended",
      message: `"${challenge.title}" has an AI recommendation from ${aiModelLabel}: ${winnerName} wins. Creator confirmation required.`,
      userId: result.winnerId,
      challengeId: id,
    },
  });

  const postBalance = isFreeChallenge ? await getCredits(user.userId) : undefined;
  return Response.json({
    judgment,
    settlement: { success: false, error: "Manual confirmation required" },
    challenge: { id, status: ChallengeStatus.disputed },
    model: aiModelLabel,
    tierId,
    creditsUsed: isFreeChallenge ? 0 : cost,
    creditsRemaining: isFreeChallenge ? postBalance : undefined,
    txHash: null,
    freeMode: isFreeChallenge,
  });
}
