import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { getDailyAiQuotaStatus, refundDailyAiQuota, spendDailyAiQuota } from "@/lib/daily-ai-quota";
import { logAiUsage } from "@/lib/ai-usage-log";
import { completeOraclePromptWithMetadata } from "@/lib/llm-router";
import {
  configuredProviders,
  getProviderById,
  isPaidProvider,
  isProviderConfigured,
  resolveTierModel,
  resolveTierProvider,
} from "@/lib/llm-providers";
import { protocolPreview, parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { rateLimit } from "@/lib/rate-limit";
import { evaluateRuleSafety, type RuleSafetyDecision } from "@/lib/rule-safety";

function safeAlternativeFor(flags: string[]) {
  if (flags.includes("drugs_or_alcohol")) return "Try a water bottle speed challenge with a clear safety limit.";
  if (flags.includes("violence")) return "Try a push-up, plank, sprint, trivia, or game-score challenge instead.";
  if (flags.includes("chance_or_real_money_gambling")) return "Try an internal-credit skill challenge with objective evidence.";
  if (flags.includes("non_consensual_or_harassment")) return "Create a voluntary challenge where every participant opts in before recording.";
  if (flags.includes("illegal_activity")) return "Use a legal skill, fitness, learning, or game challenge.";
  return "Rewrite this as a safe, voluntary, internal-credit skill challenge.";
}

function blockedProtocol(inputText: string, language: "en" | "zh" | "auto", safety: RuleSafetyDecision) {
  return {
    version: "2.0" as const,
    title: "Challenge blocked by safety policy",
    userFacingSummary: safety.reason,
    rawPrompt: inputText,
    language,
    participantMode: "head_to_head" as const,
    outcomeType: "custom" as const,
    evidenceProtocol: {
      mode: "manual_review" as const,
      requiredEvidence: ["No evidence can be accepted until the challenge is rewritten safely."],
      captureInstructions: ["Create a safe alternative before publishing."],
      invalidEvidenceRules: ["Unsafe, illegal, coercive, or non-consensual evidence is invalid."],
      requiredMetadata: ["created_at"],
    },
    identityProtocol: {
      mode: "manual_identity_review" as const,
      required: true,
      participantBindings: [
        { role: "creator" as const, label: "Creator", expectedPosition: "any" as const, requiredQrOrCode: false },
        { role: "opponent" as const, label: "Opponent", expectedPosition: "any" as const, requiredQrOrCode: false },
      ],
      autoSettlementRequiresIdentityConfidence: 1,
    },
    locationProtocol: {
      mode: "none" as const,
      requiresLiveLocation: false,
      requiresCoPresence: false,
      locationPrivacy: "hidden" as const,
    },
    timingProtocol: {
      startCondition: "Blocked until rewritten.",
      endCondition: "Blocked until rewritten.",
      deadline: "none",
      tieBreaker: "none",
      allowedAttempts: "0",
    },
    settlementProtocol: {
      mode: "blocked" as const,
      winCondition: "No winner can be decided for a blocked challenge.",
      judgeInstructions: ["Do not judge or settle this challenge."],
      autoSettleConfidenceThreshold: 1,
      manualReviewTriggers: [safety.reason],
    },
    riskPolicy: {
      riskLevel: safety.category === "review" ? "high" as const : "blocked" as const,
      allowed: false,
      warnings: [safety.reason],
      restrictions: ["This challenge cannot be published or settled in its current form."],
      safeAlternative: safeAlternativeFor(safety.flags),
      blockedReason: safety.reason,
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 0,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low" as const,
      requireHumanReviewAboveStake: 0,
    },
  };
}

class CompileRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function pickProvider(requested?: string) {
  const requestedProvider = requested ? getProviderById(requested) : undefined;
  if (requested && !requestedProvider) throw new CompileRequestError(`Unknown AI provider: ${requested}`, 400);
  if (requestedProvider) {
    if (!isProviderConfigured(requestedProvider)) {
      throw new CompileRequestError(`Selected AI provider ${requestedProvider.shortLabel} is not configured.`, 503);
    }
    return requestedProvider;
  }
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER ? getProviderById(process.env.ORACLE_DEFAULT_PROVIDER) : undefined;
  if (envProvider && configuredProviders().some((provider) => provider.id === envProvider.id)) return envProvider;
  const provider = resolveTierProvider(1) ?? configuredProviders()[0];
  if (!provider || !isProviderConfigured(provider)) {
    throw new CompileRequestError("No configured AI provider is available for protocol compilation.", 503);
  }
  return provider;
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const text = fenced || raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM did not return JSON");
  return JSON.parse(match[0]) as unknown;
}

function compileSystemPrompt() {
  return `You are GambleAI, an AI challenge protocol compiler.

You do not generate only a title or casual rules. You compile a natural-language challenge idea into ProtocolSpecV2 JSON.

Return ONLY valid JSON with this exact top-level shape:
{
  "version": "2.0",
  "title": string,
  "userFacingSummary": string,
  "rawPrompt": string,
  "language": "en" | "zh" | "auto",
  "participantMode": "solo" | "head_to_head" | "small_group" | "team_vs_team" | "mass_crowd" | "public_market",
  "outcomeType": "speed" | "count" | "completion" | "threshold" | "yes_no" | "ranking" | "quality_score" | "prediction" | "location_checkin" | "survival_duration" | "custom",
  "evidenceProtocol": {
    "mode": "same_camera_video" | "separate_video" | "live_host_video" | "photo" | "screenshot" | "gps" | "receipt" | "public_oracle" | "platform_metric" | "witness" | "manual_review",
    "requiredEvidence": string[],
    "captureInstructions": string[],
    "invalidEvidenceRules": string[],
    "requiredMetadata": string[]
  },
  "identityProtocol": {
    "mode": "account_only" | "liveness_phrase" | "left_right_assignment" | "qr_participant_card" | "host_checkin" | "group_lobby_ticket" | "manual_identity_review",
    "required": boolean,
    "participantBindings": [{"role":"creator"|"opponent"|"participant"|"host","label":string,"expectedPosition":"left"|"right"|"center"|"any","requiredPhrase":string,"requiredQrOrCode":boolean}],
    "autoSettlementRequiresIdentityConfidence": number
  },
  "locationProtocol": {
    "mode": "none" | "nearby_discovery" | "same_place_required" | "walk_to_join" | "geo_fenced_zone" | "live_route" | "mass_local_event",
    "joinRadiusMeters": number,
    "challengeRadiusMeters": number,
    "requiresLiveLocation": boolean,
    "requiresCoPresence": boolean,
    "locationPrivacy": "hidden" | "approximate" | "precise_until_challenge_ends" | "precise_live_only"
  },
  "timingProtocol": {"startCondition": string, "endCondition": string, "deadline": string, "tieBreaker": string, "allowedAttempts": string},
  "settlementProtocol": {
    "mode": "auto_oracle" | "auto_ai_text" | "auto_ai_vision" | "leaderboard" | "host_confirmed" | "peer_confirmed" | "manual_review" | "blocked",
    "winCondition": string,
    "judgeInstructions": string[],
    "autoSettleConfidenceThreshold": number,
    "manualReviewTriggers": string[]
  },
  "riskPolicy": {"riskLevel":"safe"|"medium"|"high"|"blocked","allowed":boolean,"warnings":string[],"restrictions":string[],"safeAlternative":string,"blockedReason":string},
  "aiBudgetPolicy": {"compileMaxTokens":number,"judgeMaxTokens":number,"maxVisionFrames":number,"allowEscalation":boolean,"estimatedCostTier":"low"|"medium"|"high","requireHumanReviewAboveStake":number}
}

Rules:
- If the user asks for a random challenge, invent one concrete safe challenge.
- If the idea is unsafe, illegal, coercive, alcohol/drug based, violent, non-consensual, stalking-like, or chance-based real-money gambling, set riskPolicy.allowed=false and settlementProtocol.mode="blocked"; include a safeAlternative when possible.
- Same-camera physical challenges require identityProtocol.required=true, identityProtocol.mode="left_right_assignment", creator left, opponent right, liveness/QR code required, and no auto-settlement unless identity is verified.
- Nearby or walk-by challenges should use locationProtocol.mode="nearby_discovery" or "walk_to_join", approximate public privacy, and a conservative radius.
- Mass crowd challenges should use participantMode="mass_crowd" and settlementProtocol.mode="leaderboard"; they should not look like a normal 1v1 challenge.
- Auto-settle requires protocol, identity, evidence, outcome, risk, and confidence gates. Default confidence threshold is 0.85.
- Keep real-money gambling out of scope. Use internal credits/points only.`;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const limited = await rateLimit(req, { scope: "compile-protocol", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const inputText = String(body.inputText || body.prompt || "").trim();
  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : undefined;
  const model = typeof body.model === "string" ? body.model.trim() : undefined;
  const language = body.language === "en" || body.language === "zh" || body.language === "auto" ? body.language : "auto";
  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : undefined;

  if (!inputText) return Response.json({ error: "inputText is required" }, { status: 400 });
  if (inputText.length > 2000) {
    return Response.json({ error: "Challenge prompt is too long. Keep it under 2000 characters." }, { status: 400 });
  }

  const safety = evaluateRuleSafety(inputText);
  if (!safety.allowed) {
    const protocol = blockedProtocol(inputText, language, safety);
    console.warn("[compile-protocol] blocked by safety prefilter", {
      userId: user.userId,
      flags: safety.flags,
      reason: safety.reason,
    });
    return Response.json({
      rawPrompt: inputText,
      protocol,
      preview: protocolPreview(protocol),
      source: "safety_prefilter",
      providerId: "safety_prefilter",
      model: "rule-safety",
      externalApiCharged: false,
      providerCall: null,
      dailyQuota: await getDailyAiQuotaStatus(user.userId),
    });
  }

  const quota = await spendDailyAiQuota(user.userId, "spec");
  if (!quota.ok) {
    return Response.json({ error: quota.error, dailyQuota: quota.status, retryAt: quota.retryAt }, { status: 429 });
  }

  try {
    const provider = pickProvider(providerId);
    const selectedModel = model || resolveTierModel(provider, 1);
    console.log(`[compile-protocol] calling provider=${provider.id} model=${selectedModel} promptChars=${inputText.length}`);
    const completion = await completeOraclePromptWithMetadata({
      providerId: provider.id,
      model: selectedModel,
      system: compileSystemPrompt(),
      user: [
        `User prompt: ${inputText}`,
        `Language hint: ${language}`,
        context ? `Context: ${JSON.stringify(context)}` : null,
        "Compile the protocol. Return JSON only.",
      ].filter(Boolean).join("\n\n"),
      maxTokens: 2400,
      temperature: 0.15,
    });
    const parsed = extractJson(completion.text);
    const protocol = parseProtocolSpecV2({
      ...(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}),
      version: "2.0",
      rawPrompt: inputText,
      language,
    });
    if (!protocol) throw new Error("LLM response did not match ProtocolSpecV2");
    await logAiUsage({
      userId: user.userId,
      route: "/api/challenges/compile",
      metadata: completion.metadata,
      extra: { surface: context?.surface ?? null, rawPromptChars: inputText.length },
    });

    return Response.json({
      rawPrompt: inputText,
      protocol,
      preview: protocolPreview(protocol),
      source: "llm",
      providerId: provider.id,
      model: selectedModel,
      externalApiCharged: isPaidProvider(provider),
      providerCall: completion.metadata,
      dailyQuota: quota.status,
    });
  } catch (error) {
    const status = error instanceof CompileRequestError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Protocol compilation failed";
    const refundedQuota = status === 400 || status === 503
      ? await refundDailyAiQuota(user.userId, "spec").catch(() => null)
      : null;
    console.error("[compile-protocol] failed", { providerId: providerId ?? null, model: model ?? null, status, error: message });
    return Response.json(
      {
        error: `AI protocol compilation failed: ${message}`,
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
