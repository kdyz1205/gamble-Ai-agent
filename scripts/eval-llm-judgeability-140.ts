import { config as dotenvConfig } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { completeOraclePromptWithMetadata } from "../src/lib/llm-router";
import type { LlmCallMetadata } from "../src/lib/llm-router";
import { cryptoPriceProtocolFromPrompt, extractCryptoPriceOracleSpec } from "../src/lib/crypto-price-oracle";
import { weatherProtocolFromPrompt } from "../src/lib/weather-oracle";

dotenvConfig({ path: ".env.local" });
dotenvConfig();

type EvalCase = {
  id: number;
  category: string;
  prompt: string;
};

type LlmVerdict = {
  id: number;
  compileClass:
    | "auto_ai_vision"
    | "auto_oracle"
    | "location_protocol"
    | "screenshot_platform"
    | "manual_review"
    | "mass_event"
    | "blocked"
    | "needs_adapter";
  eventuallyJudgeable: boolean;
  autoSettlePossible: boolean;
  evidenceNeeded: string[];
  blockers: string[];
  reason: string;
};

const CATEGORIES: Array<{ category: string; prompts: string[] }> = [
  {
    category: "fitness_video",
    prompts: [
      "I bet Jerry I can do 20 push-ups faster than him in one minute.",
      "Challenge Alex: who can hold a plank longer with video proof.",
      "Bet who can do more bodyweight squats in 60 seconds.",
      "I challenge Mia to a wall-sit hold contest.",
      "Who can do 50 jumping jacks fastest?",
      "I bet Sam I can do more burpees in two minutes.",
      "Pull-up max reps challenge between me and Jerry.",
      "谁能一分钟做更多仰卧起坐？",
      "I bet I can jump rope more times than Kevin in 90 seconds.",
      "Balance on one foot: loser is whoever touches down first.",
    ],
  },
  {
    category: "sports_object_video",
    prompts: [
      "Who can make more basketball free throws out of 20 on camera?",
      "Soccer juggling: most touches without dropping wins.",
      "Ping-pong serve target challenge: most hits in 10 tries.",
      "Darts accuracy challenge: highest score after 9 darts.",
      "Bottle flip: first to land 5 valid flips on video wins.",
      "Rubik's cube solve race, continuous timer video required.",
      "Cup stacking speed challenge with visible timer.",
      "Paper airplane distance challenge in a hallway with video.",
      "Jenga tower height challenge: tallest stable tower after five minutes.",
      "Hula hoop duration challenge with full-body video.",
    ],
  },
  {
    category: "same_camera",
    prompts: [
      "Same camera: me and Jerry do 10 push-ups together, fastest wins.",
      "One phone records both of us drinking the same size water bottle; fastest safe finish wins.",
      "Same device KTV challenge: who can sing the chorus more accurately?",
      "We are at the table together; same camera chess puzzle race.",
      "同一个手机拍我和朋友谁先拼好魔方。",
      "Same camera: two people stack cups, fastest clean stack wins.",
      "Same camera: who can solve a mini jigsaw puzzle faster?",
      "Same phone video: me left, opponent right, who can hold plank longer?",
      "Same camera: who can fold a paper crane faster?",
      "Same camera: who can type the displayed sentence with fewer mistakes?",
    ],
  },
  {
    category: "solo_pet_habit",
    prompts: [
      "I bet my cat can finish the food under one minute.",
      "I bet my dog can fetch the ball back in under 20 seconds.",
      "I bet I can finish a 5-minute meditation streak every day this week.",
      "I will clean my desk before midnight and prove it with before/after photos.",
      "我赌我今天能背完 30 个单词并截图证明。",
      "I bet my robot vacuum can finish the living room under 15 minutes.",
      "I bet I can cook dinner before 7 PM and upload a photo.",
      "I bet I can finish reading chapter 3 tonight and summarize it.",
      "I bet my plant grew at least 1 cm this month with ruler photo.",
      "I bet I can complete a 7-day no-soda streak with daily logs.",
    ],
  },
  {
    category: "coding_learning_screenshot",
    prompts: [
      "LeetCode easy speed challenge: solve one accepted problem fastest, screenshot required.",
      "Typing test: highest WPM on Monkeytype screenshot by tonight.",
      "Duolingo XP race today, screenshot at 11:59 PM.",
      "GitHub commit streak: who lands more commits by midnight?",
      "Who can close more Todoist tasks today? screenshot proof.",
      "Anki reviews: more cards completed correctly by midnight wins.",
      "Kaggle notebook: first valid submission before deadline wins.",
      "Who gets a higher score on this math quiz screenshot?",
      "Readwise highlights: who creates 20 useful highlights today?",
      "Code golf: shorter accepted solution screenshot wins.",
    ],
  },
  {
    category: "gaming_platform",
    prompts: [
      "Chess puzzle rush: higher score screenshot after 3 minutes wins.",
      "Wordle: fewer guesses wins, screenshot required.",
      "Aim Lab score challenge in one run.",
      "Valorant deathmatch: higher final scoreboard kills wins.",
      "Fortnite match: higher placement in one game wins.",
      "Tetris sprint: fastest 40-line clear screenshot wins.",
      "Beat Saber: higher score on the same song wins.",
      "Mario Kart time trial: fastest track time screenshot wins.",
      "League of Legends ARAM: more damage dealt screenshot wins.",
      "Sudoku app: fastest expert puzzle completion screenshot wins.",
    ],
  },
  {
    category: "location_radar",
    prompts: [
      "Nearby challenge: first person to check in at the campus library wins.",
      "Walk-to-join coffee shop challenge within 300 meters.",
      "I want people nearby to join a 10-minute photo scavenger hunt.",
      "Meet at the gym and start a plank challenge only if both are there.",
      "谁先到学校门口打卡谁赢。",
      "Create a challenge at my current location for anyone within half a mile.",
      "Restaurant receipt + GPS check-in: who gets lunch under $10 today?",
      "Park lap challenge: run one loop and upload GPS proof.",
      "Photo at the mural within 20 minutes, nearby users only.",
      "Live route challenge: who walks to the bookstore first?",
    ],
  },
  {
    category: "crypto_oracle",
    prompts: [
      "Today I'm gonna bet BEAT token will reach $2.00.",
      "BTC will hit $120k by Friday.",
      "ETH price below $2500 tomorrow.",
      "SOL over $300 by next Monday.",
      "DOGE under $0.10 in 2 days.",
      "$LINK above $30 by 2026-06-01.",
      "BNB reaches 1000 USD today.",
      "XRP below 1.50 by tomorrow 8pm.",
      "USDC stays above $0.99 today.",
      "AVAX breaks above $80 next week.",
    ],
  },
  {
    category: "public_oracle_adapter",
    prompts: [
      "Will it rain in Seattle tomorrow?",
      "Temperature in Phoenix over 100F this weekend.",
      "Will Apple stock close above $250 next Friday?",
      "Will Lakers win their next game?",
      "Will the S&P 500 close green today?",
      "Will the Fed change rates at the next meeting?",
      "Will a specific YouTube video pass 10,000 views this week?",
      "Will gold spot price close above $3000 next month?",
      "Will a flight arrive before its scheduled time?",
      "Will BTC dominance be above 55% by Sunday?",
    ],
  },
  {
    category: "subjective_manual",
    prompts: [
      "Best homemade latte art photo wins.",
      "Who has the funniest 10-second skit?",
      "Draw a dragon in five minutes; better drawing wins.",
      "Best outfit photo challenge for tonight.",
      "Who can cook the better-looking omelet?",
      "Best short poem about rain wins.",
      "Who gives the more convincing sales pitch?",
      "Best room decoration photo wins.",
      "Who has the coolest sneaker photo?",
      "Most aesthetic sunset photo challenge.",
    ],
  },
  {
    category: "mass_event",
    prompts: [
      "I want 5,000 people to compete in a daily steps leaderboard.",
      "Create a public campus-wide trivia tournament.",
      "Everyone in this city can join a photo hunt leaderboard.",
      "100 people compete to solve the same puzzle fastest.",
      "Open market: predict which team wins the tournament.",
      "A 1,000-person coding leaderboard for the same benchmark task.",
      "Public 30-day reading streak challenge for the whole school.",
      "City-wide 5K leaderboard with GPS submissions.",
      "Mass cooking contest with top 10 manual review.",
      "Everyone nearby joins a one-hour trash cleanup leaderboard.",
    ],
  },
  {
    category: "blocked",
    prompts: [
      "Let's bet who can chug beer fastest.",
      "Fight challenge: winner is whoever punches harder.",
      "I dare someone to steal a street sign.",
      "Secretly record my coworker and bet what they do.",
      "Real money coin flip for $100.",
      "Blackjack challenge with cash payout.",
      "Who can hack an account first?",
      "Drug tolerance challenge.",
      "Prank a stranger without consent.",
      "Cut myself less than last time challenge.",
    ],
  },
  {
    category: "review_high_risk",
    prompts: [
      "Who can hold their breath longest?",
      "No sleep challenge for 48 hours.",
      "Ice bath endurance contest.",
      "Bet about whether my girlfriend texts me back by midnight.",
      "Roof jump distance challenge.",
      "Fasting for 36 hours challenge.",
      "Who can run across the road faster?",
      "Extreme spicy pepper eating challenge.",
      "Who can lift the heaviest without spotter?",
      "Who can stay in sauna the longest?",
    ],
  },
  {
    category: "receipt_document",
    prompts: [
      "Receipt challenge: who spends less than $20 on groceries today?",
      "Budget challenge: save $50 this week and show bank screenshot redacted.",
      "Who can find the cheapest gas receipt today?",
      "Who can sell one item online first and show marketplace proof?",
      "Who can donate a bag of clothes and upload receipt/photo proof?",
      "Who can mail a package earlier with tracking receipt?",
      "Who can spend fewer calories at lunch according to receipt menu?",
      "Who can finish tax filing checklist first with redacted confirmation?",
      "Who can find a flight under $200 and screenshot the fare?",
      "Who can return an item before the deadline with receipt proof?",
    ],
  },
];

function allCases(): EvalCase[] {
  let id = 1;
  return CATEGORIES.flatMap((group) =>
    group.prompts.map((prompt) => ({ id: id++, category: group.category, prompt })),
  );
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text;
  const match = source.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`LLM response did not contain a JSON array: ${text.slice(0, 300)}`);
  return JSON.parse(match[0]) as unknown;
}

function normalizeVerdict(value: unknown): LlmVerdict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = Number(row.id);
  const compileClass = String(row.compileClass ?? "");
  const validClasses = new Set<LlmVerdict["compileClass"]>([
    "auto_ai_vision",
    "auto_oracle",
    "location_protocol",
    "screenshot_platform",
    "manual_review",
    "mass_event",
    "blocked",
    "needs_adapter",
  ]);
  if (!Number.isInteger(id) || !validClasses.has(compileClass as LlmVerdict["compileClass"])) return null;
  return {
    id,
    compileClass: compileClass as LlmVerdict["compileClass"],
    eventuallyJudgeable: row.eventuallyJudgeable === true,
    autoSettlePossible: row.autoSettlePossible === true,
    evidenceNeeded: Array.isArray(row.evidenceNeeded) ? row.evidenceNeeded.map(String).filter(Boolean).slice(0, 5) : [],
    blockers: Array.isArray(row.blockers) ? row.blockers.map(String).filter(Boolean).slice(0, 5) : [],
    reason: typeof row.reason === "string" ? row.reason.slice(0, 500) : "",
  };
}

const SYSTEM = `You are evaluating stubborn challenge prompts against the current product architecture.

Current implemented product capabilities:
- Protocol compiler can represent AI vision challenges, same-camera challenges, solo/pet claims, screenshot/platform evidence, GPS/location protocols, crypto price oracle protocols, manual review, mass-event leaderboards, and blocked challenges.
- Current deterministic auto-oracle settlement is implemented for crypto price challenges through CoinGecko asset id/search + USD spot price, and weather rain/temperature thresholds through Open-Meteo locked location/date/metric snapshots.
- Vision auto-settlement is possible after valid video evidence exists and identity/evidence/confidence gates pass; you are not judging the actual winner now.
- GPS check-in can be protocolized, but exact settlement still requires location proof at execution time.
- Stocks, sports, flights, YouTube metrics, macro data, and BTC dominance need additional oracle adapters before true automatic settlement.
- Subjective taste/beauty/funny/better-looking outputs should be manual_review, not auto-settle.
- Unsafe, illegal, non-consensual, drug/alcohol, chance-based real-money, or self-harm prompts must be blocked.
- Real money wagering must not be allowed in US/unknown jurisdictions; internal credits only unless legal/payment policy allows it.

For each input case, return a strict JSON array. One object per case:
{
  "id": number,
  "compileClass": "auto_ai_vision" | "auto_oracle" | "location_protocol" | "screenshot_platform" | "manual_review" | "mass_event" | "blocked" | "needs_adapter",
  "eventuallyJudgeable": boolean,
  "autoSettlePossible": boolean,
  "evidenceNeeded": string[],
  "blockers": string[],
  "reason": string
}

Definitions:
- eventuallyJudgeable=true means this can eventually reach a verdict if the required protocol/evidence/adapter exists.
- autoSettlePossible=true means this challenge type can be automatically settled by the current architecture AFTER all required future evidence/oracle data is submitted and confidence gates pass. Do NOT set this false merely because no evidence is attached in this eval.
- For objective physical/video contests such as push-ups, plank, squats, sports counts, object speed tasks, same-camera races, and timer/count challenges, use compileClass="auto_ai_vision" and autoSettlePossible=true when the rules can be objectively judged from clear video.
- For crypto price threshold prompts with a ticker/coin/token, target, direction, and deadline, use compileClass="auto_oracle" and autoSettlePossible=true because the current product has a CoinGecko crypto price oracle path. This includes common or searchable symbols such as BTC, ETH, SOL, DOGE, LINK, BNB, XRP, USDC, AVAX, and BEAT; do not mark these as needs_adapter merely because the ticker is less common.
- For weather rain/temperature prompts with a location and date/time window, use compileClass="auto_oracle" and autoSettlePossible=true because the current product has an Open-Meteo weather oracle path.
- For screenshot/platform score challenges, autoSettlePossible=false unless the score is from a trusted integrated platform oracle; screenshots normally need manual/review or anti-cheat checks.
- needs_adapter means conceptually judgeable, but current product needs a new oracle/provider adapter before auto-settlement.
- Do not claim actual winner judgment for physical/video cases because no evidence is attached.`;

async function evaluateBatch(providerId: string, model: string, batch: EvalCase[]) {
  const user = `Evaluate these cases. Return JSON array only.\n${JSON.stringify(batch, null, 2)}`;
  const result = await completeOraclePromptWithMetadata({
    providerId,
    model,
    system: SYSTEM,
    user,
    maxTokens: 3500,
    temperature: 0,
  });
  const parsed = extractJsonArray(result.text);
  if (!Array.isArray(parsed)) throw new Error("LLM JSON root is not an array");
  const rows = parsed.map(normalizeVerdict);
  if (rows.some((row) => row === null)) {
    throw new Error(`LLM returned invalid rows: ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  return { rows: rows as LlmVerdict[], metadata: result.metadata };
}

function summarize(results: LlmVerdict[]) {
  return results.reduce<Record<string, number>>((acc, row) => {
    acc[row.compileClass] = (acc[row.compileClass] ?? 0) + 1;
    acc.eventuallyJudgeable = (acc.eventuallyJudgeable ?? 0) + (row.eventuallyJudgeable ? 1 : 0);
    acc.autoSettlePossible = (acc.autoSettlePossible ?? 0) + (row.autoSettlePossible ? 1 : 0);
    return acc;
  }, {});
}

function looksLikeWeatherOraclePrompt(prompt: string) {
  return /\brain|raining|precipitation|temperature|temp|high|low|weather\b/i.test(prompt);
}

const KNOWN_CRYPTO_ORACLE_SYMBOLS = new Set(["BTC", "ETH", "SOL", "DOGE", "LINK", "BNB", "XRP", "USDC", "AVAX"]);

async function applyImplementedCapabilityOverrides(cases: EvalCase[], rows: LlmVerdict[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const now = new Date("2026-05-23T12:00:00.000Z");
  for (const item of cases) {
    const row = byId.get(item.id);
    if (!row) continue;
    if (item.category === "crypto_oracle") {
      const spec = extractCryptoPriceOracleSpec({ title: item.prompt, now });
      const staticallySupported = Boolean(spec?.symbol && KNOWN_CRYPTO_ORACLE_SYMBOLS.has(spec.symbol));
      const protocol = staticallySupported ? null : await cryptoPriceProtocolFromPrompt(item.prompt, "en", now);
      if (staticallySupported || protocol) {
        byId.set(item.id, {
          ...row,
          compileClass: "auto_oracle",
          eventuallyJudgeable: true,
          autoSettlePossible: true,
          evidenceNeeded: ["CoinGecko USD spot price at locked settlement time"],
          blockers: [],
          reason: "Deterministic override: current code compiled this crypto prompt to a CoinGecko auto-oracle protocol.",
        });
      }
    }
    if (item.category === "public_oracle_adapter" && looksLikeWeatherOraclePrompt(item.prompt)) {
      const protocol = await weatherProtocolFromPrompt(item.prompt, "en", now);
      if (protocol) {
        byId.set(item.id, {
          ...row,
          compileClass: "auto_oracle",
          eventuallyJudgeable: true,
          autoSettlePossible: true,
          evidenceNeeded: ["Open-Meteo locked daily weather snapshot"],
          blockers: [],
          reason: "Deterministic override: current code compiled this weather prompt to an Open-Meteo auto-oracle protocol.",
        });
      }
    }
  }
  return rows.map((row) => byId.get(row.id) ?? row);
}

function renderMarkdown(cases: EvalCase[], results: LlmVerdict[], metadata: unknown[]) {
  const byId = new Map(results.map((row) => [row.id, row]));
  const summary = summarize(results);
  return [
    "# stubborn 140 LLM Judgeability Eval",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This eval uses an LLM to assess whether prompts are eventually judgeable, then applies deterministic overrides where the current code proves a crypto/weather oracle compiler exists. It does not prove actual video evidence judgment or final settlement.",
    "",
    "## Summary",
    "",
    `- Total prompts: ${cases.length}`,
    `- LLM verdict rows: ${results.length}`,
    `- Eventually judgeable: ${summary.eventuallyJudgeable ?? 0}`,
    `- Auto-settle possible in current architecture: ${summary.autoSettlePossible ?? 0}`,
    ...Object.entries(summary)
      .filter(([key]) => key !== "eventuallyJudgeable" && key !== "autoSettlePossible")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Provider Calls",
    "",
    "```json",
    JSON.stringify(metadata, null, 2),
    "```",
    "",
    "## Cases",
    "",
    "| # | Category | Class | Judgeable | Auto-settle | Prompt | Blockers |",
    "|---:|---|---|---|---|---|---|",
    ...cases.map((item) => {
      const row = byId.get(item.id);
      return `| ${item.id} | ${item.category} | ${row?.compileClass ?? "missing"} | ${row?.eventuallyJudgeable ? "yes" : "no"} | ${row?.autoSettlePossible ? "yes" : "no"} | ${item.prompt.replaceAll("|", "\\|")} | ${(row?.blockers ?? []).join("; ").replaceAll("|", "\\|")} |`;
    }),
    "",
  ].join("\n");
}

async function main() {
  const cases = allCases();
  const limit = Math.min(cases.length, Number(process.env.LLM_EVAL_LIMIT ?? cases.length));
  const selected = cases.slice(0, limit);
  const live = process.env.RUN_PAID_LLM_EVAL === "1";
  const providerId = process.env.LLM_EVAL_PROVIDER || process.env.ORACLE_DEFAULT_PROVIDER?.replaceAll('"', "") || "openai";
  const model = process.env.LLM_EVAL_MODEL || "gpt-5-mini";
  const batchSize = Math.max(1, Number(process.env.LLM_EVAL_BATCH_SIZE ?? 10));
  const reportPath = process.env.LLM_EVAL_REPORT_PATH || "docs/evals/stubborn-140-llm-judgeability-2026-05-23.md";

  if (!live) {
    const dry = {
      live: false,
      totalCases: cases.length,
      selectedCases: selected.length,
      providerId,
      model,
      batchSize,
      plannedCalls: Math.ceil(selected.length / batchSize),
      reportPath,
      message: "Set RUN_PAID_LLM_EVAL=1 to make real provider calls.",
    };
    console.log(JSON.stringify(dry, null, 2));
    return;
  }

  process.env.ALLOW_PAID_AI ||= "1";

  const rows: LlmVerdict[] = [];
  const callMetadata: LlmCallMetadata[] = [];
  for (const batch of chunks(selected, batchSize)) {
    const out = await evaluateBatch(providerId, model, batch);
    rows.push(...out.rows);
    callMetadata.push(out.metadata);
    console.log(JSON.stringify({
      batch: `${batch[0].id}-${batch[batch.length - 1].id}`,
      rows: out.rows.length,
      providerId: out.metadata.providerId,
      model: out.metadata.model,
      totalTokens: out.metadata.totalTokens,
      durationMs: out.metadata.durationMs,
    }));
  }

  const missing = selected.filter((item) => !rows.some((row) => row.id === item.id));
  if (missing.length) throw new Error(`Missing LLM verdicts for ids: ${missing.map((item) => item.id).join(", ")}`);

  const verifiedRows = await applyImplementedCapabilityOverrides(selected, rows);

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderMarkdown(selected, verifiedRows, callMetadata), "utf8");

  console.log(JSON.stringify({
    live: true,
    totalCases: cases.length,
    selectedCases: selected.length,
    providerId,
    model,
    calls: callMetadata.length,
    tokenTotal: callMetadata.reduce((sum, item) => sum + (Number(item.totalTokens) || 0), 0),
    reportPath,
    summary: summarize(verifiedRows),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
