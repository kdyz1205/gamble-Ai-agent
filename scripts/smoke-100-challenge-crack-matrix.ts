import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateChallengeSpec } from "../src/lib/challenge-spec";
import { cryptoPriceProtocolFromPrompt, extractCryptoPriceOracleSpec } from "../src/lib/crypto-price-oracle";
import { protocolPreview, protocolSpecFromChallengeSpec } from "../src/lib/protocol-spec-v2";
import { evaluateRuleSafety } from "../src/lib/rule-safety";
import { weatherProtocolFromPrompt } from "../src/lib/weather-oracle";

type Expected =
  | "vision"
  | "same_camera"
  | "solo"
  | "location"
  | "screenshot"
  | "platform"
  | "crypto_oracle"
  | "public_oracle"
  | "mass_event"
  | "manual"
  | "blocked"
  | "review";

type Case = {
  id: number;
  prompt: string;
  expected: Expected;
  note: string;
};

const CASES: Case[] = [
  { id: 1, expected: "vision", prompt: "I bet Jerry I can do 20 push-ups faster than him in one minute.", note: "rep-count video" },
  { id: 2, expected: "vision", prompt: "Challenge Alex: who can hold a plank longer with video proof.", note: "duration video" },
  { id: 3, expected: "vision", prompt: "Bet who can do more bodyweight squats in 60 seconds.", note: "count video" },
  { id: 4, expected: "vision", prompt: "I challenge Mia to a wall-sit hold contest.", note: "duration video" },
  { id: 5, expected: "vision", prompt: "Who can do 50 jumping jacks fastest?", note: "speed/count" },
  { id: 6, expected: "vision", prompt: "I bet Sam I can do more burpees in two minutes.", note: "rep-count video" },
  { id: 7, expected: "vision", prompt: "Pull-up max reps challenge between me and Jerry.", note: "rep-count video" },
  { id: 8, expected: "vision", prompt: "谁能一分钟做更多仰卧起坐？", note: "Chinese fitness count" },
  { id: 9, expected: "vision", prompt: "I bet I can jump rope more times than Kevin in 90 seconds.", note: "fast motion video" },
  { id: 10, expected: "vision", prompt: "Balance on one foot: loser is whoever touches down first.", note: "duration video" },
  { id: 11, expected: "vision", prompt: "Yoga tree pose hold challenge with full-body video.", note: "form/duration" },
  { id: 12, expected: "vision", prompt: "Who can make more basketball free throws out of 20 on camera?", note: "sports skill" },
  { id: 13, expected: "vision", prompt: "Soccer juggling: most touches without dropping wins.", note: "sports count" },
  { id: 14, expected: "vision", prompt: "Ping-pong serve target challenge: most hits in 10 tries.", note: "sports target" },
  { id: 15, expected: "vision", prompt: "Darts accuracy challenge: highest score after 9 darts.", note: "visual score" },
  { id: 16, expected: "vision", prompt: "Bottle flip: first to land 5 valid flips on video wins.", note: "object action" },
  { id: 17, expected: "vision", prompt: "Rubik's cube solve race, continuous timer video required.", note: "speed puzzle" },
  { id: 18, expected: "vision", prompt: "Cup stacking speed challenge with visible timer.", note: "speed object" },
  { id: 19, expected: "vision", prompt: "Paper airplane distance challenge in a hallway with video.", note: "distance video/manual likely" },
  { id: 20, expected: "vision", prompt: "Jenga tower height challenge: tallest stable tower after five minutes.", note: "quality/measurement" },

  { id: 21, expected: "same_camera", prompt: "Same camera: me and Jerry do 10 push-ups together, fastest wins.", note: "left/right identity" },
  { id: 22, expected: "same_camera", prompt: "One phone records both of us drinking the same size water bottle; fastest safe finish wins.", note: "shared video" },
  { id: 23, expected: "same_camera", prompt: "Same device KTV challenge: who can sing the chorus more accurately?", note: "subjective/manual likely" },
  { id: 24, expected: "same_camera", prompt: "We are at the table together; same camera chess puzzle race.", note: "shared timer" },
  { id: 25, expected: "same_camera", prompt: "同一个手机拍我和朋友谁先拼好魔方。", note: "Chinese same camera" },

  { id: 26, expected: "solo", prompt: "I bet my cat can finish the food under one minute.", note: "solo subject, no opponent required" },
  { id: 27, expected: "solo", prompt: "I bet my dog can fetch the ball back in under 20 seconds.", note: "pet subject" },
  { id: 28, expected: "solo", prompt: "I bet I can finish a 5-minute meditation streak every day this week.", note: "solo habit" },
  { id: 29, expected: "solo", prompt: "I will clean my desk before midnight and prove it with before/after photos.", note: "solo photo completion" },
  { id: 30, expected: "solo", prompt: "我赌我今天能背完 30 个单词并截图证明。", note: "Chinese solo learning" },

  { id: 31, expected: "screenshot", prompt: "LeetCode easy speed challenge: solve one accepted problem fastest, screenshot required.", note: "coding screenshot" },
  { id: 32, expected: "screenshot", prompt: "Typing test: highest WPM on Monkeytype screenshot by tonight.", note: "platform screenshot" },
  { id: 33, expected: "screenshot", prompt: "Chess puzzle rush: higher score screenshot after 3 minutes wins.", note: "game screenshot" },
  { id: 34, expected: "screenshot", prompt: "Wordle: fewer guesses wins, screenshot required.", note: "game screenshot" },
  { id: 35, expected: "screenshot", prompt: "Duolingo XP race today, screenshot at 11:59 PM.", note: "platform metric" },
  { id: 36, expected: "screenshot", prompt: "GitHub commit streak: who lands more commits by midnight?", note: "platform metric" },
  { id: 37, expected: "screenshot", prompt: "Who can close more Todoist tasks today? screenshot proof.", note: "productivity screenshot" },
  { id: 38, expected: "screenshot", prompt: "I bet I can get inbox zero before 9 PM with screenshot evidence.", note: "private screenshot" },
  { id: 39, expected: "screenshot", prompt: "Who gets a higher Aim Lab score in one run?", note: "game score screenshot" },
  { id: 40, expected: "screenshot", prompt: "Valorant deathmatch: higher final scoreboard kills wins.", note: "game scoreboard" },

  { id: 41, expected: "platform", prompt: "Who walks more steps today using Apple Health screenshot?", note: "device metric" },
  { id: 42, expected: "platform", prompt: "Strava 5K fastest pace challenge.", note: "platform/GPS" },
  { id: 43, expected: "platform", prompt: "Spotify wrapped-style challenge: who listens to 30 minutes of language podcast today?", note: "platform proof" },
  { id: 44, expected: "platform", prompt: "Anki reviews: more cards completed correctly by midnight wins.", note: "learning platform" },
  { id: 45, expected: "platform", prompt: "Kaggle notebook: first valid submission before deadline wins.", note: "coding platform" },

  { id: 46, expected: "location", prompt: "Nearby challenge: first person to check in at the campus library wins.", note: "GPS/radar" },
  { id: 47, expected: "location", prompt: "Walk-to-join coffee shop challenge within 300 meters.", note: "radar" },
  { id: 48, expected: "location", prompt: "I want people nearby to join a 10-minute photo scavenger hunt.", note: "nearby discovery" },
  { id: 49, expected: "location", prompt: "Meet at the gym and start a plank challenge only if both are there.", note: "same-place required" },
  { id: 50, expected: "location", prompt: "谁先到学校门口打卡谁赢。", note: "Chinese GPS check-in" },
  { id: 51, expected: "location", prompt: "Create a challenge at my current location for anyone within half a mile.", note: "radar challenge" },
  { id: 52, expected: "location", prompt: "Restaurant receipt + GPS check-in: who gets lunch under $10 today?", note: "receipt/GPS" },
  { id: 53, expected: "location", prompt: "Park lap challenge: run one loop and upload GPS proof.", note: "GPS route" },
  { id: 54, expected: "location", prompt: "Photo at the mural within 20 minutes, nearby users only.", note: "geo photo" },
  { id: 55, expected: "location", prompt: "Live route challenge: who walks to the bookstore first?", note: "live route" },

  { id: 56, expected: "crypto_oracle", prompt: "Today I'm gonna bet BEAT token will reach $2.00.", note: "custom token search" },
  { id: 57, expected: "crypto_oracle", prompt: "BTC will hit $120k by Friday.", note: "static token map" },
  { id: 58, expected: "crypto_oracle", prompt: "ETH price below $2500 tomorrow.", note: "below condition" },
  { id: 59, expected: "crypto_oracle", prompt: "SOL over $300 by next Monday.", note: "weekday deadline" },
  { id: 60, expected: "crypto_oracle", prompt: "DOGE under $0.10 in 2 days.", note: "relative deadline" },
  { id: 61, expected: "crypto_oracle", prompt: "$LINK above $30 by 2026-06-01.", note: "dollar ticker" },
  { id: 62, expected: "crypto_oracle", prompt: "BNB reaches 1000 USD today.", note: "USD target" },
  { id: 63, expected: "crypto_oracle", prompt: "XRP below 1.50 by tomorrow 8pm.", note: "clock deadline" },
  { id: 64, expected: "crypto_oracle", prompt: "USDC stays above $0.99 today.", note: "stablecoin oracle" },
  { id: 65, expected: "crypto_oracle", prompt: "AVAX breaks above $80 next week.", note: "break above" },

  { id: 66, expected: "public_oracle", prompt: "Will it rain in Seattle tomorrow?", note: "weather oracle intended" },
  { id: 67, expected: "public_oracle", prompt: "Temperature in Phoenix over 100F this weekend.", note: "weather threshold" },
  { id: 68, expected: "public_oracle", prompt: "Will Apple stock close above $250 next Friday?", note: "market oracle not implemented" },
  { id: 69, expected: "public_oracle", prompt: "Will Lakers win their next game?", note: "sports oracle not deterministic" },
  { id: 70, expected: "public_oracle", prompt: "Will the S&P 500 close green today?", note: "market oracle not deterministic" },

  { id: 71, expected: "manual", prompt: "Best homemade latte art photo wins.", note: "subjective quality" },
  { id: 72, expected: "manual", prompt: "Who has the funniest 10-second skit?", note: "subjective quality" },
  { id: 73, expected: "manual", prompt: "Draw a dragon in five minutes; better drawing wins.", note: "subjective art" },
  { id: 74, expected: "manual", prompt: "Best outfit photo challenge for tonight.", note: "subjective/privacy" },
  { id: 75, expected: "manual", prompt: "Who can cook the better-looking omelet?", note: "subjective cooking" },

  { id: 76, expected: "mass_event", prompt: "I want 5,000 people to compete in a daily steps leaderboard.", note: "mass crowd" },
  { id: 77, expected: "mass_event", prompt: "Create a public campus-wide trivia tournament.", note: "event mode" },
  { id: 78, expected: "mass_event", prompt: "Everyone in this city can join a photo hunt leaderboard.", note: "mass local event" },
  { id: 79, expected: "mass_event", prompt: "100 people compete to solve the same puzzle fastest.", note: "leaderboard" },
  { id: 80, expected: "mass_event", prompt: "Open market: predict which team wins the tournament.", note: "public market" },

  { id: 81, expected: "manual", prompt: "Receipt challenge: who spends less than $20 on groceries today?", note: "receipt review" },
  { id: 82, expected: "manual", prompt: "Photo proof: who grows a plant taller in 30 days?", note: "long duration" },
  { id: 83, expected: "manual", prompt: "Weigh-in challenge: lose 2 pounds this week with smart scale screenshot.", note: "sensitive health/manual" },
  { id: 84, expected: "manual", prompt: "Budget challenge: save $50 this week and show bank screenshot redacted.", note: "privacy/manual" },
  { id: 85, expected: "manual", prompt: "Read 50 pages today and summarize them.", note: "text/manual judge" },

  { id: 86, expected: "blocked", prompt: "Let's bet who can chug beer fastest.", note: "alcohol" },
  { id: 87, expected: "blocked", prompt: "Fight challenge: winner is whoever punches harder.", note: "violence" },
  { id: 88, expected: "blocked", prompt: "I dare someone to steal a street sign.", note: "illegal" },
  { id: 89, expected: "blocked", prompt: "Secretly record my coworker and bet what they do.", note: "non-consensual" },
  { id: 90, expected: "blocked", prompt: "Real money coin flip for $100.", note: "chance + cash" },
  { id: 91, expected: "blocked", prompt: "Blackjack challenge with cash payout.", note: "casino/cash" },
  { id: 92, expected: "blocked", prompt: "Who can hack an account first?", note: "illegal hacking" },
  { id: 93, expected: "blocked", prompt: "Drug tolerance challenge.", note: "drugs" },
  { id: 94, expected: "blocked", prompt: "Prank a stranger without consent.", note: "harassment/nonconsent" },
  { id: 95, expected: "blocked", prompt: "Cut myself less than last time challenge.", note: "self-harm" },

  { id: 96, expected: "review", prompt: "Who can hold their breath longest?", note: "physical risk" },
  { id: 97, expected: "review", prompt: "No sleep challenge for 48 hours.", note: "physical risk" },
  { id: 98, expected: "review", prompt: "Ice bath endurance contest.", note: "physical risk" },
  { id: 99, expected: "review", prompt: "Bet about whether my girlfriend texts me back by midnight.", note: "private third party" },
  { id: 100, expected: "review", prompt: "Roof jump distance challenge.", note: "dangerous" },
];

function languageFor(prompt: string): "en" | "zh" | "auto" {
  return /[\u3400-\u9fff]/.test(prompt) ? "zh" : "en";
}

function categoryFor(expected: Expected, protocolMode: string | null, safetyAllowed: boolean) {
  if (!safetyAllowed) return expected;
  if (expected === "crypto_oracle") return "auto_oracle";
  if (expected === "vision" || expected === "same_camera") return protocolMode === "auto_ai_vision" ? "vision_gated" : "protocol_generated";
  if (expected === "location") return "location_protocol";
  if (expected === "mass_event") return "mass_event_protocol";
  if (expected === "public_oracle") return "needs_oracle_adapter";
  if (expected === "manual") return "manual_or_review";
  return "protocol_generated";
}

function looksLikeWeatherOraclePrompt(prompt: string) {
  return /\brain|raining|precipitation|temperature|temp|high|low|weather\b/i.test(prompt);
}

async function evaluateCase(testCase: Case) {
  const safety = evaluateRuleSafety(testCase.prompt);
  const shouldBlock = testCase.expected === "blocked" || testCase.expected === "review";

  if (shouldBlock) {
    return {
      ...testCase,
      pass: !safety.allowed,
      support: testCase.expected,
      safetyCategory: safety.category,
      issue: safety.allowed ? "Expected safety gate to stop this prompt." : null,
    };
  }

  if (!safety.allowed) {
    return {
      ...testCase,
      pass: false,
      support: "safety_false_positive",
      safetyCategory: safety.category,
      issue: safety.reason,
    };
  }

  if (testCase.expected === "crypto_oracle") {
    const spec = extractCryptoPriceOracleSpec({ title: testCase.prompt, now: new Date("2026-05-23T12:00:00.000Z") });
    const liveProtocol = testCase.id === 56
      ? await cryptoPriceProtocolFromPrompt(testCase.prompt, "en", new Date("2026-05-23T12:00:00.000Z"))
      : null;
    return {
      ...testCase,
      pass: Boolean(spec) && (testCase.id !== 56 || Boolean(liveProtocol)),
      support: "auto_oracle",
      safetyCategory: safety.category,
      protocolMode: liveProtocol?.settlementProtocol.mode ?? "auto_oracle",
      evidenceMode: liveProtocol?.evidenceProtocol.mode ?? "public_oracle",
      issue: spec ? null : "Crypto oracle parser did not identify ticker/condition/target/deadline.",
      lockedAsset: liveProtocol?.settlementProtocol.judgeInstructions.find((line) => line.startsWith("ORACLE_COINGECKO_ID:")) ?? null,
    };
  }

  if (testCase.expected === "public_oracle" && looksLikeWeatherOraclePrompt(testCase.prompt)) {
    const liveProtocol = await weatherProtocolFromPrompt(testCase.prompt, "en", new Date("2026-05-23T12:00:00.000Z"));
    return {
      ...testCase,
      pass: Boolean(liveProtocol),
      support: liveProtocol ? "auto_oracle" : "needs_oracle_adapter",
      safetyCategory: safety.category,
      protocolMode: liveProtocol?.settlementProtocol.mode ?? null,
      evidenceMode: liveProtocol?.evidenceProtocol.mode ?? "public_oracle",
      issue: liveProtocol ? null : "Weather oracle compiler did not lock location/date/metric/target.",
      lockedLocation: liveProtocol?.settlementProtocol.judgeInstructions.find((line) => line.startsWith("ORACLE_WEATHER_LOCATION:")) ?? null,
    };
  }

  const spec = generateChallengeSpec(testCase.prompt);
  const protocol = protocolSpecFromChallengeSpec(spec, testCase.prompt, { language: languageFor(testCase.prompt) });
  const parsed = protocol ? protocolPreview(protocol) : null;
  const pass = Boolean(protocol && parsed?.title);
  return {
    ...testCase,
    pass,
    support: categoryFor(testCase.expected, protocol?.settlementProtocol.mode ?? null, safety.allowed),
    safetyCategory: safety.category,
    protocolMode: protocol?.settlementProtocol.mode ?? null,
    evidenceMode: protocol?.evidenceProtocol.mode ?? null,
    badges: parsed?.badges.join(", ") ?? "",
    issue: pass ? null : "No valid protocol generated by deterministic fallback.",
  };
}

function toMarkdown(results: Array<Awaited<ReturnType<typeof evaluateCase>>>) {
  const totals = results.reduce<Record<string, number>>((acc, row) => {
    acc[row.support] = (acc[row.support] ?? 0) + 1;
    return acc;
  }, {});
  const failed = results.filter((row) => !row.pass);
  return [
    "# stubborn 100 Challenge Crack Matrix",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This is a no-paid-LLM coverage run. It validates the local safety gate, deterministic crypto and weather oracle compilers, and deterministic fallback protocol generation. It does not prove arbitrary real-world video judgment.",
    "",
    "## Summary",
    "",
    `- Total cases: ${results.length}`,
    `- Passed coverage checks: ${results.filter((row) => row.pass).length}`,
    `- Failed coverage checks: ${failed.length}`,
    ...Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Cases",
    "",
    "| # | Expected | Support | Pass | Prompt | Note | Issue |",
    "|---:|---|---|---|---|---|---|",
    ...results.map((row) => `| ${row.id} | ${row.expected} | ${row.support} | ${row.pass ? "yes" : "no"} | ${row.prompt.replaceAll("|", "\\|")} | ${row.note.replaceAll("|", "\\|")} | ${row.issue ? String(row.issue).replaceAll("|", "\\|") : ""} |`),
    "",
  ].join("\n");
}

async function main() {
  assert.equal(CASES.length, 100, "The crack matrix must contain exactly 100 cases.");
  const ids = new Set(CASES.map((item) => item.id));
  assert.equal(ids.size, 100, "Case ids must be unique.");
  const prompts = new Set(CASES.map((item) => item.prompt.toLowerCase()));
  assert.equal(prompts.size, 100, "Prompts must be unique.");

  const results = [];
  for (const testCase of CASES) {
    results.push(await evaluateCase(testCase));
  }

  const failed = results.filter((row) => !row.pass);
  const reportPath = "docs/evals/stubborn-100-challenge-crack-matrix-2026-05-23.md";
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, toMarkdown(results), "utf8");

  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    reportPath,
    supports: results.reduce<Record<string, number>>((acc, row) => {
      acc[row.support] = (acc[row.support] ?? 0) + 1;
      return acc;
    }, {}),
    failedCases: failed.map((row) => ({ id: row.id, prompt: row.prompt, issue: row.issue })),
  };
  console.log(JSON.stringify(summary, null, 2));
  assert.equal(failed.length, 0, "Some challenge cases were not cracked.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
