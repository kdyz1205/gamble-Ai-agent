import { config as dotenvConfig } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cryptoPriceProtocolFromPrompt, extractCryptoPriceOracleSpec } from "../src/lib/crypto-price-oracle";
import { completeOraclePromptWithMetadata, type LlmCallMetadata } from "../src/lib/llm-router";
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

const WILD_CASES: Array<{ category: string; prompt: string }> = [
  { category: "video_pushup_speed", prompt: "I bet Jerry I can do 20 push-ups faster than him in one continuous side-view video." },
  { category: "same_camera_water_bottle", prompt: "One phone records both of us opening sealed water bottles; first safe finish wins." },
  { category: "solo_cat_food", prompt: "I bet my cat can finish one measured bowl of food in under one minute on camera." },
  { category: "oracle_crypto_beat", prompt: "Today I'm gonna bet BEAT token will reach $2.00." },
  { category: "oracle_weather_rain", prompt: "Will it rain in Seattle tomorrow?" },
  { category: "gps_library_checkin", prompt: "First person to check in at the campus library lobby within 300 meters wins." },
  { category: "screenshot_leetcode", prompt: "LeetCode easy race: first accepted solution screenshot with timestamp wins." },
  { category: "manual_latte_art", prompt: "Best homemade latte art photo wins after manual review." },
  { category: "blocked_beer_chug", prompt: "Let's bet who can chug beer fastest." },
  { category: "mass_steps_event", prompt: "I want 5,000 people to compete in a daily steps leaderboard." },
  { category: "receipt_grocery_budget", prompt: "Who spends less than $20 on groceries today using an itemized receipt?" },
  { category: "platform_duolingo_xp", prompt: "Duolingo challenge: highest XP earned today by 11:59 PM screenshot wins." },
  { category: "video_rubiks_cube", prompt: "Rubik's cube solve race with continuous timer video and solved cube visible at the end." },
  { category: "oracle_stock_apple", prompt: "Will Apple stock close above $250 next Friday?" },
  { category: "photo_desk_clean", prompt: "I will clean my desk before midnight and prove it with before-and-after photos." },
  { category: "blocked_secret_recording", prompt: "Secretly record my coworker and bet what they do during lunch." },
  { category: "gps_mural_photo", prompt: "Nearby users must take a photo at the downtown mural within 20 minutes." },
  { category: "screenshot_chess_puzzle", prompt: "Chess puzzle rush: higher score screenshot after exactly 3 minutes wins." },
  { category: "video_free_throw", prompt: "Who can make more basketball free throws out of 20 on camera?" },
  { category: "oracle_weather_temperature", prompt: "Temperature in Phoenix over 100F this weekend." },
  { category: "manual_poetry", prompt: "Best four-line poem about rain wins, judged by a reviewer." },
  { category: "blocked_fight", prompt: "Fight challenge: winner is whoever punches harder." },
  { category: "solo_plant_growth", prompt: "I bet my basil plant grew at least 1 cm this month with ruler photo proof." },
  { category: "oracle_crypto_btc", prompt: "BTC will hit $120k by Friday." },
  { category: "platform_todoist", prompt: "Who can close more Todoist tasks today with project screenshots?" },
  { category: "location_coffee_walk", prompt: "Walk-to-join challenge: arrive at the coffee shop within 300 meters." },
  { category: "video_bottle_flip", prompt: "Bottle flip challenge: first to land five valid flips in one uncut video wins." },
  { category: "oracle_sports_lakers", prompt: "Will the Lakers win their next game?" },
  { category: "receipt_package_tracking", prompt: "Who can mail a package earlier and upload the tracking receipt first?" },
  { category: "blocked_cash_coinflip", prompt: "Real money coin flip for $100." },
  { category: "same_camera_paper_crane", prompt: "Same camera: two people fold paper cranes; first recognizable crane wins." },
  { category: "screenshot_typing_wpm", prompt: "Typing test: highest WPM on Monkeytype screenshot by tonight." },
  { category: "solo_robot_vacuum", prompt: "I bet my robot vacuum can finish the living room under 15 minutes." },
  { category: "oracle_crypto_eth", prompt: "ETH price below $2500 tomorrow." },
  { category: "mass_trivia_campus", prompt: "Create a campus-wide trivia tournament with a public leaderboard." },
  { category: "manual_sales_pitch", prompt: "Who gives the more convincing one-minute sales pitch?" },
  { category: "blocked_hacking", prompt: "Who can hack an account first?" },
  { category: "gps_park_lap", prompt: "Park lap challenge: run one loop and submit GPS route proof." },
  { category: "screenshot_wordle", prompt: "Wordle challenge: fewer guesses wins with screenshot proof." },
  { category: "video_cup_stacking", prompt: "Cup stacking speed challenge with a visible timer and stable final stack." },
  { category: "oracle_macro_fed", prompt: "Will the Fed change rates at the next meeting?" },
  { category: "receipt_gas_price", prompt: "Who can find the cheapest gas receipt today within the city?" },
  { category: "review_breath_hold", prompt: "Who can hold their breath longest?" },
  { category: "solo_no_soda", prompt: "I bet I can complete a 7-day no-soda streak with daily check-ins." },
  { category: "oracle_crypto_sol", prompt: "SOL over $300 by next Monday." },
  { category: "platform_github_commits", prompt: "GitHub challenge: who lands more real commits by midnight?" },
  { category: "location_gym_copresence", prompt: "Start a plank challenge only if both users are checked in at the same gym." },
  { category: "video_soccer_juggling", prompt: "Soccer juggling: most touches without dropping the ball wins." },
  { category: "oracle_youtube_views", prompt: "Will a specific YouTube video pass 10,000 views this week?" },
  { category: "manual_room_decor", prompt: "Best room decoration photo wins after manual review." },
  { category: "blocked_steal_sign", prompt: "I dare someone to steal a street sign." },
  { category: "same_camera_chess_puzzle", prompt: "We are at the table together; same camera chess puzzle race." },
  { category: "screenshot_aim_lab", prompt: "Aim Lab score challenge: highest one-run score screenshot wins." },
  { category: "solo_dinner_photo", prompt: "I bet I can cook dinner before 7 PM and upload a finished plate photo." },
  { category: "oracle_crypto_doge", prompt: "DOGE under $0.10 in 2 days." },
  { category: "mass_photo_hunt_city", prompt: "Everyone in this city can join a photo hunt leaderboard." },
  { category: "receipt_donation", prompt: "Who can donate a bag of clothes and upload donation receipt or photo proof?" },
  { category: "review_no_sleep", prompt: "No sleep challenge for 48 hours." },
  { category: "video_darts_score", prompt: "Darts accuracy challenge: highest score after nine darts wins." },
  { category: "oracle_gold_spot", prompt: "Will gold spot price close above $3000 next month?" },
  { category: "platform_fortnite_placement", prompt: "Fortnite match challenge: higher placement in one game wins." },
  { category: "location_restaurant_receipt", prompt: "Restaurant receipt plus GPS check-in: who gets lunch under $10 today?" },
  { category: "manual_outfit_photo", prompt: "Best outfit photo challenge for tonight." },
  { category: "blocked_drugs", prompt: "Drug tolerance challenge." },
  { category: "same_camera_mini_jigsaw", prompt: "Same camera: two players solve mini jigsaw puzzles; fastest correct finish wins." },
  { category: "screenshot_anki_reviews", prompt: "Anki challenge: more cards completed correctly by midnight wins." },
  { category: "solo_reading_summary", prompt: "I bet I can finish reading chapter 3 tonight and submit a summary." },
  { category: "oracle_crypto_link", prompt: "$LINK above $30 by 2026-06-01." },
  { category: "mass_coding_benchmark", prompt: "A 1,000-person coding leaderboard for the same benchmark task." },
  { category: "receipt_online_sale", prompt: "Who can sell one item online first and show marketplace proof?" },
  { category: "review_ice_bath", prompt: "Ice bath endurance contest." },
  { category: "video_ping_pong_target", prompt: "Ping-pong serve target challenge: most target hits in 10 tries wins." },
  { category: "oracle_flight_arrival", prompt: "Will a flight arrive before its scheduled time?" },
  { category: "platform_valorant_scoreboard", prompt: "Valorant deathmatch: higher final scoreboard kills wins." },
  { category: "location_bookstore_route", prompt: "Live route challenge: who walks to the bookstore first?" },
  { category: "manual_omelet_photo", prompt: "Who can cook the better-looking omelet?" },
  { category: "blocked_prank_stranger", prompt: "Prank a stranger without consent." },
  { category: "same_camera_typing_sentence", prompt: "Same camera: who can type the displayed sentence with fewer mistakes?" },
  { category: "screenshot_kaggle_submission", prompt: "Kaggle notebook race: first valid submission before the deadline wins." },
  { category: "solo_meditation_streak", prompt: "I bet I can finish a 5-minute meditation streak every day this week." },
  { category: "oracle_crypto_bnb", prompt: "BNB reaches 1000 USD today." },
  { category: "mass_reading_streak_school", prompt: "Public 30-day reading streak challenge for the whole school." },
  { category: "receipt_bank_savings", prompt: "Budget challenge: save $50 this week and show a redacted bank confirmation." },
  { category: "review_roof_jump", prompt: "Roof jump distance challenge." },
  { category: "video_paper_airplane", prompt: "Paper airplane distance challenge in a hallway with continuous video." },
  { category: "oracle_btc_dominance", prompt: "Will BTC dominance be above 55% by Sunday?" },
  { category: "platform_beat_saber", prompt: "Beat Saber challenge: higher score on the same song wins." },
  { category: "location_nearby_photo_scavenger", prompt: "I want nearby people to join a 10-minute photo scavenger hunt." },
  { category: "manual_sneaker_photo", prompt: "Who has the coolest sneaker photo?" },
  { category: "blocked_self_harm", prompt: "Cut myself less than last time challenge." },
  { category: "same_camera_water_pour", prompt: "Same camera: who can pour exactly 250 ml of water closer to target?" },
  { category: "screenshot_math_quiz", prompt: "Who gets a higher score on this math quiz screenshot?" },
  { category: "solo_dog_fetch", prompt: "I bet my dog can fetch the ball back in under 20 seconds." },
  { category: "oracle_crypto_xrp", prompt: "XRP below 1.50 by tomorrow 8pm." },
  { category: "mass_city_5k", prompt: "City-wide 5K leaderboard with GPS submissions." },
  { category: "receipt_return_item", prompt: "Who can return an item before the deadline with receipt proof?" },
  { category: "review_fasting", prompt: "Fasting for 36 hours challenge." },
  { category: "video_jenga_height", prompt: "Jenga tower height challenge: tallest stable tower after five minutes wins." },
  { category: "oracle_sp500_close", prompt: "Will the S&P 500 close green today?" },
  { category: "platform_tetris_sprint", prompt: "Tetris sprint: fastest 40-line clear screenshot wins." },
  { category: "location_school_gate", prompt: "First person to check in at the school gate wins." },
  { category: "manual_sunset_photo", prompt: "Most aesthetic sunset photo challenge." },
  { category: "blocked_blackjack_cash", prompt: "Blackjack challenge with cash payout." },
  { category: "same_camera_spelling_bee", prompt: "Same camera spelling bee: fewer wrong words after 20 prompts wins." },
  { category: "screenshot_readwise_highlights", prompt: "Readwise challenge: who creates 20 useful highlights today." },
  { category: "solo_language_words", prompt: "I bet I can memorize 30 vocabulary words today and screenshot the quiz." },
  { category: "oracle_crypto_usdc", prompt: "USDC stays above $0.99 today." },
  { category: "mass_cooking_top10", prompt: "Mass cooking contest where the top 10 entries receive manual review." },
  { category: "receipt_tax_checklist", prompt: "Who can finish the tax filing checklist first with redacted confirmation?" },
  { category: "review_road_run", prompt: "Who can run across the road faster?" },
  { category: "video_hula_hoop", prompt: "Hula hoop duration challenge with full-body video." },
  { category: "oracle_prediction_team_wins", prompt: "Open market: predict which team wins the tournament." },
  { category: "platform_mario_kart_time", prompt: "Mario Kart time trial: fastest track time screenshot wins." },
  { category: "location_current_half_mile", prompt: "Create a public challenge at my current location for anyone within half a mile." },
  { category: "manual_short_skit", prompt: "Who has the funniest 10-second skit?" },
  { category: "blocked_sauna_duration", prompt: "Who can stay in sauna the longest?" },
  { category: "same_camera_coin_sorting", prompt: "Same camera: who can sort a mixed jar of coins more accurately in two minutes?" },
  { category: "screenshot_code_golf", prompt: "Code golf: shorter accepted solution screenshot wins." },
  { category: "solo_package_mail", prompt: "I bet I can mail a thank-you card today with receipt proof." },
  { category: "oracle_crypto_avax", prompt: "AVAX breaks above $80 next week." },
  { category: "mass_cleanup_leaderboard", prompt: "Everyone nearby joins a one-hour trash cleanup leaderboard with bag-count proof." },
  { category: "receipt_flight_fare", prompt: "Who can find a flight under $200 and screenshot the fare?" },
  { category: "review_heavy_lift", prompt: "Who can lift the heaviest without a spotter?" },
  { category: "video_yoga_tree_pose", prompt: "Yoga tree pose hold challenge with full-body video." },
  { category: "oracle_fx_rate", prompt: "Will EUR/USD trade above 1.10 tomorrow?" },
  { category: "platform_sudoku_expert", prompt: "Sudoku app: fastest expert puzzle completion screenshot wins." },
  { category: "location_museum_qr", prompt: "Museum challenge: scan the lobby QR code in person before 5 PM." },
  { category: "manual_dragon_drawing", prompt: "Draw a dragon in five minutes; better drawing wins." },
  { category: "blocked_extreme_spicy", prompt: "Extreme spicy pepper eating challenge." },
  { category: "same_camera_memory_cards", prompt: "Same camera: flip matching memory cards; most pairs in three minutes wins." },
  { category: "screenshot_strava_5k", prompt: "Strava 5K challenge: fastest pace screenshot plus GPS map wins." },
  { category: "solo_inbox_zero", prompt: "I bet I can reach inbox zero before 9 PM with redacted screenshot proof." },
  { category: "oracle_election_polling", prompt: "Will Candidate A lead the national polling average next Monday?" },
  { category: "mass_puzzle_100_people", prompt: "100 people compete to solve the same puzzle fastest." },
  { category: "receipt_calorie_lunch", prompt: "Who can spend fewer calories at lunch according to the receipt menu?" },
  { category: "review_private_relationship", prompt: "Bet about whether my girlfriend texts me back by midnight." },
  { category: "video_balance_one_foot", prompt: "Balance on one foot: loser is whoever touches down first." },
  { category: "oracle_youtube_subscribers", prompt: "Will a YouTube channel gain 1,000 subscribers by Friday?" },
  { category: "platform_league_aram_damage", prompt: "League of Legends ARAM: more damage dealt screenshot wins." },
  { category: "location_event_ticket", prompt: "Live event challenge: only users inside the concert venue can join." },
];

function allCases(): EvalCase[] {
  return WILD_CASES.map((item, index) => ({ id: index + 1, ...item }));
}

function validateCases(cases: EvalCase[]) {
  assert.equal(cases.length, 140, "Diverse eval must contain exactly 140 prompts.");
  assert.equal(new Set(cases.map((item) => item.prompt.toLowerCase())).size, 140, "Prompts must be unique.");
  assert.equal(new Set(cases.map((item) => item.category)).size, 140, "Each prompt must have a unique domain/category.");
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

const SYSTEM = `You are evaluating GambleAI challenge prompts against the current product architecture.

This is a deliberately wide-spectrum eval. The 140 prompts are intentionally different domains, evidence types, risk profiles, oracle needs, and settlement modes. Do not assume one prompt's answer from another prompt.

Current implemented product capabilities:
- Protocol compiler can represent AI vision challenges, same-camera challenges, solo/pet claims, screenshot/platform evidence, GPS/location protocols, crypto price oracle protocols, weather oracle protocols, manual review, mass-event leaderboards, and blocked challenges.
- Current deterministic auto-oracle settlement is implemented for crypto price challenges through CoinGecko asset id/search + USD spot price, and weather rain/temperature thresholds through Open-Meteo locked location/date/metric snapshots.
- Vision auto-settlement is possible after valid video evidence exists and identity/evidence/confidence gates pass; you are not judging the actual winner now.
- GPS check-in can be protocolized, but exact settlement still requires location proof at execution time.
- Stocks, sports, flights, YouTube metrics, macro data, FX, gold, polling, and BTC dominance need additional oracle adapters before true automatic settlement.
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
- autoSettlePossible=true means this challenge type can be automatically settled by the current architecture after required future evidence/oracle data is submitted and confidence gates pass. Do not set this false merely because no evidence is attached in this eval.
- For objective physical/video contests, use compileClass="auto_ai_vision" and autoSettlePossible=true when the rules can be objectively judged from clear video.
- For crypto price threshold prompts with a ticker/coin/token, target, direction, and deadline, use compileClass="auto_oracle" and autoSettlePossible=true because the current product has a CoinGecko crypto price oracle path. This includes BTC, ETH, SOL, DOGE, LINK, BNB, XRP, USDC, AVAX, and BEAT.
- For weather rain/temperature prompts with a location and date/time window, use compileClass="auto_oracle" and autoSettlePossible=true because the current product has an Open-Meteo weather oracle path.
- For screenshot/platform score challenges, autoSettlePossible=false unless the score is from a trusted integrated platform oracle; screenshots normally need manual review or anti-cheat checks.
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

const KNOWN_CRYPTO_ORACLE_SYMBOLS = new Set(["BTC", "ETH", "SOL", "DOGE", "LINK", "BNB", "XRP", "USDC", "AVAX"]);

async function applyImplementedCapabilityOverrides(cases: EvalCase[], rows: LlmVerdict[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const now = new Date("2026-05-23T12:00:00.000Z");
  for (const item of cases) {
    const row = byId.get(item.id);
    if (!row) continue;
    if (item.category.startsWith("oracle_crypto_")) {
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
          reason: "Deterministic override: current code can compile this crypto prompt to a CoinGecko auto-oracle protocol.",
        });
      }
    }
    if (item.category.startsWith("oracle_weather_")) {
      const protocol = await weatherProtocolFromPrompt(item.prompt, "en", now);
      if (protocol) {
        byId.set(item.id, {
          ...row,
          compileClass: "auto_oracle",
          eventuallyJudgeable: true,
          autoSettlePossible: true,
          evidenceNeeded: ["Open-Meteo locked daily weather snapshot"],
          blockers: [],
          reason: "Deterministic override: current code can compile this weather prompt to an Open-Meteo auto-oracle protocol.",
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
    "# GambleAI Diverse 140 Judgeability Eval",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This eval uses 140 deliberately different prompts. Each row has a unique domain/category and a unique prompt. It uses an LLM for classification, then applies deterministic overrides where the current code proves a crypto/weather oracle compiler exists. It does not prove actual video evidence judgment or final settlement.",
    "",
    "## Diversity Checks",
    "",
    `- Unique prompts: ${new Set(cases.map((item) => item.prompt.toLowerCase())).size}`,
    `- Unique domains/categories: ${new Set(cases.map((item) => item.category)).size}`,
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
    "| # | Domain | Class | Eventually Judgeable | Auto-Settle Possible | Prompt | Blockers |",
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
  validateCases(cases);
  const live = process.env.RUN_PAID_LLM_EVAL === "1" || process.argv.includes("--live");
  const providerId = process.env.LLM_EVAL_PROVIDER || process.env.ORACLE_DEFAULT_PROVIDER?.replaceAll('"', "") || "openai";
  const model = process.env.LLM_EVAL_MODEL || "gpt-5.4-mini";
  const batchSize = Math.max(1, Number(process.env.LLM_EVAL_BATCH_SIZE ?? 10));
  const reportPath = process.env.LLM_EVAL_REPORT_PATH || "docs/evals/gambleai-140-diverse-judgeability-2026-05-24.md";

  if (!live) {
    console.log(JSON.stringify({
      live: false,
      selectedCases: cases.length,
      uniquePrompts: new Set(cases.map((item) => item.prompt.toLowerCase())).size,
      uniqueCategories: new Set(cases.map((item) => item.category)).size,
      providerId,
      model,
      batchSize,
      plannedCalls: Math.ceil(cases.length / batchSize),
      reportPath,
      message: "Pass --live or set RUN_PAID_LLM_EVAL=1 to make real provider calls.",
    }, null, 2));
    return;
  }

  process.env.ALLOW_PAID_AI ||= "1";
  const rows: LlmVerdict[] = [];
  const callMetadata: LlmCallMetadata[] = [];
  for (const batch of chunks(cases, batchSize)) {
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

  const missing = cases.filter((item) => !rows.some((row) => row.id === item.id));
  if (missing.length) throw new Error(`Missing LLM verdicts for ids: ${missing.map((item) => item.id).join(", ")}`);

  const verifiedRows = await applyImplementedCapabilityOverrides(cases, rows);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderMarkdown(cases, verifiedRows, callMetadata), "utf8");

  console.log(JSON.stringify({
    live: true,
    selectedCases: cases.length,
    uniquePrompts: new Set(cases.map((item) => item.prompt.toLowerCase())).size,
    uniqueCategories: new Set(cases.map((item) => item.category)).size,
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
