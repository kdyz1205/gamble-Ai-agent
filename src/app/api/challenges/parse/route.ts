import { NextRequest } from "next/server";
import { getAuthUser, getAiModel, unauthorized, noCredits, type TierId } from "@/lib/auth";
import { parseChallenge, generateClarifications } from "@/lib/ai-engine";
import { getCredits, spendForInference, TIER_MULTIPLIER } from "@/lib/credits";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";

/**
 * POST /api/challenges/parse
 * Body: { input: string, tier?: 1|2|3 }
 *
 * Tier 1 (Haiku)  = cheapest parse, 1 credit
 * Tier 2 (Sonnet) = better parse, 5 credits
 * Tier 3 (Opus)   = best parse, 25 credits
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  try {
    const { input, tier: rawTier, providerId: rawPid, model: rawModel } = await req.json();
    if (!input || typeof input !== "string") {
      return Response.json({ error: "input string is required" }, { status: 400 });
    }

    const providerId =
      typeof rawPid === "string" && getProviderById(rawPid) ? rawPid : DEFAULT_LLM_PROVIDER_ID;
    const pdef = getProviderById(providerId)!;

    const tierId = ([1, 2, 3].includes(rawTier) ? rawTier : 1) as TierId;
    const cost = TIER_MULTIPLIER[tierId];
    const balance = await getCredits(user.userId);
    if (balance < cost) return noCredits(cost, balance, getAiModel(tierId).displayName);

    const result = await spendForInference(user.userId, tierId, "parse", `Parse: "${input.slice(0, 50)}…"`);
    if (!result.success) return noCredits(cost, result.balance, getAiModel(tierId).displayName);

    const parseModel =
      typeof rawModel === "string" && rawModel.trim()
        ? rawModel.trim()
        : providerId === DEFAULT_LLM_PROVIDER_ID
          ? result.model
          : pdef.defaultModel;

    const parsed = await parseChallenge(input, { model: parseModel, providerId });
    const clarifications = generateClarifications(parsed);

    return Response.json({
      parsed,
      clarifications,
      model: `${pdef.shortLabel} / ${parseModel}`,
      tierId,
      creditsUsed: cost,
      creditsRemaining: result.balance,
      txHash: result.txHash || null,
    });
  } catch (err) {
    console.error("Parse error:", err);
    return Response.json({ error: "Failed to parse challenge" }, { status: 500 });
  }
}
