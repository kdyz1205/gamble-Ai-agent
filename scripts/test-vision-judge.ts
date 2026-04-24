/**
 * Live verification that the real vision judgment pipeline works:
 *
 *   1. Build two visually DIFFERENT test frames (a small red square and a
 *      small blue square) and base64-encode them.
 *   2. Call completeOracleJudgeVision — the exact function the real judge
 *      path uses — with a judge prompt that asks "which frame is red?".
 *   3. Parse the returned JSON and assert the model correctly identified
 *      which participant corresponds to the red frame.
 *
 * If this passes, we've proven the whole chain end-to-end:
 *   base64 image → JudgeVisionImage → llm-router → OpenAI vision API →
 *   JSON response → parsed verdict.
 *
 * This is complementary to the load-test evidence already in prod (which
 * exercised text-only judging) — it's the missing proof that VIDEO frames
 * make it all the way to a real vision-model decision.
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });
import sharp from "sharp";
import { completeOracleJudgeVision } from "../src/lib/llm-router";
import type { JudgeVisionImage } from "../src/lib/media/prepare-evidence-visuals";

// Generate real valid PNGs via sharp so OpenAI's image parser accepts them.
// Small (128x128) so the round-trip is cheap but still visually unambiguous.
async function solidColorPng(rgb: { r: number; g: number; b: number }): Promise<string> {
  const buf = await sharp({
    create: { width: 128, height: 128, channels: 3, background: rgb },
  })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

async function main() {
  const providerId = process.env.ORACLE_DEFAULT_PROVIDER || "openai";
  const model = "gpt-4o-mini";

  const redB64 = await solidColorPng({ r: 220, g: 30, b: 30 });
  const blueB64 = await solidColorPng({ r: 30, g: 30, b: 220 });

  // Test 1: red vs blue — expect model to say "A is red, B is blue"
  const images: JudgeVisionImage[] = [
    { caption: "Participant A frame 1 of 1", mimeType: "image/png", base64: redB64 },
    { caption: "Participant B frame 1 of 1", mimeType: "image/png", base64: blueB64 },
  ];

  const system = `You are a neutral vision judge. Look at the attached images and respond with JSON:
{"winner": "A" | "B" | null, "reasoning": "short explanation mentioning the colors you actually see", "confidence": 0-1}
No markdown, no preamble.`;

  const userText = `Challenge: whichever participant's frame is predominantly RED wins. Look at the images and decide.`;

  console.log(`[vision-judge-test] provider=${providerId} model=${model}`);
  console.log(`[vision-judge-test] sending 2 images (red + blue)`);

  const t0 = Date.now();
  const raw = await completeOracleJudgeVision({
    providerId,
    model,
    system,
    userText,
    images,
    maxTokens: 300,
  });
  const ms = Date.now() - t0;
  console.log(`[vision-judge-test] OpenAI round-trip ${ms}ms`);
  console.log(`[vision-judge-test] raw response: ${raw}`);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log("❌ no JSON in response");
    process.exit(1);
  }
  const parsed = JSON.parse(jsonMatch[0]) as { winner: "A" | "B" | null; reasoning: string; confidence: number };

  const checks: [string, boolean][] = [
    ["winner === 'A' (red)", parsed.winner === "A"],
    ["confidence > 0.7", typeof parsed.confidence === "number" && parsed.confidence > 0.7],
    ["reasoning mentions 'red'", /red/i.test(parsed.reasoning)],
    ["reasoning mentions 'blue'", /blue/i.test(parsed.reasoning)],
    ["round-trip under 15s", ms < 15000],
  ];

  let allPass = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "✅" : "❌"} ${name}`);
    if (!ok) allPass = false;
  }

  // Test 2: reverse — blue in slot A, red in slot B
  console.log("\n[vision-judge-test] reversed test — blue=A, red=B");
  const reversedImages: JudgeVisionImage[] = [
    { caption: "Participant A frame 1 of 1", mimeType: "image/png", base64: blueB64 },
    { caption: "Participant B frame 1 of 1", mimeType: "image/png", base64: redB64 },
  ];
  const raw2 = await completeOracleJudgeVision({
    providerId,
    model,
    system,
    userText,
    images: reversedImages,
    maxTokens: 300,
  });
  console.log(`[vision-judge-test] raw response 2: ${raw2}`);
  const m2 = raw2.match(/\{[\s\S]*\}/);
  if (!m2) {
    console.log("❌ reversed: no JSON");
    process.exit(1);
  }
  const p2 = JSON.parse(m2[0]) as { winner: "A" | "B" | null; reasoning: string; confidence: number };
  const reversedOk = p2.winner === "B";
  console.log(`${reversedOk ? "✅" : "❌"} reversed: winner === 'B' (red now in slot B)`);
  if (!reversedOk) allPass = false;

  console.log("\n" + (allPass ? "✅ VISION JUDGE E2E PASSED — real OpenAI vision call with real frames returned correct verdict in both orderings" : "❌ VISION JUDGE E2E FAILED"));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
