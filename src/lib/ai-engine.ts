import {
  completeOraclePrompt,
  completeOraclePromptWithMetadata,
  completeOraclePromptWithTools,
  completeOracleJudgeVisionWithMetadata,
  type LlmCallMetadata,
  type ToolInvocation,
} from "./llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById, isProviderConfigured } from "./llm-providers";
import { ORACLE_TOOLS, toAttachment, type OracleAttachment } from "./oracle-tools";
import {
  prepareParticipantVisuals,
  prepareParticipantVisualsFast,
  capJudgeVisuals,
  type JudgeVisionImage,
} from "./media/prepare-evidence-visuals";

/**
 * Resolve the effective LLM provider + model for non-vision text calls (parse,
 * adjust-draft). Honors ORACLE_DEFAULT_PROVIDER so operators can flip the whole
 * app to OpenAI / Google / etc. without touching code. A passed-in `model` that
 * doesn't match the resolved provider is dropped (a Claude model id would 404
 * against OpenAI's API) and replaced with that provider's defaultModel.
 */
function resolveOracle(preferredModel?: string): { providerId: string; model: string } {
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const providerId =
    envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  const looksLikeClaude = preferredModel?.toLowerCase().startsWith("claude");
  const looksLikeGpt = preferredModel?.toLowerCase().startsWith("gpt") || preferredModel?.toLowerCase().startsWith("o");
  const looksLikeGemini = preferredModel?.toLowerCase().startsWith("gemini");
  const modelMatchesProvider =
    (providerId === "anthropic" && looksLikeClaude) ||
    (providerId === "openai" && looksLikeGpt) ||
    (providerId === "google" && looksLikeGemini) ||
    // Other openai-compatible backends accept any string — trust the caller.
    (def?.kind === "openai_compat" && providerId !== "openai" && Boolean(preferredModel));
  const model = modelMatchesProvider && preferredModel ? preferredModel : (def?.defaultModel ?? preferredModel ?? "");
  return { providerId, model };
}

function oracleKeyAvailable(providerId: string): boolean {
  const def = getProviderById(providerId);
  if (!def) return false;
  if (def.apiKeyOptional) return isProviderConfigured(def);
  return Boolean(process.env[def.envVar]?.trim());
}

/** A single AI-recommended stake tier with reasoning. */
export interface StakeOption {
  amount: number;       // in credits; 0 = free
  label: string;        // short tag e.g. "Friendly", "Serious", "Real skin in game"
  reasoning: string;    // why AI thinks this tier fits this challenge
}

/** A single AI-recommended evidence mode with reasoning. */
export interface EvidenceOption {
  type: string;         // "video" | "photo" | "gps" | "self_report" | "witness" | "screenshot" | "receipt" | ...
  label: string;        // human-friendly label e.g. "Full match recording"
  reasoning: string;    // why AI recommends this
  required?: boolean;   // true if AI thinks this is essential, not just one of several options
}

/** A single AI-recommended deadline with reasoning. */
export interface DeadlineOption {
  duration: string;     // e.g. "1 hour", "24 hours", "7 days", "30 days"
  reasoning: string;    // why this timeline fits
}

export interface ParsedChallenge {
  // ── Intent classification ──
  intent?: "definite_market" | "candidate_market" | "ordinary_chat" | "chat_reply";

  // ── Core understanding ──
  title: string;
  proposition?: string;
  marketType?: "yes_no" | "threshold" | "head_to_head" | "challenge";
  type: string;
  subject?: string;
  isPublic: boolean;

  // ── Chosen defaults (AI picks one from each *Options list) ──
  suggestedStake: number;
  evidenceType: string;
  deadline: string;
  rules: string;

  // ── AI-generated contextual options (replaces hardcoded UI chips) ──
  stakeOptions?: StakeOption[];
  evidenceOptions?: EvidenceOption[];
  deadlineOptions?: DeadlineOption[];

  // ── AI's contextual reasoning ──
  redFlags?: string[];                 // safety, abuse, ambiguity concerns
  recommendationSummary?: string;      // one-sentence overview of AI's take

  // ── What's still unclear ──
  missingFields?: string[];
  clarifyingQuestion?: string;         // in user's input language

  // ── Oracle attachments (populated when AI calls real-world tools during parse) ──
  oracles?: OracleAttachment[];        // e.g. [{ source: "CoinGecko", currentValue: "$63,421", ... }]
  toolInvocations?: Array<{ name: string; ok: boolean; error?: string }>; // audit trail

  // ── Proactive action suggestions (AI-generated UI affordances) ──
  actionItems?: Array<{
    type: "topup" | "adjust_stake" | "add_opponent" | "reduce_scope" | "other";
    label: string;                     // in user's language; e.g. "Top up 25 credits"
    reasoning: string;                 // why AI is suggesting this
    payload?: Record<string, unknown>; // { amount: 25 } etc.
  }>;
}

export interface JudgmentResult {
  winnerId: string | null;
  reasoning: string;
  confidence: number;
  evidenceQuality?: "good" | "unclear" | "insufficient" | "invalid";
  recommendation?: "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner";
  /** @deprecated use recommendation. Kept so older callers/tests do not break immediately. */
  settlementRecommendation?: "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner" | "refund" | "manual_review";
  blockingIssues?: string[];
  source?: "deterministic" | "vision_llm" | "llm" | "fallback";
  providerCall?: LlmCallMetadata;
  videoMetrics?: VideoJudgmentMetrics;
}

export interface VideoJudgmentParticipantMetrics {
  validRepCount: number | null;
  invalidRepNotes: string[];
  fullDurationCovered: boolean | null;
  livenessPhraseVisible: boolean | null;
  fullBodyVisible: boolean | null;
  continuousAttemptLikely: boolean | null;
  videoTooShort: boolean | null;
  suspectedEditingOrLoop: boolean | null;
  antiCheatFlags: string[];
  reasonForManualReview?: string | null;
  unclearReason?: string | null;
}

export interface VideoJudgmentMetrics {
  participantA: VideoJudgmentParticipantMetrics;
  participantB: VideoJudgmentParticipantMetrics;
  validRepDefinition: string;
  framesInspected: number;
  judgingMethod: string;
}

const MARKET_COMPILER_PROMPT = `You are the AI brain of a challenge/betting platform. The user describes a challenge in natural language (any language — English, Chinese, mixed, Spanish, etc.). You must ALWAYS respond in the user's input language for any human-facing text fields (labels, reasoning, clarifyingQuestion, recommendationSummary, redFlags).

Your job is to think like a thoughtful product manager about what this specific challenge needs — NOT to offer generic hardcoded options. Different challenges need different stakes, different evidence, different timelines.

Examples of contextual thinking:
- UFC / physical combat → video REQUIRED + neutral witness strongly suggested, 30-90 days (training time), high stakes (100-1000 cr) because real physical commitment
- Pushup contest → video REQUIRED (self-film), minutes-to-hours deadline, low stakes (5-25 cr) — fun bet between friends
- Who reads a book faster → self_report acceptable, 1-2 weeks, small stakes (5-10 cr)
- Prediction markets (election / price / sports outcome) → objective public data source, longer deadline, stakes per user's appetite
- "I'll quit smoking for 30 days" → habit change, periodic photo or self_report, high stakes make it meaningful
- Cooking a specific dish → photo + recipe detail, short deadline
- Coding / LeetCode speed → screenshot + timestamp, short deadline
- Eating challenge → video, restaurant receipt bonus, short deadline

PHILOSOPHY: DECIDE FOR THE USER BY DEFAULT.
The user wants the platform to do the thinking for them. Don't force questions when you can make a reasonable call.
- Always produce a complete draft with your best picks for every field, even when user was vague.
- missingFields should be EMPTY unless a field is genuinely ambiguous in a way that changes the challenge shape (e.g. "did you mean real UFC or joke arm-wrestle?").
- clarifyingQuestion should be null unless you truly need the user to pick between two different kinds of challenges.
- A missing stake, vague evidence, or no deadline is NOT "missing" — it's "use your best judgment based on the challenge context."
- User can always tap any chip later to override. Your job is to make the first guess smart.

TOOLS YOU CAN CALL:
You have real tools available for verifying prediction-market propositions against ground truth. USE THEM when the user proposes a bet on an external real-world quantity:
- "BTC hits 70k by Friday" / "ETH above 4000 next week" / "SOL price prediction" → call check_crypto_price with that symbol. Use the returned current price to sanity-check the threshold (is it already there? a 2x stretch? impossible?), then craft rules that reference the oracle (e.g. "settle by CoinGecko BTC/USD spot at 2026-04-30 00:00 UTC").
- "Will it rain in Seattle on April 30?" / "High temp above 30°C in Paris next Tuesday" → call check_weather_forecast with lat/lng + date.
- If the tool fails or the market isn't resolvable externally (e.g. "who wins this private chess match"), skip tools — don't invent data.

After a tool call, include its findings in your rules/proposition so settlement has a ground-truth source to check at the deadline. Example: "Bitcoin (BTC) must close above $70,000 USD per CoinGecko spot price on any day before 2026-05-01." That turns self-report into auto-settleable.

PROACTIVE ACTION SUGGESTIONS (actionItems):
When you spot a concrete next-step the user might want, emit it as an actionItem so the UI can render a clickable button. Supported types:
- "topup":          user wants to stake more than they have. Payload: { amount: <credits needed> }
- "adjust_stake":   their stake looks wrong for the challenge shape. Payload: { newAmount: <number> }
- "add_opponent":   challenge is 1v1 but no opponent mentioned. Payload: {}
- "reduce_scope":   the scope looks too big / risky / illegal. Payload: {}
- "other":          any other suggestion. Payload: free-form.
Keep labels in the user's language. Only emit actionItems when they're genuinely useful — empty array [] is fine.

STEPS:

1. Classify INTENT:
   - "definite_market": Clear bet/challenge with enough info to publish
   - "candidate_market": Clearly a bet but missing key fields
   - "ordinary_chat": Genuinely unrelated to betting (greetings, personal questions to you, off-topic talk). Use this SPARINGLY.
   - "chat_reply": The user made a betting-relevant statement but you WANT to ask ONE short follow-up before committing to a full draft. Use when:
     · input gives you the proposition but no hint about stake or money intent ("我跟他赌谁能先喝完这瓶酒" / "let's bet who's faster") → ask "要赌多少? 不赌钱也行"
     · input gives stake but not evidence/proof format for a physical action → ask "要录视频吗还是自己汇报?"
     · input gives TWO different valid interpretations of the same line → ask which
     In chat_reply mode, put ONE short conversational question in recommendationSummary (in the user's language). Leave stakeOptions / evidenceOptions / deadlineOptions EMPTY. Don't produce a finished draft yet. The UI will NOT render a draft card for chat_reply — it will just show your question as a chat bubble.
     Next turn the user will reply, and you'll get their prior state via priorDraft context — at that point pivot to candidate_market / definite_market with a real draft.
     Limit: don't chain more than 2 chat_reply rounds in a row. After 2 back-and-forths, commit to a draft with your best guesses — keep momentum.

   CRITICAL — DO NOT REJECT WHEN THE USER HANDED YOU THE WHEEL:
   If the user explicitly asks YOU to pick / generate / invent / suggest a challenge
   ("generate one for me", "you pick", "surprise me", "give me a random bet", "anything",
   "随便来一个", "帮我想一个", "你决定", "whatever you want") — that is NOT ordinary_chat.
   They ARE trying to bet, they just delegated the creative part to you.

   In that case:
   - intent = "candidate_market"
   - INVENT a concrete, fun, safe challenge appropriate to a solo or 1v1 format
     (e.g. pushups in 60s, hold a plank, a recipe, solve a LeetCode easy in X minutes,
     guess tomorrow's BTC price direction, read a chapter by tomorrow). Don't pick anything
     dangerous, illegal, or political.
   - Fill title + proposition + all *Options arrays with real, specific values
   - Default to free stake (0) so they can try it risk-free
   - clarifyingQuestion may ask if they'd like a different flavor, but still give them a
     working draft so they can publish immediately if they like it.

2. Canonicalize the PROPOSITION — one clear, unambiguous statement of what's wagered.

3. Classify MARKET TYPE:
   - yes_no: "Will X happen?" (binary outcome)
   - threshold: "Will X reach/exceed Y?" (quantitative threshold)
   - head_to_head: "A vs B" (two participants compete)
   - challenge: "Can someone do X?" (solo challenge with success/fail)

4. Think about what this challenge NEEDS, generating these lists contextually:

   stakeOptions: 3-4 graded tiers tailored to this challenge. ALWAYS include a 0-credit "free" option (amount: 0, label like "Free — just for fun" or "Bragging rights only"), so users can play without putting credits on the line.
     - For trivial/fun: e.g. [{0, "Free — just for fun"}, {5, "Friendly wager"}, {15, "Small stakes"}, {50, "Serious"}]
     - For serious physical/effort: e.g. [{0, "Free — bragging rights"}, {50, "Friendly"}, {200, "Serious"}, {1000, "Real skin in game"}]
     - Each option MUST have a reasoning explaining WHY this tier fits THIS challenge.
     - The free option's reasoning should be honest: "No credits at stake; still a real challenge, just for bragging rights."

   evidenceOptions: 2-3 modes in order of AI preference, each with reasoning and "required" flag.
     - "required:true" when that evidence is essential (e.g. video for physical challenge)
     - Include "witness" as an option when a third party should verify (fights, large stakes)
     - NEVER offer self_report as primary for anything that can be faked without proof.

   deadlineOptions: 2-3 timelines with reasoning about why that span makes sense.

5. Identify REDFLAGS: concerns about safety, legality, ambiguity, abuse potential, or if the challenge is impossible/nonsense. Return [] if none.

6. Write a single-sentence recommendationSummary that explains your overall take in the user's language.

7. Identify MISSING FIELDS — what the user hasn't specified yet (from: stake, evidence, deadline, opponent).

8. If stake/evidence/deadline is missing, write ONE clarifyingQuestion in the user's language. Skip if everything's clear.

9. Pick DEFAULTS (suggestedStake/evidenceType/deadline/rules) — the option from each list that best fits what the user implied.

CURRENCY:
- "credits"/"cr"/"积分" → credits 1:1
- "$"/"美金"/"美元" → USD × 100 = credits
- "块"/"元"/"刀" without context → set the raw number, add to redFlags about ambiguity

Return ONLY valid JSON matching this shape (no markdown, no prose around it):
{
  "intent": "definite_market" | "candidate_market" | "ordinary_chat",
  "title": "short title ≤64 chars",
  "proposition": "clear canonical bet statement",
  "marketType": "yes_no" | "threshold" | "head_to_head" | "challenge",
  "type": "Fitness" | "Cooking" | "Coding" | "Learning" | "Games" | "Prediction" | "General",
  "subject": "who/what the bet is about, or null",
  "isPublic": false,
  "suggestedStake": 25,
  "evidenceType": "video",
  "deadline": "24 hours",
  "rules": "clear rules for how to determine the winner",
  "stakeOptions": [
    { "amount": 5, "label": "Friendly wager", "reasoning": "Low stakes for a casual challenge between friends" },
    { "amount": 25, "label": "Real commitment", "reasoning": "Enough to matter without being painful" },
    { "amount": 100, "label": "Serious", "reasoning": "Makes the outcome genuinely consequential" }
  ],
  "evidenceOptions": [
    { "type": "video", "label": "Full video", "reasoning": "This is a physical action — it must be seen on camera to verify", "required": true },
    { "type": "witness", "label": "Neutral third party", "reasoning": "A witness adds credibility when stakes are high", "required": false }
  ],
  "deadlineOptions": [
    { "duration": "24 hours", "reasoning": "Quick turnaround fits the casual nature" },
    { "duration": "7 days", "reasoning": "Gives time to train or arrange" }
  ],
  "redFlags": [],
  "recommendationSummary": "Classic bodyweight challenge — video proof within a day, small friendly stakes.",
  "missingFields": ["stake"],
  "clarifyingQuestion": "How much to stake?"
}`;

// Extract the outermost JSON object and try to recover from trailing-comma
// and unterminated-string errors (common when LLMs hit token limit mid-JSON).
function safeParseJson(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw = match[0];
  try { return JSON.parse(raw); } catch { /* continue */ }
  // Strip trailing commas
  raw = raw.replace(/,(\s*[}\]])/g, "$1");
  try { return JSON.parse(raw); } catch { /* continue */ }
  // If the JSON was truncated mid-object, balance braces by trimming the tail
  // until we find a closing brace that makes it parse.
  for (let i = raw.length; i > 100; i--) {
    const slice = raw.slice(0, i);
    const lastBrace = slice.lastIndexOf("}");
    if (lastBrace < 0) break;
    const candidate = slice.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, "$1");
    try { return JSON.parse(candidate); } catch { /* keep trimming */ }
  }
  return null;
}

/**
 * Parse natural-language input into a structured challenge draft.
 * Pipeline:
 *  1. Resolve provider from ORACLE_DEFAULT_PROVIDER (no hard-coded Anthropic).
 *  2. Call LLM with a tool belt (CoinGecko / Open-Meteo) so that prediction
 *     markets come back with a real oracle source attached, not self-report.
 *  3. Fall back to a plain (no-tools) prompt if the provider doesn't support
 *     function calling. Final fallback: deterministic parser.
 *  4. Self-correct: if the first pass returned obvious garbage (no title, no
 *     options), try once more on a stronger model in the same family.
 *  5. Optional `priorDraft` is used as conversation context so follow-up input
 *     ("another one", "再来一个", "make it bigger") references the previous
 *     draft instead of cold-starting.
 */
export async function parseChallenge(
  input: string,
  preferredModel?: string,
  priorDraft?: ParsedChallenge | null,
): Promise<ParsedChallenge> {
  const { providerId, model } = resolveOracle(preferredModel);

  if (!oracleKeyAvailable(providerId)) {
    console.warn(`[parseChallenge] provider=${providerId} has no API key set; falling back to deterministic parser.`);
    return parseChallengeFallback(input);
  }

  // Build the user message — inject prior-draft summary when the frontend
  // passed one. We keep it COMPACT (just the fields the AI needs to remember
  // or diverge from) so it doesn't blow context.
  const userMessage = (() => {
    if (!priorDraft) return input;
    const priorSummary = JSON.stringify({
      title: priorDraft.title,
      proposition: priorDraft.proposition,
      marketType: priorDraft.marketType,
      type: priorDraft.type,
      suggestedStake: priorDraft.suggestedStake,
      evidenceType: priorDraft.evidenceType,
      deadline: priorDraft.deadline,
      oracles: priorDraft.oracles?.map((o) => `${o.source}:${o.label}`),
    });
    return `Context — user's most-recent published/draft challenge in this session:
${priorSummary}

User's new input:
${input}

If the new input clearly references a NEW independent bet, treat it as a fresh draft (ignore context). If it sounds like a continuation ("another one", "再来一个", "different flavor", "bigger stake", "similar but harder"), produce a DIFFERENT challenge from the same family/type, or a modification — don't repeat the exact same draft.`;
  })();

  const runOnce = async (useModel: string): Promise<{ parsed: ParsedChallenge | null; invocations: ToolInvocation[] }> => {
    try {
      // OpenAI-compat backends get the real tool-calling loop; others fall through.
      const providerDef = getProviderById(providerId);
      const canUseTools = providerDef?.kind === "openai_compat";
      if (canUseTools) {
        const { text, toolInvocations } = await completeOraclePromptWithTools({
          providerId,
          model: useModel,
          system: MARKET_COMPILER_PROMPT,
          user: userMessage,
          tools: ORACLE_TOOLS,
          maxTokens: 3000,
          temperature: 0.3,
          maxIterations: 3,
        });
        return { parsed: safeParseJson(text) as ParsedChallenge | null, invocations: toolInvocations };
      }
      const text = await completeOraclePrompt({
        providerId,
        model: useModel,
        system: MARKET_COMPILER_PROMPT,
        user: userMessage,
        maxTokens: 3000,
        temperature: 0.3,
      });
      return { parsed: safeParseJson(text) as ParsedChallenge | null, invocations: [] };
    } catch (err) {
      console.error(`[parseChallenge] LLM call failed (provider=${providerId}, model=${useModel}):`, err instanceof Error ? err.message : err);
      return { parsed: null, invocations: [] };
    }
  };

  // First pass — default model.
  let { parsed, invocations } = await runOnce(model);

  // Self-correction: if the first pass failed OR returned an obvious stub
  // (no stakeOptions, no rules), retry once on a bigger model in the family.
  const looksStub = parsed && !(
    (parsed.stakeOptions?.length ?? 0) > 0 ||
    (parsed.evidenceOptions?.length ?? 0) > 0 ||
    (parsed.rules && parsed.rules.length > 10)
  );
  const escalated = escalateModelForLowConfidence(providerId, model, parsed ? (looksStub ? 0.4 : 1) : 0);
  if ((!parsed || looksStub) && escalated && escalated !== model) {
    console.log(`[parseChallenge] self-correcting via ${escalated} (first pass was weak/failed)`);
    const second = await runOnce(escalated);
    if (second.parsed) {
      parsed = second.parsed;
      invocations = [...invocations, ...second.invocations];
    }
  }

  if (!parsed) return parseChallengeFallback(input);

  // Normalize / defaults.
  parsed.title = parsed.title || input.slice(0, 64);
  parsed.type = parsed.type || "General";
  parsed.suggestedStake = typeof parsed.suggestedStake === "number" ? parsed.suggestedStake : 0;
  parsed.evidenceType = parsed.evidenceType || "self_report";
  parsed.rules = parsed.rules || "";
  parsed.deadline = parsed.deadline || "24 hours";
  parsed.isPublic = parsed.isPublic ?? false;
  if (!Array.isArray(parsed.redFlags)) parsed.redFlags = [];
  if (!Array.isArray(parsed.missingFields)) parsed.missingFields = [];

  // Attach oracle results + tool audit trail.
  const oracles: OracleAttachment[] = [];
  const toolAudit: Array<{ name: string; ok: boolean; error?: string }> = [];
  for (const inv of invocations) {
    toolAudit.push({ name: inv.name, ok: inv.result.ok, error: inv.result.error });
    const att = toAttachment(inv.result);
    if (att) oracles.push(att);
  }
  if (oracles.length > 0) parsed.oracles = oracles;
  if (toolAudit.length > 0) parsed.toolInvocations = toolAudit;

  return parsed;
}

/**
 * Evidence shape accepted by the judge. The `prepared*` fields are populated
 * by the evidence POST `after()` hook (src/lib/media/pre-extract-frames.ts) and
 * let the judge skip ffmpeg entirely when present.
 */
export interface JudgeEvidencePayload {
  description: string | null;
  type: string;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
  preparedFrames?: string[] | null;
  preparedDurationSec?: number | null;
  preparedMode?: string | null;
}

export interface JudgeChallengeParams {
  title: string;
  description?: string | null;
  deadlineIso?: string | null;
  type: string;
  rules?: string | null;
  evidencePolicy?: string;
  evidenceA: JudgeEvidencePayload | null;
  evidenceB: JudgeEvidencePayload | null;
  participantAId: string;
  participantBId: string | null;
  model: string;
  providerId: string;
  /** Optional liveness prompt (not in schema today; accepted for forward compat). */
  livenessPrompt?: string | null;
}

/**
 * Try the fast (pre-extracted frames) path; fall back to live ffmpeg extraction
 * when the hook hasn't run yet, couldn't cache the frames, or the evidence
 * doesn't have a media URL at all.
 */
async function getVisualsForParticipant(
  label: string,
  evidence: JudgeEvidencePayload,
): Promise<{ preambleLines: string[]; visuals: JudgeVisionImage[] }> {
  if (evidence.preparedFrames && evidence.preparedFrames.length > 0) {
    const fast = await prepareParticipantVisualsFast(label, evidence.preparedFrames, {
      durationSec: evidence.preparedDurationSec,
      mode: evidence.preparedMode,
    });
    if (fast) return fast;
  }
  return prepareParticipantVisuals(label, {
    description: evidence.description,
    type: evidence.type,
    url: evidence.url ?? null,
  });
}

function normalizeObjectiveAnswer(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function extractExpectedAnswer(params: Pick<JudgeChallengeParams, "title" | "rules" | "description">): string | null {
  const text = [params.rules, params.description, params.title].filter(Boolean).join("\n");
  const match = text.match(/\b(?:expected[_ -]?answer|correct[_ -]?answer)\s*[:=]\s*([^\n\r;.]+)/i);
  return match ? match[1].trim() : null;
}

function extractSubmittedAnswer(evidence: JudgeEvidencePayload | null): string | null {
  if (!evidence) return null;
  const metadataAnswer = evidence.metadata?.answer;
  if (typeof metadataAnswer === "string" && metadataAnswer.trim()) {
    return metadataAnswer.trim();
  }
  const description = evidence.description ?? "";
  const match = description.match(/\b(?:answer|final answer|response)\s*[:=]\s*([^\n\r;]+)/i);
  return match ? match[1].trim() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function repCountOrNull(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0
    ? Math.floor(numberValue)
    : null;
}

function coerceRecommendation(value: unknown): JudgmentResult["recommendation"] | undefined {
  if (value === "settle_winner" || value === "needs_review" || value === "invalid_evidence" || value === "tie_or_no_winner") {
    return value;
  }
  if (value === "manual_review") return "needs_review";
  if (value === "refund") return "tie_or_no_winner";
  return undefined;
}

function coerceParticipantVideoMetrics(value: unknown): VideoJudgmentParticipantMetrics {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    validRepCount: repCountOrNull(source.validRepCount),
    invalidRepNotes: stringArray(source.invalidRepNotes),
    fullDurationCovered: boolOrNull(source.fullDurationCovered),
    livenessPhraseVisible: boolOrNull(source.livenessPhraseVisible),
    fullBodyVisible: boolOrNull(source.fullBodyVisible),
    continuousAttemptLikely: boolOrNull(source.continuousAttemptLikely),
    videoTooShort: boolOrNull(source.videoTooShort),
    suspectedEditingOrLoop: boolOrNull(source.suspectedEditingOrLoop),
    antiCheatFlags: stringArray(source.antiCheatFlags),
    reasonForManualReview:
      typeof source.reasonForManualReview === "string" && source.reasonForManualReview.trim()
        ? source.reasonForManualReview.trim()
        : null,
    unclearReason: typeof source.unclearReason === "string" ? source.unclearReason : null,
  };
}

function coerceVideoMetrics(
  value: unknown,
  framesInspected: number,
  rules: string | null | undefined,
): VideoJudgmentMetrics | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const participantA = coerceParticipantVideoMetrics(source.participantA);
  const participantB = coerceParticipantVideoMetrics(source.participantB);
  return {
    participantA,
    participantB,
    validRepDefinition:
      typeof source.validRepDefinition === "string" && source.validRepDefinition.trim()
        ? source.validRepDefinition.trim()
        : (rules || "Valid repetitions must match the challenge rules.").slice(0, 500),
    framesInspected: Number.isFinite(Number(source.framesInspected))
      ? Math.max(0, Math.floor(Number(source.framesInspected)))
      : framesInspected,
    judgingMethod:
      typeof source.judgingMethod === "string" && source.judgingMethod.trim()
        ? source.judgingMethod.trim()
        : "AI vision reviewed sampled video frames, evidence descriptions, and challenge rules.",
  };
}

function parseRequiredDurationSec(...parts: Array<string | null | undefined>): number | null {
  const text = parts.filter(Boolean).join("\n").toLowerCase();
  if (!text) return null;
  const minuteMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/);
  if (minuteMatch) return Math.round(Number(minuteMatch[1]) * 60);
  const secondMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|sec|s)\b/);
  if (secondMatch) return Math.round(Number(secondMatch[1]));
  return null;
}

function applyObservedVideoGuards(
  result: {
    videoMetrics?: VideoJudgmentMetrics;
    blockingIssues?: string[];
    recommendation?: JudgmentResult["recommendation"];
    evidenceQuality?: JudgmentResult["evidenceQuality"];
  },
  params: Pick<JudgeChallengeParams, "title" | "description" | "rules" | "evidenceA" | "evidenceB">,
) {
  if (!result.videoMetrics) return result;
  const requiredSec = parseRequiredDurationSec(params.rules, params.description, params.title);
  if (!requiredSec || requiredSec <= 0) return result;

  const nextIssues = [...(result.blockingIssues ?? [])];
  const patchParticipant = (
    label: string,
    metrics: VideoJudgmentParticipantMetrics | undefined,
    evidence: JudgeEvidencePayload | null,
  ) => {
    if (!metrics) return;
    const observed = evidence?.preparedDurationSec;
    if (typeof observed !== "number" || !Number.isFinite(observed)) return;
    if (observed >= requiredSec * 0.9) return;

    metrics.fullDurationCovered = false;
    metrics.videoTooShort = true;
    const issue = `${label} observed video duration ${Math.round(observed)}s is shorter than required ${requiredSec}s.`;
    if (!metrics.reasonForManualReview) metrics.reasonForManualReview = issue;
    if (!metrics.antiCheatFlags?.some((flag) => /duration|short/i.test(flag))) {
      metrics.antiCheatFlags = [...(metrics.antiCheatFlags ?? []), "video_too_short_by_metadata"];
    }
    nextIssues.push(issue);
  };

  patchParticipant("Participant A", result.videoMetrics.participantA, params.evidenceA);
  patchParticipant("Participant B", result.videoMetrics.participantB, params.evidenceB);
  if (nextIssues.length > (result.blockingIssues?.length ?? 0)) {
    result.blockingIssues = nextIssues;
    result.recommendation = result.recommendation === "invalid_evidence" ? "invalid_evidence" : "needs_review";
    result.evidenceQuality = result.evidenceQuality === "invalid" ? "invalid" : "insufficient";
  }
  return result;
}

function tryDeterministicObjectiveJudge(params: JudgeChallengeParams): JudgmentResult | null {
  if (!params.participantBId || !params.evidenceA || !params.evidenceB) return null;

  const expectedRaw = extractExpectedAnswer(params);
  const expected = normalizeObjectiveAnswer(expectedRaw);
  if (!expected) return null;

  const answerARaw = extractSubmittedAnswer(params.evidenceA);
  const answerBRaw = extractSubmittedAnswer(params.evidenceB);
  const answerA = normalizeObjectiveAnswer(answerARaw);
  const answerB = normalizeObjectiveAnswer(answerBRaw);
  if (!answerA && !answerB) return null;

  const aCorrect = answerA === expected;
  const bCorrect = answerB === expected;

  if (aCorrect !== bCorrect) {
    const winnerId = aCorrect ? params.participantAId : params.participantBId;
    const winnerLabel = aCorrect ? "Participant A" : "Participant B";
    return {
      winnerId,
      confidence: 0.99,
      evidenceQuality: "good",
      recommendation: "settle_winner",
      settlementRecommendation: "settle_winner",
      source: "deterministic",
      reasoning:
        `Deterministic objective answer check: expected "${expectedRaw}". ` +
        `Participant A submitted "${answerARaw ?? "(none)"}"; Participant B submitted "${answerBRaw ?? "(none)"}". ` +
        `Only ${winnerLabel} matched the expected answer, so ${winnerLabel} wins.`,
    };
  }

  if (aCorrect && bCorrect) {
    return {
      winnerId: null,
      confidence: 0.72,
      evidenceQuality: "unclear",
      recommendation: "needs_review",
      settlementRecommendation: "needs_review",
      blockingIssues: ["Both participants matched the objective answer; timing or an additional tie-breaker is needed."],
      source: "deterministic",
      reasoning:
        `Both participants submitted the expected answer "${expectedRaw}". ` +
        "The objective answer check cannot break the tie without an additional timing or ordering rule.",
    };
  }

  return {
    winnerId: null,
    confidence: 0.4,
    evidenceQuality: "invalid",
    recommendation: "invalid_evidence",
    settlementRecommendation: "invalid_evidence",
    blockingIssues: ["Neither participant submitted the expected answer."],
    source: "deterministic",
    reasoning:
      `Neither participant submitted the expected answer "${expectedRaw}". ` +
      `Participant A submitted "${answerARaw ?? "(none)"}"; Participant B submitted "${answerBRaw ?? "(none)"}".`,
  };
}

export async function judgeChallenge(params: JudgeChallengeParams): Promise<JudgmentResult> {
  let { evidenceA, evidenceB } = params;
  const { participantAId, participantBId, title, type, rules } = params;
  const hasSharedSameCameraFlag = (evidence: JudgeEvidencePayload | null | undefined) =>
    evidence?.metadata?.sharedSameCamera === true || evidence?.metadata?.captureMode === "one_phone_same_camera";

  if (evidenceA && !evidenceB && hasSharedSameCameraFlag(evidenceA)) {
    evidenceB = {
      ...evidenceA,
      description: `${evidenceA.description || ""}\nThis shared same-camera media is also the opponent's evidence; compare both visible people in the same video.`,
    };
  }
  if (!evidenceA && evidenceB && hasSharedSameCameraFlag(evidenceB)) {
    evidenceA = {
      ...evidenceB,
      description: `${evidenceB.description || ""}\nThis shared same-camera media is also the creator's evidence; compare both visible people in the same video.`,
    };
  }
  const sharedSameCamera =
    hasSharedSameCameraFlag(evidenceA) ||
    hasSharedSameCameraFlag(evidenceB) ||
    Boolean(evidenceA?.url && evidenceB?.url && evidenceA.url === evidenceB.url && evidenceA.url);

  if (sharedSameCamera && evidenceA?.url && evidenceB?.url && evidenceA.url === evidenceB.url) {
    if (evidenceA.preparedFrames?.length && !evidenceB.preparedFrames?.length) {
      evidenceB = {
        ...evidenceB,
        preparedFrames: evidenceA.preparedFrames,
        preparedDurationSec: evidenceA.preparedDurationSec,
        preparedMode: evidenceA.preparedMode,
      };
    }
    if (evidenceB.preparedFrames?.length && !evidenceA.preparedFrames?.length) {
      evidenceA = {
        ...evidenceA,
        preparedFrames: evidenceB.preparedFrames,
        preparedDurationSec: evidenceB.preparedDurationSec,
        preparedMode: evidenceB.preparedMode,
      };
    }
  }

  // Forfeit / void cases — no LLM needed.
  if (!evidenceA && !evidenceB) {
    return {
      winnerId: null,
      reasoning: "Neither participant submitted evidence. Challenge cannot be judged.",
      confidence: 0.95,
      evidenceQuality: "invalid",
      recommendation: "invalid_evidence",
      settlementRecommendation: "invalid_evidence",
      blockingIssues: ["Neither participant submitted evidence."],
    };
  }
  if (evidenceA && !evidenceB && participantBId) {
    return {
      winnerId: participantAId,
      reasoning: `Only participant A submitted ${evidenceA.type} evidence. Participant B did not submit evidence.`,
      confidence: 0.85,
      evidenceQuality: "unclear",
      recommendation: "needs_review",
      settlementRecommendation: "needs_review",
      blockingIssues: ["Participant B did not submit evidence."],
    };
  }
  if (!evidenceA && evidenceB && participantBId) {
    return {
      winnerId: participantBId,
      reasoning: `Only participant B submitted ${evidenceB.type} evidence. Participant A did not submit evidence.`,
      confidence: 0.85,
      evidenceQuality: "unclear",
      recommendation: "needs_review",
      settlementRecommendation: "needs_review",
      blockingIssues: ["Participant A did not submit evidence."],
    };
  }
  // Solo / no opponent — accept the single submission.
  if (!participantBId && evidenceA) {
    return {
      winnerId: participantAId,
      reasoning: "No opponent accepted this challenge. Solo submission needs manual review before any settlement.",
      confidence: 0.85,
      evidenceQuality: "unclear",
      recommendation: "needs_review",
      settlementRecommendation: "needs_review",
      blockingIssues: ["No opponent accepted this challenge."],
    };
  }

  // ── System: strict, rubric-based, honest about uncertainty ──
  const deterministicResult = tryDeterministicObjectiveJudge({
    ...params,
    evidenceA,
    evidenceB,
  });
  if (deterministicResult) return deterministicResult;

  const system = `You are an impartial AI judge for a two-player challenge that settles REAL credits. A wrong call takes money from a real person, so be careful, explicit, and honest about uncertainty.

Your job:
1. Read the challenge rules carefully.
2. Examine each participant's evidence: text description, plus (if present) the actual media frames attached to this message.
3. For each participant, ask: did the evidence actually demonstrate the required action/outcome?
4. Pick the winner — or null — per the rubric below.

RUBRIC (apply in order):
- If exactly one participant's evidence satisfies the rules → they win.
- If both satisfy, pick whichever is clearer, more complete, or more convincingly demonstrates the claim. If truly tied, prefer the earlier submission timestamp (if given).
- If neither satisfies, or evidence is too ambiguous, return winner: null.
- If you suspect tampering, misleading framing, or fraud on one side, do NOT award that side the win; describe the concern in analysis.

VIDEO FRAMES (when images are attached to this message):
- Frames are sampled via scene-change detection, labeled with the participant they belong to. Each participant typically contributes 4-22 frames spanning their clip.
- When an ordered filmstrip image is provided, treat it as the primary motion summary: read left-to-right, top-to-bottom, and count repeated top/down/top cycles across the sequence before looking at isolated frames.
- Check that the claimed action is actually visible across the frames, not just implied by the description.
- Some controlled verification videos use a side-view pose diagram rather than a real human photo. In those, infer push-up motion from the head/torso/arms moving between high plank/top position and low/down position across the timer. Do not reject them as "no push-up motion" just because they are diagrams. Still do not read or trust any direct rep-count answer label.
- Note timestamps/frame labels in your reasoning when citing what you saw.
- For physical rep-count challenges such as push-ups, explicitly infer valid repetitions for Participant A and Participant B from body motion and posture across the attached frames. Do not trust text in the video that directly claims a rep count.
- videoMetrics.validRepCount is the conservative observed count from the frames, not the settlement decision. If a visible sequence shows top/plank -> down/chest-lowered -> top/plank again, count that as one observed valid rep even when the exact full-video total is uncertain. Return 0 only when no top/down/top cycle is visible.
- For side-view pose diagrams, read the body geometry directly: top/plank means head and torso are high above the ground with arms extended; down means head/chest/torso are close to the ground and elbows are bent. Alternating high and low body positions across ordered timestamps is push-up motion.
- The attached images are sampled keyframes, not every video frame. Do not mark a cycle "incomplete" merely because the intermediate animation frames are absent. If ordered keyframes show high -> low -> high at increasing timestamps, that is one observed completed push-up cycle.
- If one participant shows multiple high/low/high cycles and the other stays standing, static, or non-push-up, videoMetrics.validRepCount for the first participant must be greater than the second. Settlement may still be blocked later by confidence/recommendation, but the metrics should reflect the visible motion.
- For "who did more reps" challenges, never return a winner unless the winner's videoMetrics.validRepCount is strictly higher than the other participant's count. If counts are equal, zero, missing, or inconsistent with the selected winner, use winner=null or recommendation="needs_review" and list that as a blockingIssue.
- A push-up is valid only when the participant starts at the top with arms extended, lowers chest/body clearly, keeps a reasonably straight body line, and returns to the top.
- When sampled frames make exact totals hard, still compare visible cadence: repeated top/down/top cycles across many timestamps strongly indicate more completed repetitions than a clip that stays mostly static or changes position only once or twice.
- If the frames are sampled rather than every frame, only give a high-confidence winner when the count or result is visually obvious from the full video evidence, frame labels, metadata, and descriptions. Otherwise return winner null or confidence below 0.85.
- Anti-cheat/liveness checks are required for video evidence: verify the liveness phrase if one is provided in metadata/rules, full body visibility, continuous attempt, required duration coverage, and whether the clip looks edited, looped, static, too dark, blurry, or cropped.
- Never recommend auto-settlement for a video if either participant is missing liveness proof, full body visibility, continuous attempt, or required duration coverage; use recommendation="needs_review" or "invalid_evidence" and list the exact blockingIssues.
${sharedSameCamera ? `
SHARED SAME-CAMERA MODE:
- Participant A and Participant B are in the same video, not two independent clips.
- Use the role guidance from the evidence metadata/descriptions: creator/Participant A is expected on the left; opponent/Participant B is expected on the right when possible.
- Do not award a winner unless both identities and the finish order/count are visually clear in the frames.
- If identity, body visibility, rep validity, start time, or finish order is ambiguous, return winner: null with confidence <= 0.69.
` : ""}

CONFIDENCE SCALE (be calibrated — stakes are real):
- 0.95-1.00: Unambiguous — one side clearly won, no reasonable doubt.
- 0.85-0.94: Confident but with minor caveats worth noting.
- 0.70-0.84: Leaning toward a winner but with real doubt.
- 0.50-0.69: Barely above coin-flip — treat as a disputed call.
- Below 0.50: Do not return a winner; return null.
(The system auto-flags confidence < 0.85 for manual review and does NOT auto-settle those.)

Settlement recommendation rule:
- Use "settle_winner" only when confidence >= 0.85, evidenceQuality is "good", winner is not null, and blockingIssues is empty.
- Do not use "settle_winner" when either participant's submitted video is not the required action at all (for example standing, static, unrelated, or no push-up motion in a push-up challenge). In that case use "invalid_evidence" or "needs_review" and explain which participant failed the evidence requirement.
- Use "needs_review" when a winner may exist but any material uncertainty remains.
- Use "invalid_evidence" when the evidence cannot prove the required action/outcome.
- Use "tie_or_no_winner" when no winner can be separated under the rules.

Return ONLY a valid JSON object, nothing before or after it. Shape:
{
  "analysis": "<2-4 sentence step-by-step examination of both sides' evidence>",
  "winner": "A" | "B" | null,
  "reasoning": "<one short paragraph explaining the call in plain language for the loser to understand>",
  "confidence": 0.0-1.0,
  "evidenceQuality": "good" | "unclear" | "insufficient" | "invalid",
  "recommendation": "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner",
  "blockingIssues": string[],
  "videoMetrics": {
    "participantA": {
      "validRepCount": number | null,
      "invalidRepNotes": string[],
      "fullDurationCovered": boolean | null,
      "livenessPhraseVisible": boolean | null,
      "fullBodyVisible": boolean | null,
      "continuousAttemptLikely": boolean | null,
      "videoTooShort": boolean | null,
      "suspectedEditingOrLoop": boolean | null,
      "antiCheatFlags": string[],
      "reasonForManualReview": string | null,
      "unclearReason": string | null
    },
    "participantB": {
      "validRepCount": number | null,
      "invalidRepNotes": string[],
      "fullDurationCovered": boolean | null,
      "livenessPhraseVisible": boolean | null,
      "fullBodyVisible": boolean | null,
      "continuousAttemptLikely": boolean | null,
      "videoTooShort": boolean | null,
      "suspectedEditingOrLoop": boolean | null,
      "antiCheatFlags": string[],
      "reasonForManualReview": string | null,
      "unclearReason": string | null
    },
    "validRepDefinition": string,
    "framesInspected": number,
    "judgingMethod": string
  }
}`;

  // ── Try to extract real visual evidence ──
  // FAST path: if the evidence POST hook already pre-extracted frames to Blob, skip ffmpeg
  // and just fetch the cached JPEGs in parallel (~500ms instead of ~10-15s).
  // SLOW path: ffmpeg + sharp live.
  let visualsA: { preambleLines: string[]; visuals: JudgeVisionImage[] } = { preambleLines: [], visuals: [] };
  let visualsB: { preambleLines: string[]; visuals: JudgeVisionImage[] } = { preambleLines: [], visuals: [] };
  try {
    [visualsA, visualsB] = await Promise.all([
      getVisualsForParticipant("Participant A", evidenceA!),
      getVisualsForParticipant("Participant B", evidenceB!),
    ]);
  } catch {
    // Vision extraction is best-effort; if it fails, fall through to text-only.
  }
  const allVisuals = capJudgeVisuals(visualsA.visuals, visualsB.visuals, 32);
  if (sharedSameCamera && allVisuals.length === 0) {
    return {
      winnerId: null,
      reasoning: "Shared same-camera evidence requires visual inspection of both people in the same media, but no frames could be extracted or attached. Manual review required; no winner should be inferred from text alone.",
      confidence: 0.4,
      evidenceQuality: "unclear",
      recommendation: "needs_review",
      settlementRecommendation: "needs_review",
      blockingIssues: ["Shared same-camera media has no extractable frames."],
      source: "fallback",
    };
  }

  const visualPreamble = [...visualsA.preambleLines, ...visualsB.preambleLines].join("\n");
  const evidenceSummary = `Participant A evidence (${evidenceA!.type}):
description: ${evidenceA!.description || "(none)"}${evidenceA!.url ? `\nmedia: ${evidenceA!.url}` : ""}${evidenceA!.metadata ? `\nmetadata: ${JSON.stringify(evidenceA!.metadata)}` : ""}

Participant B evidence (${evidenceB!.type}):
description: ${evidenceB!.description || "(none)"}${evidenceB!.url ? `\nmedia: ${evidenceB!.url}` : ""}${evidenceB!.metadata ? `\nmetadata: ${JSON.stringify(evidenceB!.metadata)}` : ""}`;

  const userText = `Challenge: "${title}"
Type: ${type}
${params.description ? `Context: ${params.description}\n` : ""}Rules / Task: ${rules || title}
Evidence policy: ${params.evidencePolicy || "self_report"}${params.deadlineIso ? `\nDeadline: ${params.deadlineIso}` : ""}
${params.livenessPrompt ? `Required liveness phrase: ${params.livenessPrompt}\n` : ""}
${sharedSameCamera ? "Shared same-camera: yes. The same media may appear under both participants; compare the two visible people inside that media.\n" : ""}

${evidenceSummary}

${visualPreamble ? `Vision extraction notes:\n${visualPreamble}\n\n` : ""}${allVisuals.length > 0 ? `I have attached ${allVisuals.length} frame(s) from the submitted media — examine them as your primary evidence; the descriptions above are supporting context only.\n\n` : ""}Decide now. Return JSON only.`;

  // One-shot vision call, with optional low-confidence escalation to a bigger model
  // in the same family. Default path: gpt-4o-mini (fast/cheap). Escalation: gpt-4o.
  const runJudge = async (modelName: string): Promise<{
    winner: "A" | "B" | null;
    reasoning: string;
    confidence: number;
    analysis?: string;
    evidenceQuality?: "good" | "unclear" | "insufficient" | "invalid";
    recommendation?: "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner";
    blockingIssues?: string[];
    videoMetrics?: VideoJudgmentMetrics;
    providerCall?: LlmCallMetadata;
  } | null> => {
    try {
      const completion = allVisuals.length > 0
        ? await completeOracleJudgeVisionWithMetadata({
            providerId: params.providerId,
            model: modelName,
            system,
            userText,
            images: allVisuals,
            maxTokens: 1800,
            temperature: 0.1,
          })
        : await completeOraclePromptWithMetadata({
            providerId: params.providerId,
            model: modelName,
            system,
            user: userText,
            maxTokens: 1800,
            temperature: 0.1,
          });
      const text = completion.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn("[judgeChallenge] LLM judge returned no JSON object", {
          providerId: params.providerId,
          model: modelName,
          visualFrames: allVisuals.length,
          sample: text.slice(0, 300),
        });
        return null;
      }
      const parsed = (safeParseJson(text) ?? JSON.parse(jsonMatch[0])) as {
        winner?: unknown;
        reasoning?: unknown;
        confidence?: unknown;
        analysis?: unknown;
        evidenceQuality?: unknown;
        recommendation?: unknown;
        settlementRecommendation?: unknown;
        blockingIssues?: unknown;
        videoMetrics?: unknown;
      };
      if (!["A", "B", null].includes(parsed.winner as "A" | "B" | null)) return null;
      if (typeof parsed.reasoning !== "string" || typeof parsed.confidence !== "number") return null;
      return {
        winner: parsed.winner as "A" | "B" | null,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence,
        analysis: typeof parsed.analysis === "string" ? parsed.analysis : undefined,
        evidenceQuality: ["good", "unclear", "insufficient", "invalid"].includes(parsed.evidenceQuality as string)
          ? parsed.evidenceQuality as "good" | "unclear" | "insufficient" | "invalid"
          : undefined,
        recommendation: coerceRecommendation(parsed.recommendation ?? parsed.settlementRecommendation),
        blockingIssues: Array.isArray(parsed.blockingIssues)
          ? parsed.blockingIssues.filter((issue): issue is string => typeof issue === "string" && issue.trim().length > 0)
          : undefined,
        videoMetrics: coerceVideoMetrics(parsed.videoMetrics, allVisuals.length, rules || title),
        providerCall: completion.metadata,
      };
    } catch (err) {
      console.warn("[judgeChallenge] LLM judge call failed", {
        providerId: params.providerId,
        model: modelName,
        visualFrames: allVisuals.length,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      });
      return null;
    }
  };

  let parsedResult = await runJudge(params.model);

  // Low-confidence escalation: if the fast model hedged (< 0.70), retry once on
  // the flagship variant in the same family. Covers the most common accuracy
  // tradeoff (mini → flagship) without doubling every call.
  const escalated = escalateModelForLowConfidence(params.providerId, params.model, parsedResult?.confidence);
  if (escalated) {
    const retry = await runJudge(escalated);
    // Keep the retry only if it came back with meaningfully higher confidence.
    if (retry && retry.confidence > (parsedResult?.confidence ?? 0)) {
      parsedResult = retry;
    }
  }

  if (parsedResult) {
    parsedResult = applyObservedVideoGuards(parsedResult, {
      title,
      description: params.description,
      rules,
      evidenceA,
      evidenceB,
    }) as typeof parsedResult;
    const winnerId =
      parsedResult.winner === "A" ? participantAId :
      parsedResult.winner === "B" ? participantBId :
      null;
    const fullReasoning = parsedResult.analysis && parsedResult.analysis.trim().length > 0
      ? `${parsedResult.reasoning}\n\n(Analysis: ${parsedResult.analysis.trim()})`
      : parsedResult.reasoning;
    return {
      winnerId,
      reasoning: fullReasoning,
      confidence: parsedResult.confidence,
      evidenceQuality: parsedResult.evidenceQuality ?? (winnerId && parsedResult.confidence >= 0.85 ? "good" : "unclear"),
      recommendation:
        parsedResult.recommendation ??
        (winnerId && parsedResult.confidence >= 0.85
          ? "settle_winner"
          : winnerId
            ? "needs_review"
            : "tie_or_no_winner"),
      settlementRecommendation:
        parsedResult.recommendation ??
        (winnerId && parsedResult.confidence >= 0.85
          ? "settle_winner"
          : winnerId
            ? "needs_review"
            : "tie_or_no_winner"),
      blockingIssues: parsedResult.blockingIssues,
      source: allVisuals.length > 0 ? "vision_llm" : "llm",
      providerCall: parsedResult.providerCall,
      videoMetrics: parsedResult.videoMetrics,
    };
  }

  return judgeChallengeFallback(title, evidenceA!, evidenceB!, participantAId, participantBId!);
}

/**
 * Return a flagship model name if `model` is a "mini/fast" variant AND
 * confidence is suspect. Returns null to mean "don't escalate".
 * Kept intentionally narrow — only the common openai mini → 4o path today.
 */
function escalateModelForLowConfidence(
  providerId: string,
  model: string,
  confidence: number | undefined,
): string | null {
  if (confidence == null) return null;
  if (confidence >= 0.70) return null;
  const m = model.toLowerCase();
  if (providerId === "openai" && m.includes("mini")) {
    // gpt-4o-mini / o4-mini → gpt-4o for the second pass.
    return "gpt-4o";
  }
  if (providerId === "anthropic" && m.includes("haiku")) {
    return "claude-sonnet-4-20250514";
  }
  if (providerId === "google" && m.includes("flash")) {
    return "gemini-2.5-pro-preview-05-06";
  }
  return null;
}

/**
 * LEGACY shape — kept for backward compat with any caller that still wants a
 * simple question/options list. New UI should read parsed.stakeOptions /
 * evidenceOptions / deadlineOptions directly (richer — each carries reasoning).
 *
 * This function now ONLY returns something if the AI explicitly flagged a
 * clarifyingQuestion. Otherwise returns []. The AI is instructed NOT to flag
 * questions unless truly ambiguous, so this list should usually be empty —
 * the user just lands on a fully-pre-filled draft and tweaks from there.
 */
export function generateClarifications(parsed: ParsedChallenge): Array<{ question: string; options: string[] }> {
  if (!parsed.clarifyingQuestion) return [];

  // Translate AI's per-field options into flat string options for the legacy caller.
  const missingField = parsed.missingFields?.[0] || "stake";
  let options: string[] = [];
  if (missingField === "stake" && parsed.stakeOptions?.length) {
    options = parsed.stakeOptions.map(o => o.amount === 0 ? `Free — ${o.label}` : `${o.amount} cr — ${o.label}`);
  } else if (missingField === "evidence" && parsed.evidenceOptions?.length) {
    options = parsed.evidenceOptions.map(o => o.label);
  } else if (missingField === "deadline" && parsed.deadlineOptions?.length) {
    options = parsed.deadlineOptions.map(o => o.duration);
  }

  return [{ question: parsed.clarifyingQuestion, options }];
}

/* ── Fallback parsers (no API key) ── */

const TYPE_PATTERNS: Record<string, RegExp> = {
  Fitness:  /pushup|push-up|run|jog|gym|workout|plank|squat|exercise|mile|km|bench|deadlift|pullup|pull-up|burpee|cycling|swim|marathon|sprint|fitness/i,
  Cooking:  /cook|bake|food|pasta|recipe|dish|meal|kitchen|chef|cake|bread|grill|bbq/i,
  Coding:   /code|coding|program|leetcode|dev|developer|bug|algorithm|hack|github|commit|debug|api|software/i,
  Learning: /read|book|study|learn|exam|test|quiz|course|gpa|grade|class|homework|essay|paper/i,
  Games:    /chess|game|play|match|tournament|poker|board|card|esport|fortnite|valorant|league|rank/i,
  Video:    /video|film|tiktok|youtube|stream|record|dance|sing|perform/i,
};

function parseChallengeFallback(input: string): ParsedChallenge {
  let type = "General";
  for (const [t, pattern] of Object.entries(TYPE_PATTERNS)) {
    if (pattern.test(input)) { type = t; break; }
  }

  let amount = 0;
  const creditMatch = input.match(/(\d+)\s*credit/i);
  const dollarMatch = input.match(/\$(\d+(?:\.\d{2})?)/);
  if (creditMatch) {
    amount = parseInt(creditMatch[1]);
  } else if (dollarMatch) {
    amount = Math.round(parseFloat(dollarMatch[1]) * 100); // $1 = 100 credits
  } else if (/(\d+)\s*(?:pts|points|coins)/i.test(input)) {
    amount = parseInt(RegExp.$1);
  } else if (/money|stake|bet|wager|dollar|cash/i.test(input)) {
    amount = 10;
  }

  let evidenceType = "self_report";
  if (/same[_ -]?camera|same phone|one phone|single phone|shared video|same video/i.test(input)) evidenceType = "same_camera_video";
  else if (/video|record|film|stream/i.test(input)) evidenceType = "video";
  else if (/photo|picture|screenshot|snap/i.test(input)) evidenceType = "photo";
  else if (/gps|location|track|distance|strava/i.test(input)) evidenceType = "gps";

  const hourMatch = input.match(/(\d+)\s*(?:hour|hr)s?/i);
  const dayMatch = input.match(/(\d+)\s*days?/i);
  const deadline = hourMatch ? `${hourMatch[1]} hours` : dayMatch ? `${dayMatch[1]} days` : "48 hours";

  let title = input.replace(/^(?:I want to|I'd like to|Let's|Can we|I bet|I wager|Create a?)\s+/i, "").trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > 64) title = title.slice(0, 61) + "…";

  return {
    title, type, suggestedStake: amount, evidenceType,
    rules: `Standard ${type.toLowerCase()} challenge — AI reviewed`,
    deadline, isPublic: /public|open|anyone|everyone|open to all/i.test(input),
  };
}

/**
 * SAFE fallback when every LLM attempt (primary + escalated) fails or returns
 * unparseable JSON. This path MUST NOT auto-settle real credits.
 *
 * Previously this function picked a winner via Math.random() > 0.5 and
 * returned confidence 0.65 + Math.random() * 0.25, which could produce
 * values up to ~0.90. The auto-settle gate in challenge-judgment.ts is
 * `confidence < 0.85 → disputed`, so roughly 20% of fallback calls
 * cleared the gate and moved real stake between random users whenever
 * the LLM was down.
 *
 * New behavior: always return winnerId=null (tie / void), confidence=0.4
 * (well under the 0.85 auto-settle threshold), and a clear message telling
 * the creator that AI is unavailable so they can manually confirm later.
 * The challenge moves to `disputed` and the creator must resolve it
 * through the confirm-verdict flow, not get a coin-flip settlement.
 */
function judgeChallengeFallback(
  challengeTitle: string,
  _evidenceA: { description: string | null; type: string },
  _evidenceB: { description: string | null; type: string },
  _participantAId: string,
  _participantBId: string,
): JudgmentResult {
  return {
    winnerId: null,
    // Below both the 0.70 escalation trigger and the 0.85 auto-settle gate
    // — guarantees this cannot settle credits automatically.
    confidence: 0.4,
    evidenceQuality: "unclear",
    recommendation: "needs_review",
    settlementRecommendation: "needs_review",
    blockingIssues: ["AI judge returned malformed JSON or provider call failed."],
    source: "fallback",
    reasoning:
      `AI was unable to evaluate "${challengeTitle}" (primary and escalated model calls both failed or returned malformed JSON). ` +
      `Marking this challenge as needing manual review. No credits will move until the creator explicitly confirms a winner.`,
  };
}
