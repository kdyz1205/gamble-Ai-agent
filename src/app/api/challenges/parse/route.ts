import { NextRequest } from "next/server";
import { getAuthUser, getAiModel, unauthorized, type TierId } from "@/lib/auth";
import { parseChallenge, generateClarifications, type ParsedChallenge } from "@/lib/ai-engine";
import { getCredits } from "@/lib/credits";

/**
 * Per-user rate limit. Parse is free so anyone with a free signup bonus could
 * hammer it to drain our OpenAI budget. Sliding-window, lambda-local (best-
 * effort under horizontal scale — a shared Redis would be tighter; for now
 * this stops the obvious abuse).
 */
const PARSE_WINDOW_MS = 60_000;
const PARSE_MAX_PER_WINDOW = 15;      // 15 parses/minute per user
const PARSE_MAX_PER_DAY = 300;        // soft day cap
const DAY_MS = 24 * 60 * 60 * 1000;
const userHits = new Map<string, number[]>();

function hitRate(userId: string): { ok: boolean; retryInSec?: number; reason?: string } {
  const now = Date.now();
  const prior = userHits.get(userId) ?? [];
  // Trim to last 24h so we can check both windows.
  const within24h = prior.filter((t) => now - t < DAY_MS);
  const withinMinute = within24h.filter((t) => now - t < PARSE_WINDOW_MS);
  if (withinMinute.length >= PARSE_MAX_PER_WINDOW) {
    const oldest = withinMinute[0];
    return {
      ok: false,
      retryInSec: Math.max(1, Math.ceil((PARSE_WINDOW_MS - (now - oldest)) / 1000)),
      reason: "minute",
    };
  }
  if (within24h.length >= PARSE_MAX_PER_DAY) {
    return { ok: false, reason: "day" };
  }
  within24h.push(now);
  userHits.set(userId, within24h);
  return { ok: true };
}

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

  const rl = hitRate(user.userId);
  if (!rl.ok) {
    const msg =
      rl.reason === "day"
        ? `Parse rate limit — you've hit ${PARSE_MAX_PER_DAY} parses today. Try again tomorrow.`
        : `Too many parse requests — try again in ${rl.retryInSec}s.`;
    return Response.json({ error: msg }, { status: 429 });
  }

  try {
    const { input, tier: rawTier, priorDraft: rawPrior } = await req.json();
    if (!input || typeof input !== "string") {
      return Response.json({ error: "input string is required" }, { status: 400 });
    }

    const tierId = ([1, 2, 3].includes(rawTier) ? rawTier : 1) as TierId;
    const balance = await getCredits(user.userId);

    // Light validation on the optional priorDraft — ensure it's an object with
    // at least a title. We send only a small subset to the LLM so context
    // stays focused (title/proposition/type/suggestedStake/evidenceType/deadline).
    const priorDraft: ParsedChallenge | null =
      rawPrior && typeof rawPrior === "object" && typeof rawPrior.title === "string"
        ? (rawPrior as ParsedChallenge)
        : null;

    // Parse is ALWAYS FREE — it's the top of the funnel (chat → structured draft),
    // the cost is trivial (~$0.001 per call on Haiku), and charging here would
    // scare off new users before they experience the product. Credit cost kicks
    // in later when real stakes + AI judgment are involved.
    const { model: modelName } = getAiModel(tierId);
    const parsed = await parseChallenge(input, modelName, priorDraft);
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
