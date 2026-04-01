/**
 * Business / margin model for ChallengeAI (off-chain credits).
 * Token counts are estimates — calibrate against Anthropic usage logs.
 * API $/MTok must match https://docs.anthropic.com/en/about-claude/pricing
 */

export const PRICING = {
  creditsPerUsdc: 100,
  /** Implied list price per credit when users top up at CREDITS_PER_USDC */
  usdPerCreditList: 1 / 100,
  signupBonusCredits: 50,
  tierCredits: { 1: 1, 2: 5, 3: 25 } as const,
  /**
   * USD per 1 million tokens — replace with current console rates for your model IDs.
   * Below are typical Haiku vs Sonnet-style ratios; verify on Anthropic pricing page.
   */
  anthropicUsdPerMillion: {
    haiku: { input: 1, output: 5 },
    sonnet: { input: 3, output: 15 },
  } as const,
  /** Expected tokens per call (tune from logs) */
  tokens: {
    parse: { input: 400, output: 350 },
    judge: { input: 1800, output: 800 },
  },
} as const;

export type ModelPriceTier = keyof typeof PRICING.anthropicUsdPerMillion;

export function apiCostUsd(
  inputTok: number,
  outputTok: number,
  tier: ModelPriceTier,
  rates: Record<ModelPriceTier, { input: number; output: number }> = {
    haiku: { ...PRICING.anthropicUsdPerMillion.haiku },
    sonnet: { ...PRICING.anthropicUsdPerMillion.sonnet },
  },
): number {
  const p = rates[tier];
  return (inputTok / 1_000_000) * p.input + (outputTok / 1_000_000) * p.output;
}

/** List revenue if user paid in credits at top-up rate */
export function revenueFromCredits(credits: number): number {
  return credits * PRICING.usdPerCreditList;
}

export function grossMarginParse(modelTier: ModelPriceTier, creditsCharged: number): number {
  const cogs = apiCostUsd(PRICING.tokens.parse.input, PRICING.tokens.parse.output, modelTier);
  const rev = revenueFromCredits(creditsCharged);
  if (rev <= 0) return 0;
  return (rev - cogs) / rev;
}

export function grossMarginJudge(modelTier: ModelPriceTier, creditsCharged: number): number {
  const cogs = apiCostUsd(PRICING.tokens.judge.input, PRICING.tokens.judge.output, modelTier);
  const rev = revenueFromCredits(creditsCharged);
  if (rev <= 0) return 0;
  return (rev - cogs) / rev;
}

export function signupBonusMaxApiUsd(): number {
  const parseHaiku = apiCostUsd(PRICING.tokens.parse.input, PRICING.tokens.parse.output, "haiku");
  return PRICING.signupBonusCredits * parseHaiku;
}

/** Product tier 1→Haiku API, 2/3→Sonnet-class API (aligns with app model routing). */
export function apiPriceTierForProductTier(productTier: 1 | 2 | 3): ModelPriceTier {
  return productTier === 1 ? "haiku" : "sonnet";
}
