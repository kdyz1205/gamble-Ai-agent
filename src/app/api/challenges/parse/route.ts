import { NextRequest } from "next/server";
import { getAuthUser, getAiModel, unauthorized, type TierId } from "@/lib/auth";
import { parseChallenge, generateClarifications } from "@/lib/ai-engine";
import { getCredits } from "@/lib/credits";

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
    const { input, tier: rawTier } = await req.json();
    if (!input || typeof input !== "string") {
      return Response.json({ error: "input string is required" }, { status: 400 });
    }

    const tierId = ([1, 2, 3].includes(rawTier) ? rawTier : 1) as TierId;
    const balance = await getCredits(user.userId);

    // Parse is ALWAYS FREE — it's the top of the funnel (chat → structured draft),
    // the cost is trivial (~$0.001 per call on Haiku), and charging here would
    // scare off new users before they experience the product. Credit cost kicks
    // in later when real stakes + AI judgment are involved.
    const { model: modelName } = getAiModel(tierId);
    const parsed = await parseChallenge(input, modelName);
    const clarifications = generateClarifications(parsed);

    return Response.json({
      parsed,
      clarifications,
      model: getAiModel(tierId).displayName,
      tierId,
      creditsUsed: 0,
      creditsRemaining: balance,
      txHash: null,
      freeMode: true,
    });
  } catch (err) {
    console.error("Parse error:", err);
    return Response.json({ error: "Failed to parse challenge" }, { status: 500 });
  }
}
