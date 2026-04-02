import { safeParseBetDraft } from "./parse-bet-schema";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "./llm-providers";
import type { EvidencePayload } from "./evidence-types";
import { completeOraclePrompt, completeOracleJudgeVision } from "./llm-router";
import {
  capJudgeVisuals,
  prepareParticipantVisuals,
  type JudgeVisionImage,
} from "./media/prepare-evidence-visuals";

function hasProviderApiKey(providerId: string): boolean {
  const def = getProviderById(providerId);
  return Boolean(def && process.env[def.envVar]);
}

function resolveParseOpts(modelOrOpts?: string | ParseChallengeOptions): ParseChallengeOptions {
  if (modelOrOpts == null) return {};
  if (typeof modelOrOpts === "string") return { model: modelOrOpts };
  return modelOrOpts;
}

export interface ParseChallengeOptions {
  model?: string;
  providerId?: string;
}

export type JudgingMethod = "vision" | "api" | "hybrid";

export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number; // credits
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;
  /** How the outcome should be verified: pixels vs external data. */
  judgingMethod: JudgingMethod;
}

export interface JudgmentResult {
  winnerId: string | null;
  reasoning: string;
  confidence: number;
}

export type { EvidencePayload } from "./evidence-types";

export interface JudgeChallengeParams {
  title: string;
  /** Original user-facing condition / agreement (from DB `description`). */
  description?: string | null;
  /** ISO-8601 UTC deadline when stored on the challenge; informs forfeits and timing. */
  deadlineIso?: string | null;
  type: string;
  rules: string | null | undefined;
  evidencePolicy: string | null | undefined;
  evidenceA: EvidencePayload | null;
  evidenceB: EvidencePayload | null;
  participantAId: string;
  participantBId: string | null;
  model?: string;
  /** LLM backend id from `llm-providers` (default: anthropic). */
  providerId?: string;
}

export async function parseChallenge(
  input: string,
  modelOrOpts?: string | ParseChallengeOptions,
): Promise<ParsedChallenge> {
  const opts = resolveParseOpts(modelOrOpts);
  const providerId = opts.providerId ?? DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  const model = opts.model ?? def?.defaultModel ?? "claude-haiku-4-20250414";

  if (!hasProviderApiKey(providerId)) return parseChallengeFallback(input);

  const system = `You parse natural language into a structured bet/challenge. Think like a sharp bookmaker: crisp win conditions, no ambiguity. Credits are the in-app currency (1 credit ≈ $0.01). Return ONLY valid JSON with these fields:
- title (string, max 64 chars, concise)
- type (one of: Fitness, Cooking, Coding, Learning, Games, Video, General)
- suggestedStake (integer, credits to wager, 0 if none mentioned. If user says "$5" or "5U", convert to 500 credits. If user says "10 credits" use 10.)
- evidenceType ("video" | "photo" | "gps" | "self_report")
- rules (string, concrete boundaries: time limits, what counts as success, colors/objects if applicable)
- deadline (string like "48 hours", "7 days", "1 minute" when user implies a short window)
- isPublic (boolean, true unless user says private)
- judgingMethod ("vision" | "api" | "hybrid"): "vision" if video/photo must decide (pushups, car color, form); "api" if an external feed/price/sports API would decide; "hybrid" if both could apply.`;

  try {
    const text = await completeOraclePrompt({
      providerId,
      model,
      system,
      user: input,
      maxTokens: 512,
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const normalized = normalizeParsedChallenge(raw);
      const validated = safeParseBetDraft(normalized);
      if (validated) return validated;
    }
  } catch {
    // fall through
  }

  return parseChallengeFallback(input);
}

function evidenceBlock(label: string, e: EvidencePayload | null): string {
  if (!e) return `${label}: (none submitted)`;
  const parts = [
    `type=${e.type}`,
    e.description ? `description=${e.description}` : null,
    e.url ? `url=${e.url}` : null,
  ].filter(Boolean);
  return `${label}: ${parts.join(" | ")}`;
}

function challengeContextBlock(p: Pick<JudgeChallengeParams, "description" | "deadlineIso">): string {
  const desc =
    p.description && String(p.description).trim() ? String(p.description).trim() : "(none provided)";
  const dl = p.deadlineIso ? `${p.deadlineIso} (UTC)` : "Not set on challenge record";
  return `Agreed condition / description: ${desc}
Recorded submission deadline: ${dl}`;
}

/** Upgrade to a vision SKU when we attach real pixels (video→JPEG frames or photos). */
function resolveJudgeVisionModel(providerId: string, userModel: string): string {
  if (providerId === "anthropic") {
    if (/claude-(opus|sonnet)/i.test(userModel)) return userModel;
    if (/haiku/i.test(userModel)) return userModel;
    return "claude-sonnet-4-20250514";
  }
  if (providerId === "openai" || providerId === "azure_openai") {
    if (/gpt-4|4o|o4|o3|vision/i.test(userModel)) return userModel;
    return "gpt-4o-mini";
  }
  if (providerId === "google") {
    if (/gemini/i.test(userModel)) return userModel;
    return "gemini-2.0-flash";
  }
  return userModel;
}

/**
 * AI verdict: compares evidence to challenge rules. Uses configured LLM provider when API key is set.
 */
export async function judgeChallenge(params: JudgeChallengeParams): Promise<JudgmentResult> {
  const {
    title,
    description,
    deadlineIso,
    type,
    rules,
    evidencePolicy,
    evidenceA,
    evidenceB,
    participantAId,
    participantBId,
    model: modelParam,
    providerId: providerIdParam,
  } = params;

  const providerId = providerIdParam ?? DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  const model = modelParam ?? def?.defaultModel ?? "claude-haiku-4-20250414";

  const isDuel = Boolean(participantBId);

  if (!evidenceA && !evidenceB) {
    return {
      winnerId: null,
      reasoning: "No evidence from any participant. Challenge voided — stakes refunded.",
      confidence: 0.99,
    };
  }

  if (!hasProviderApiKey(providerId)) {
    return judgeChallengeFallback(params);
  }

  const system = `You are a neutral arbitrator for a peer challenge platform (not a lawyer). Be impartial: weigh only the stated rules, the agreed condition, evidence, and the recorded deadline. Be fair, concrete, and cite what supports each call. If the deadline has passed and one side submitted nothing while the other submitted plausible evidence, you may treat missing submission as a forfeit unless the rules say otherwise. Always return ONLY valid JSON with no markdown.

For head-to-head challenges (two participants with evidence), pick exactly one winner unless evidence is equally weak — then use "tie".

For solo challenges (only one participant with evidence), decide if their evidence plausibly satisfies the challenge under the stated rules. "satisfied" means the user likely completed the challenge; "not_satisfied" means the evidence contradicts or is clearly insufficient; "insufficient" means you cannot tell and need more proof.`;

  let userPrompt: string;

  if (isDuel && evidenceA && evidenceB) {
    userPrompt = `Challenge type: ${type}
Title: ${title}
${challengeContextBlock({ description, deadlineIso })}
Rules: ${rules || "Standard rules implied by title."}
Evidence policy (how results should be proven): ${evidencePolicy || "Not specified"}

${evidenceBlock("Participant A (challenger)", evidenceA)}
${evidenceBlock("Participant B (opponent)", evidenceB)}

Return JSON:
{
  "winner": "A" | "B" | "tie",
  "reasoning": "2-5 sentences explaining who satisfied the challenge better and why",
  "confidence": number from 0 to 1,
  "key_factors": ["short bullet", "..."]
}`;
  } else if (evidenceA && !evidenceB) {
    userPrompt = `Solo / single-sided challenge.
Type: ${type}
Title: ${title}
${challengeContextBlock({ description, deadlineIso })}
Rules: ${rules || "Standard rules implied by title."}
Evidence policy: ${evidencePolicy || "Not specified"}

${evidenceBlock("Participant A", evidenceA)}

Return JSON:
{
  "outcome": "satisfied" | "not_satisfied" | "insufficient",
  "reasoning": "2-5 sentences on whether the evidence meets the challenge",
  "confidence": number from 0 to 1,
  "key_factors": ["short bullet", "..."]
}`;
  } else if (!evidenceA && evidenceB && participantBId) {
    userPrompt = `Solo evidence only from participant B.
Type: ${type}
Title: ${title}
${challengeContextBlock({ description, deadlineIso })}
Rules: ${rules || "Standard rules implied by title."}
Evidence policy: ${evidencePolicy || "Not specified"}

${evidenceBlock("Participant B", evidenceB)}

Return JSON:
{
  "outcome": "satisfied" | "not_satisfied" | "insufficient",
  "reasoning": "...",
  "confidence": number from 0 to 1,
  "key_factors": ["..."]
}`;
  } else {
    return judgeChallengeFallback(params);
  }

  let bundleA: { preambleLines: string[]; visuals: JudgeVisionImage[] } = {
    preambleLines: [],
    visuals: [],
  };
  let bundleB: { preambleLines: string[]; visuals: JudgeVisionImage[] } = {
    preambleLines: [],
    visuals: [],
  };

  if (isDuel && evidenceA && evidenceB) {
    const [a, b] = await Promise.all([
      prepareParticipantVisuals("Participant A (challenger)", evidenceA),
      prepareParticipantVisuals("Participant B (opponent)", evidenceB),
    ]);
    bundleA = a;
    bundleB = b;
  } else if (evidenceA && !evidenceB) {
    bundleA = await prepareParticipantVisuals("Participant A", evidenceA);
  } else if (!evidenceA && evidenceB && participantBId) {
    bundleB = await prepareParticipantVisuals("Participant B", evidenceB);
  }

  const mediaNotes = [...bundleA.preambleLines, ...bundleB.preambleLines];
  if (mediaNotes.length) {
    userPrompt = `Evidence pipeline (automation + URLs):\n${mediaNotes.join("\n")}\n\n---\n\n${userPrompt}`;
  }

  const visuals = capJudgeVisuals(bundleA.visuals, bundleB.visuals, 24);
  const visionHint =
    visuals.length > 0
      ? " Attached JPEGs may include evenly spaced frames from user videos—use captions for timeline hints."
      : "";
  const systemAugmented = system + visionHint;

  try {
    let text: string;
    if (visuals.length > 0) {
      const visionModel = resolveJudgeVisionModel(providerId, model);
      const legend = visuals.map((v, i) => `[Visual ${i + 1}] ${v.caption}`).join("\n");
      const userWithLegend = `You have ${visuals.length} image(s) attached in API order. Read pixels for objective facts (reps, form, completion, continuity). Then answer using ONLY the JSON schema below.\n${legend}\n\n---\n\n${userPrompt}`;
      text = await completeOracleJudgeVision({
        providerId,
        model: visionModel,
        system: systemAugmented,
        userText: userWithLegend,
        images: visuals,
        maxTokens: 1024,
      });
    } else {
      text = await completeOraclePrompt({
        providerId,
        model,
        system: systemAugmented,
        user: userPrompt,
        maxTokens: 1024,
      });
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return judgeChallengeFallback(params);

    const result = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    if (isDuel && evidenceA && evidenceB) {
      const w = result.winner;
      let winnerId: string | null = null;
      if (w === "A") winnerId = participantAId;
      else if (w === "B" && participantBId) winnerId = participantBId;
      else winnerId = null;

      let reasoning = String(result.reasoning || "");
      const factors = result.key_factors;
      if (Array.isArray(factors) && factors.length) {
        reasoning += `\n\nKey factors: ${factors.map(String).join("; ")}`;
      }

      return {
        winnerId,
        reasoning: reasoning || "AI could not produce reasoning.",
        confidence: typeof result.confidence === "number" ? Math.min(1, Math.max(0, result.confidence)) : 0.75,
      };
    }

    const outcome = String(result.outcome || "").toLowerCase();
    let winnerId: string | null = null;
    if (outcome === "satisfied") {
      winnerId = evidenceA ? participantAId : participantBId;
    } else {
      winnerId = null;
    }

    let reasoning = String(result.reasoning || "");
    const factors = result.key_factors;
    if (Array.isArray(factors) && factors.length) {
      reasoning += `\n\nKey factors: ${factors.map(String).join("; ")}`;
    }
    if (outcome === "insufficient") {
      reasoning = `[Insufficient evidence] ${reasoning}`;
    } else if (outcome === "not_satisfied") {
      reasoning = `[Challenge not satisfied] ${reasoning}`;
    }

    return {
      winnerId,
      reasoning: reasoning || "AI could not produce reasoning.",
      confidence: typeof result.confidence === "number" ? Math.min(1, Math.max(0, result.confidence)) : 0.75,
    };
  } catch {
    return judgeChallengeFallback(params);
  }
}

function coerceJudgingMethod(
  v: unknown,
  evidenceType: string,
): JudgingMethod {
  const s = String(v ?? "").toLowerCase();
  if (s === "vision" || s === "api" || s === "hybrid") return s;
  if (evidenceType === "video" || evidenceType === "photo") return "vision";
  if (evidenceType === "gps") return "api";
  return "hybrid";
}

function normalizeParsedChallenge(raw: Record<string, unknown>): ParsedChallenge {
  const evidenceType = String(raw.evidenceType ?? "self_report");
  const judgingSource = raw.judgingMethod ?? raw.judging_method;
  return {
    title: String(raw.title ?? "Challenge").slice(0, 64),
    type: String(raw.type ?? "General"),
    suggestedStake: Math.max(0, Math.floor(Number(raw.suggestedStake ?? 0))),
    evidenceType,
    rules: String(raw.rules ?? ""),
    deadline: String(raw.deadline ?? "48 hours"),
    isPublic: raw.isPublic !== false,
    judgingMethod: coerceJudgingMethod(judgingSource, evidenceType),
  };
}

export function generateClarifications(parsed: ParsedChallenge): Array<{ question: string; options: string[] }> {
  const questions = [];
  questions.push({
    question: `I'll set up a **${parsed.type}** challenge: "${parsed.title}". Who's your opponent?`,
    options: ["Invite a friend", "Anyone nearby", "Open to public"],
  });
  if (parsed.suggestedStake <= 0) {
    questions.push({
      question: "Would you like to stake some credits, or keep it free?",
      options: ["Free — just for fun", "5 credits", "10 credits", "20 credits"],
    });
  } else {
    questions.push({
      question: `You mentioned a ${parsed.suggestedStake} credit wager. Confirm or adjust?`,
      options: [`${parsed.suggestedStake} credits — confirm`, "5 credits", "10 credits", "20 credits", "50 credits"],
    });
  }
  questions.push({
    question: "How should we verify the result?",
    options: ["Video proof", "Photo evidence", "GPS tracking", "Self-report + honor system"],
  });
  return questions;
}

/* ── Fallback parsers (no API key) ── */

const TYPE_PATTERNS: Record<string, RegExp> = {
  Fitness: /pushup|push-up|run|jog|gym|workout|plank|squat|exercise|mile|km|bench|deadlift|pullup|pull-up|burpee|cycling|swim|marathon|sprint|fitness/i,
  Cooking: /cook|bake|food|pasta|recipe|dish|meal|kitchen|chef|cake|bread|grill|bbq/i,
  Coding: /code|coding|program|leetcode|dev|developer|bug|algorithm|hack|github|commit|debug|api|software/i,
  Learning: /read|book|study|learn|exam|test|quiz|course|gpa|grade|class|homework|essay|paper/i,
  Games: /chess|game|play|match|tournament|poker|board|card|esport|fortnite|valorant|league|rank/i,
  Video: /video|film|tiktok|youtube|stream|record|dance|sing|perform/i,
};

function parseChallengeFallback(input: string): ParsedChallenge {
  let type = "General";
  for (const [t, pattern] of Object.entries(TYPE_PATTERNS)) {
    if (pattern.test(input)) {
      type = t;
      break;
    }
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

  const candidate: ParsedChallenge = {
    title,
    type,
    suggestedStake: amount,
    evidenceType,
    rules: `Standard ${type.toLowerCase()} challenge — AI reviewed`,
    deadline,
    isPublic: !/private|secret|just us|between us/i.test(input),
    judgingMethod: coerceJudgingMethod(undefined, evidenceType),
  };
  return safeParseBetDraft(candidate) ?? candidate;
}

function judgeChallengeFallback(params: JudgeChallengeParams): JudgmentResult {
  const { title, evidenceA, evidenceB, participantAId, participantBId } = params;
  if (!evidenceA && !evidenceB) {
    return { winnerId: null, reasoning: "No evidence submitted.", confidence: 0.9 };
  }
  if (evidenceA && !evidenceB && participantBId) {
    return {
      winnerId: participantAId,
      reasoning: `Only the challenger submitted evidence for "${title}". Opponent defaulted.`,
      confidence: 0.82,
    };
  }
  if (!evidenceA && evidenceB && participantBId) {
    return {
      winnerId: participantBId,
      reasoning: `Only the opponent submitted evidence for "${title}". Challenger defaulted.`,
      confidence: 0.82,
    };
  }
  if (evidenceA && !evidenceB && !participantBId) {
    return {
      winnerId: participantAId,
      reasoning: `[Demo mode — set API key for your LLM provider] Evidence received for "${title}". Treated as completed.`,
      confidence: 0.7,
    };
  }
  if (evidenceA && evidenceB && participantAId && participantBId) {
    const random = Math.random();
    const winnerId = random > 0.5 ? participantAId : participantBId;
    const confidence = 0.65 + Math.random() * 0.2;
    return {
      winnerId,
      confidence,
      reasoning: `[Demo mode — set API key for your LLM provider] Compared ${evidenceA.type} vs ${evidenceB.type} for "${title}". Assigned winner for testing.`,
    };
  }
  return {
    winnerId: participantAId,
    reasoning: "Could not evaluate — fallback.",
    confidence: 0.5,
  };
}
