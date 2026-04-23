/* Quick harness to verify parseChallenge actually reaches the LLM instead of
 * silently falling through to parseChallengeFallback. Run:
 *   npx tsx scripts/test-parse.ts
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });

import { parseChallenge } from "../src/lib/ai-engine";

async function main() {
  const prompt = process.argv[2] || "I want to bet who can do more pushups in 60 seconds";
  console.log("input:", prompt);
  console.log("env: ORACLE_DEFAULT_PROVIDER =", process.env.ORACLE_DEFAULT_PROVIDER);
  console.log("env: OPENAI_API_KEY set?", Boolean(process.env.OPENAI_API_KEY));
  console.log("env: ANTHROPIC_API_KEY set?", Boolean(process.env.ANTHROPIC_API_KEY));
  const started = Date.now();
  const out = await parseChallenge(prompt);
  const ms = Date.now() - started;
  console.log(`\n--- output (${ms}ms) ---`);
  console.log(JSON.stringify(out, null, 2));
  const looksLikeFallback =
    out.rules?.includes("Standard") && out.rules?.includes("AI reviewed") && !out.stakeOptions;
  console.log(
    looksLikeFallback
      ? "\n❌ FALLBACK — AI not called. Check keys / provider routing."
      : "\n✅ AI path — stakeOptions/evidenceOptions populated = real LLM response.",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
