import { completeOraclePrompt, completeOraclePromptWithTools, completeOracleJudgeVision, type ToolInvocation } from "./llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "./llm-providers";
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
  intent?: "definite_market" | "candidate_market" | "ordinary_chat";

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

export async function judgeChallenge(params: JudgeChallengeParams): Promise<JudgmentResult> {
  const { evidenceA, evidenceB, participantAId, participantBId, title, type, rules } = params;

  // Forfeit / void cases — no LLM needed.
  if (!evidenceA && !evidenceB) {
    return { winnerId: null, reasoning: "Neither participant submitted evidence. Challenge voided — credits refunded.", confidence: 0.95 };
  }
  if (evidenceA && !evidenceB && participantBId) {
    return { winnerId: participantAId, reasoning: `Only participant A submitted ${evidenceA.type} evidence. Winner by default.`, confidence: 0.85 };
  }
  if (!evidenceA && evidenceB && participantBId) {
    return { winnerId: participantBId, reasoning: `Only participant B submitted ${evidenceB.type} evidence. Winner by default.`, confidence: 0.85 };
  }
  // Solo / no opponent — accept the single submission.
  if (!participantBId && evidenceA) {
    return { winnerId: participantAId, reasoning: "No opponent — solo submission accepted.", confidence: 0.85 };
  }

  // ── System: strict, rubric-based, honest about uncertainty ──
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
- Check that the claimed action is actually visible across the frames, not just implied by the description.
- Note timestamps/frame labels in your reasoning when citing what you saw.

CONFIDENCE SCALE (be calibrated — stakes are real):
- 0.95-1.00: Unambiguous — one side clearly won, no reasonable doubt.
- 0.85-0.94: Confident but with minor caveats worth noting.
- 0.70-0.84: Leaning toward a winner but with real doubt.
- 0.50-0.69: Barely above coin-flip — treat as a disputed call.
- Below 0.50: Do not return a winner; return null.
(The system auto-flags confidence < 0.85 for manual review and does NOT auto-settle those.)

Return ONLY a valid JSON object, nothing before or after it. Shape:
{
  "analysis": "<2-4 sentence step-by-step examination of both sides' evidence>",
  "winner": "A" | "B" | null,
  "reasoning": "<one short paragraph explaining the call in plain language for the loser to understand>",
  "confidence": 0.0-1.0
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
  const allVisuals = capJudgeVisuals(visualsA.visuals, visualsB.visuals, 24);

  const visualPreamble = [...visualsA.preambleLines, ...visualsB.preambleLines].join("\n");
  const evidenceSummary = `Participant A evidence (${evidenceA!.type}):
description: ${evidenceA!.description || "(none)"}${evidenceA!.url ? `\nmedia: ${evidenceA!.url}` : ""}

Participant B evidence (${evidenceB!.type}):
description: ${evidenceB!.description || "(none)"}${evidenceB!.url ? `\nmedia: ${evidenceB!.url}` : ""}`;

  const userText = `Challenge: "${title}"
Type: ${type}
${params.description ? `Context: ${params.description}\n` : ""}Rules / Task: ${rules || title}
Evidence policy: ${params.evidencePolicy || "self_report"}${params.deadlineIso ? `\nDeadline: ${params.deadlineIso}` : ""}

${evidenceSummary}

${visualPreamble ? `Vision extraction notes:\n${visualPreamble}\n\n` : ""}${allVisuals.length > 0 ? `I have attached ${allVisuals.length} frame(s) from the submitted media — examine them as your primary evidence; the descriptions above are supporting context only.\n\n` : ""}Decide now. Return JSON only.`;

  // One-shot vision call, with optional low-confidence escalation to a bigger model
  // in the same family. Default path: gpt-4o-mini (fast/cheap). Escalation: gpt-4o.
  const runJudge = async (modelName: string): Promise<{ winner: "A" | "B" | null; reasoning: string; confidence: number; analysis?: string } | null> => {
    try {
      const text = allVisuals.length > 0
        ? await completeOracleJudgeVision({
            providerId: params.providerId,
            model: modelName,
            system,
            userText,
            images: allVisuals,
            maxTokens: 800,
          })
        : await completeOraclePrompt({
            providerId: params.providerId,
            model: modelName,
            system,
            user: userText,
            maxTokens: 800,
          });
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]) as { winner: "A" | "B" | null; reasoning: string; confidence: number; analysis?: string };
    } catch {
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
  if (/video|record|film|stream/i.test(input)) evidenceType = "video";
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
    reasoning:
      `AI was unable to evaluate "${challengeTitle}" (primary and escalated model calls both failed or returned malformed JSON). ` +
      `Marking this challenge as needing manual review. No credits will move until the creator explicitly confirms a winner.`,
  };
}
