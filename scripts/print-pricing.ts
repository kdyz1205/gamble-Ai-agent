/**
 * Run: npm run pricing
 * Override API rates: ANTHROPIC_HAIKU_IN=1 ANTHROPIC_HAIKU_OUT=5 npx tsx scripts/print-pricing.ts
 */
import {
  PRICING,
  apiCostUsd,
  revenueFromCredits,
  grossMarginParse,
  grossMarginJudge,
  apiPriceTierForProductTier,
} from "../src/lib/pricing-model";

function rate(
  tier: "haiku" | "sonnet",
): { input: number; output: number } {
  if (tier === "haiku") {
    return {
      input: Number(process.env.ANTHROPIC_HAIKU_IN) || PRICING.anthropicUsdPerMillion.haiku.input,
      output: Number(process.env.ANTHROPIC_HAIKU_OUT) || PRICING.anthropicUsdPerMillion.haiku.output,
    };
  }
  return {
    input: Number(process.env.ANTHROPIC_SONNET_IN) || PRICING.anthropicUsdPerMillion.sonnet.input,
    output: Number(process.env.ANTHROPIC_SONNET_OUT) || PRICING.anthropicUsdPerMillion.sonnet.output,
  };
}

function cost(
  tin: number,
  tout: number,
  tier: "haiku" | "sonnet",
): number {
  const r = { ...PRICING.anthropicUsdPerMillion, haiku: rate("haiku"), sonnet: rate("sonnet") };
  return apiCostUsd(tin, tout, tier, r);
}

const tParse = PRICING.tokens.parse;
const tJudge = PRICING.tokens.judge;

console.log("\n══ ChallengeAI — pricing model (estimate) ══\n");
console.log(`List: 1 USDC = ${PRICING.creditsPerUsdc} credits → $${PRICING.usdPerCreditList.toFixed(4)} / credit`);
console.log(`Signup bonus: ${PRICING.signupBonusCredits} credits ≈ $${revenueFromCredits(PRICING.signupBonusCredits).toFixed(2)} list value\n`);

console.log("── API COGS (single call, Haiku rates) ──");
console.log(`  Parse  (~${tParse.input}/${tParse.output} tok): $${cost(tParse.input, tParse.output, "haiku").toFixed(4)}`);
console.log(`  Judge  (~${tJudge.input}/${tJudge.output} tok): $${cost(tJudge.input, tJudge.output, "haiku").toFixed(4)}`);

console.log("\n── API COGS (single call, Sonnet rates) ──");
console.log(`  Parse:  $${cost(tParse.input, tParse.output, "sonnet").toFixed(4)}`);
console.log(`  Judge:  $${cost(tJudge.input, tJudge.output, "sonnet").toFixed(4)}`);

console.log("\n── Gross margin vs list (1 cr = $0.01); API tier = Haiku/Sonnet by product tier ──");
for (const tierId of [1, 2, 3] as const) {
  const cr = PRICING.tierCredits[tierId];
  const apiT = apiPriceTierForProductTier(tierId);
  const mParse = grossMarginParse(apiT, cr);
  const mJudge = grossMarginJudge(apiT, cr);
  console.log(
    `  Tier ${tierId} (${cr} cr, ${apiT} API): parse ${(mParse * 100).toFixed(0)}% · judge ${(mJudge * 100).toFixed(0)}%`,
  );
}

console.log("\n── If entire signup bonus burned on Haiku parse ──");
const oneParse = cost(tParse.input, tParse.output, "haiku");
console.log(`  ${PRICING.signupBonusCredits} × parse ≈ $${(PRICING.signupBonusCredits * oneParse).toFixed(3)} API (max theoretical)\n`);
console.log("Calibrate token counts in src/lib/pricing-model.ts from your Anthropic usage export.");
console.log("Official rates: https://docs.anthropic.com/en/about-claude/pricing\n");
