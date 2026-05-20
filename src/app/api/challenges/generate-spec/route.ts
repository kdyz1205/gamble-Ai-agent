import { NextRequest } from "next/server";
import type { ChallengeSpec } from "@/lib/challenge-spec";
import { generateChallengeSpec } from "@/lib/challenge-spec";
import { completeOraclePromptWithMetadata } from "@/lib/llm-router";
import { configuredProviders, getProviderById, isPaidProvider, isProviderConfigured, resolveTierModel, resolveTierProvider } from "@/lib/llm-providers";
import { rateLimit } from "@/lib/rate-limit";
import { evaluateRuleSafety } from "@/lib/rule-safety";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { refundDailyAiQuota, spendDailyAiQuota } from "@/lib/daily-ai-quota";
import { logAiUsage } from "@/lib/ai-usage-log";
import { protocolPreview, protocolSpecFromChallengeSpec, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

const INVITE_MODES: ChallengeSpec["invite_mode"][] = ["nearby", "invite_link", "direct_friend", "same_device"];
const PARTICIPATION_MODES: ChallengeSpec["participation_mode"][] = ["remote_async", "remote_live", "same_camera", "in_person"];

class GenerationRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function pickProvider(requested?: string) {
  const requestedProviderFromBody = requested ? getProviderById(requested) : undefined;
  if (requested && !requestedProviderFromBody) {
    throw new GenerationRequestError(`Unknown AI provider: ${requested}`, 400);
  }
  if (requestedProviderFromBody) {
    if (!isProviderConfigured(requestedProviderFromBody)) {
      throw new GenerationRequestError(
        `Selected AI provider ${requestedProviderFromBody.shortLabel} is not configured for real generation.`,
        503,
      );
    }
    return requestedProviderFromBody;
  }
  const requestedFromEnv = process.env.ORACLE_DEFAULT_PROVIDER;
  const requestedProvider = requestedFromEnv ? getProviderById(requestedFromEnv) : undefined;
  if (requestedProvider && configuredProviders().some((provider) => provider.id === requestedProvider.id)) {
    return requestedProvider;
  }
  const provider = resolveTierProvider(1) ?? configuredProviders()[0];
  if (!provider || !isProviderConfigured(provider)) {
    throw new GenerationRequestError("No configured AI provider is available for real generation.", 503);
  }
  return provider;
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const text = fenced || raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM did not return JSON");
  const parsed = JSON.parse(match[0]) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM JSON was not an object");
  }
  return parsed as Partial<ChallengeSpec>;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function normalizeSpec(ai: Partial<ChallengeSpec>, fallback: ChallengeSpec): ChallengeSpec {
  const invite = INVITE_MODES.includes(ai.invite_mode as ChallengeSpec["invite_mode"])
    ? ai.invite_mode as ChallengeSpec["invite_mode"]
    : fallback.invite_mode;
  const participation = PARTICIPATION_MODES.includes(ai.participation_mode as ChallengeSpec["participation_mode"])
    ? ai.participation_mode as ChallengeSpec["participation_mode"]
    : fallback.participation_mode;
  const aiStake = asNumber(ai.stake_amount, fallback.stake_amount);

  return {
    ...fallback,
    ...ai,
    challenge_title: asString(ai.challenge_title, fallback.challenge_title),
    challenge_type: asString(ai.challenge_type, fallback.challenge_type),
    participants: Array.isArray(ai.participants) && ai.participants.length >= 2 ? ai.participants : fallback.participants,
    stake_amount: fallback.stake_amount > 0 && aiStake === 0 ? fallback.stake_amount : aiStake,
    currency_or_points: ai.currency_or_points === "credits" ? "credits" : "points",
    public_or_private: ai.public_or_private === "public" ? "public" : "private",
    invite_mode: invite,
    participation_mode: participation,
    objective: asString(ai.objective, fallback.objective),
    winning_condition: asString(ai.winning_condition, fallback.winning_condition),
    required_evidence: asString(ai.required_evidence, fallback.required_evidence),
    video_capture_instructions: asString(ai.video_capture_instructions, fallback.video_capture_instructions),
    start_condition: asString(ai.start_condition, fallback.start_condition),
    end_condition: asString(ai.end_condition, fallback.end_condition),
    timing_method: asString(ai.timing_method, fallback.timing_method),
    valid_repetition_definition: asString(ai.valid_repetition_definition, fallback.valid_repetition_definition),
    scoring_method: asString(ai.scoring_method, fallback.scoring_method),
    allowed_attempts: asString(ai.allowed_attempts, fallback.allowed_attempts),
    anti_cheat_rules: Array.isArray(ai.anti_cheat_rules) && ai.anti_cheat_rules.length > 0
      ? ai.anti_cheat_rules.map((rule) => String(rule)).filter(Boolean)
      : fallback.anti_cheat_rules,
    ai_judging_method: asString(ai.ai_judging_method, fallback.ai_judging_method),
    dispute_window: asString(ai.dispute_window, fallback.dispute_window),
    fallback_manual_review: asString(ai.fallback_manual_review, fallback.fallback_manual_review),
    payout_rule: asString(ai.payout_rule, fallback.payout_rule),
    safety_warning: asString(ai.safety_warning, fallback.safety_warning),
    legal_compliance_flag: ai.legal_compliance_flag === "requires_legal_review" ? "requires_legal_review" : "internal_points_only",
    mode_options: fallback.mode_options,
  };
}

function validateAiSpecShape(ai: Partial<ChallengeSpec>) {
  const missing: string[] = [];
  const stringFields: Array<keyof ChallengeSpec> = [
    "challenge_title",
    "challenge_type",
    "objective",
    "winning_condition",
    "required_evidence",
    "video_capture_instructions",
    "start_condition",
    "end_condition",
    "timing_method",
    "valid_repetition_definition",
    "scoring_method",
    "allowed_attempts",
    "ai_judging_method",
    "dispute_window",
    "fallback_manual_review",
    "payout_rule",
    "safety_warning",
  ];
  for (const field of stringFields) {
    if (typeof ai[field] !== "string" || !String(ai[field]).trim()) missing.push(String(field));
  }
  if (!Array.isArray(ai.participants) || ai.participants.length < 2) missing.push("participants");
  if (!Array.isArray(ai.anti_cheat_rules) || ai.anti_cheat_rules.length === 0) missing.push("anti_cheat_rules");
  if (!INVITE_MODES.includes(ai.invite_mode as ChallengeSpec["invite_mode"])) missing.push("invite_mode");
  if (!PARTICIPATION_MODES.includes(ai.participation_mode as ChallengeSpec["participation_mode"])) missing.push("participation_mode");
  if (ai.public_or_private !== "public" && ai.public_or_private !== "private") missing.push("public_or_private");
  if (ai.currency_or_points !== "points" && ai.currency_or_points !== "credits") missing.push("currency_or_points");
  if (typeof ai.stake_amount !== "number" || !Number.isFinite(ai.stake_amount)) missing.push("stake_amount");
  if (ai.legal_compliance_flag !== "internal_points_only" && ai.legal_compliance_flag !== "requires_legal_review") {
    missing.push("legal_compliance_flag");
  }
  return [...new Set(missing)];
}

async function generateAiSpec(
  inputText: string,
  fallback: ChallengeSpec,
  prefs?: { providerId?: string; model?: string; language?: string; context?: Record<string, unknown> },
) {
  const provider = pickProvider(prefs?.providerId);
  const model = prefs?.model?.trim() || resolveTierModel(provider, 1);
  const startedAt = Date.now();

  const system = `You are GambleAI's challenge architect. Convert one natural-language user sentence into one complete executable peer-to-peer challenge wager.

Return ONLY valid JSON matching this TypeScript shape:
{
  "challenge_title": string,
  "challenge_type": string,
  "participants": [{"role":"creator","label":"You"},{"role":"opponent","label":string}],
  "stake_amount": number,
  "currency_or_points": "points" | "credits",
  "public_or_private": "public" | "private",
  "invite_mode": "nearby" | "invite_link" | "direct_friend" | "same_device",
  "participation_mode": "remote_async" | "remote_live" | "same_camera" | "in_person",
  "objective": string,
  "winning_condition": string,
  "required_evidence": string,
  "video_capture_instructions": string,
  "start_condition": string,
  "end_condition": string,
  "timing_method": string,
  "valid_repetition_definition": string,
  "scoring_method": string,
  "allowed_attempts": string,
  "anti_cheat_rules": string[],
  "ai_judging_method": string,
  "dispute_window": string,
  "fallback_manual_review": string,
  "payout_rule": string,
  "safety_warning": string,
  "legal_compliance_flag": "internal_points_only" | "requires_legal_review"
}

Do not ask follow-up questions. Use 0 credits unless the user specifies money or credits, except safe physical head-to-head challenges may default to 1 internal credit so stake/escrow/settlement are explicit. Keep real-money settlement out of scope; use internal points/credits.

For physical video challenges, especially push-ups, the spec must include: a 60-second timebox when the user implies speed/count, valid rep definition, full-body continuous video requirement, start/end conditions, anti-cheat/liveness phrase, AI vision judging method, confidence threshold 0.85, manual-review fallback, and payout rule.`;

  console.log(
    `[generate-spec] calling provider=${provider.id} model=${model} promptChars=${inputText.length} language=${prefs?.language ?? "auto"}`,
  );
  const completion = await completeOraclePromptWithMetadata({
    providerId: provider.id,
    model,
    system,
    user: [
      `User sentence: ${inputText}`,
      `Language/context hint: ${prefs?.language ?? "auto"}`,
      prefs?.context ? `UI context: ${JSON.stringify(prefs.context)}` : null,
      "Generate the spec from the user's sentence. Do not copy a preset template. If the sentence is broad, invent one concrete, safe, publishable challenge.",
    ].filter(Boolean).join("\n\n"),
    maxTokens: 1800,
    temperature: 0.2,
  });
  const aiJson = extractJson(completion.text);
  const shapeErrors = validateAiSpecShape(aiJson);
  if (shapeErrors.length > 0) {
    throw new Error(`AI response did not match challenge spec schema: ${shapeErrors.join(", ")}`);
  }
  const spec = normalizeSpec(aiJson, fallback);
  console.log(
    `[generate-spec] success provider=${provider.id} model=${model} responseModel=${completion.metadata.responseModel ?? "unknown"} durationMs=${Date.now() - startedAt}`,
  );
  return {
    spec,
    model: `${provider.shortLabel} - ${model}`,
    providerId: provider.id,
    externalApiCharged: isPaidProvider(provider),
    providerCall: completion.metadata,
  };
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const limited = await rateLimit(req, { scope: "generate-spec", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const inputText = String(body.inputText || body.input || "").trim();
  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : undefined;
  const model = typeof body.model === "string" ? body.model.trim() : undefined;
  const language = typeof body.language === "string" ? body.language.trim() : undefined;
  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : undefined;

  if (!inputText) {
    return Response.json({ error: "inputText is required" }, { status: 400 });
  }
  if (inputText.length > 2000) {
    return Response.json({ error: "Challenge prompt is too long. Keep it under 2000 characters." }, { status: 400 });
  }

  const safety = evaluateRuleSafety(inputText);
  if (!safety.allowed) {
    return Response.json(
      {
        error: safety.reason,
        safety,
      },
      { status: 400 },
    );
  }

  const fallback = generateChallengeSpec(inputText);
  const quota = await spendDailyAiQuota(user.userId, "spec");
  if (!quota.ok) {
    return Response.json(
      { error: quota.error, dailyQuota: quota.status, retryAt: quota.retryAt },
      { status: 429 },
    );
  }

  try {
    const ai = await generateAiSpec(inputText, fallback, { providerId, model, language, context });
    const protocol = protocolSpecFromChallengeSpec(ai.spec, inputText, {
      language: language === "en" || language === "zh" || language === "auto" ? language as ProtocolSpecV2["language"] : undefined,
    });
    await logAiUsage({
      userId: user.userId,
      route: "/api/challenges/generate-spec",
      metadata: ai.providerCall,
      extra: { source: "generate-spec", rawPromptChars: inputText.length },
    });
    return Response.json({
      rawPrompt: inputText,
      spec: ai.spec,
      protocol,
      preview: protocolPreview(protocol),
      model: ai.model,
      source: "llm",
      providerId: ai.providerId,
      externalApiCharged: ai.externalApiCharged,
      providerCall: ai.providerCall,
      dailyQuota: quota.status,
    });
  } catch (err) {
    const status = err instanceof GenerationRequestError ? err.status : 502;
    const message = err instanceof Error ? err.message : "AI generation failed";
    const refundedQuota = status === 400 || status === 503
      ? await refundDailyAiQuota(user.userId, "spec").catch(() => null)
      : null;
    console.error("[generate-spec] failed", {
      providerId: providerId ?? null,
      model: model ?? null,
      status,
      error: message,
    });
    return Response.json(
      {
        error: `AI challenge generation failed: ${message}`,
        rawPrompt: inputText,
        source: "error",
        providerId: providerId ?? null,
        model: model ?? null,
        dailyQuota: refundedQuota ?? quota.status,
      },
      { status },
    );
  }
}
