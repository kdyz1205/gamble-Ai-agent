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
import { generateChallengeSpec } from "@/lib/challenge-spec";
import { protocolPreview, parseProtocolSpecV2, protocolSpecFromChallengeSpec, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { evaluateRuleSafety, type RuleSafetyDecision } from "@/lib/rule-safety";
import { cryptoPriceProtocolFromPrompt } from "@/lib/crypto-price-oracle";
import { weatherProtocolFromPrompt } from "@/lib/weather-oracle";
import { applyDataSourceGateToProtocol } from "@/lib/data-source-registry";
import { parseChallengeDeadline, stripDeadlineArtifacts } from "@/lib/challenge-time";

export type CompileProtocolSource = "llm" | "safety_prefilter" | "deterministic_oracle" | "fallback";

export class CompileRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function safeAlternativeFor(flags: string[]) {
  if (flags.includes("drugs_or_alcohol")) return "Try a water bottle speed challenge with a clear safety limit.";
  if (flags.includes("violence")) return "Try a push-up, plank, sprint, trivia, or game-score challenge instead.";
  if (flags.includes("chance_or_real_money_gambling")) return "Try an internal-credit skill challenge with objective evidence.";
  if (flags.includes("non_consensual_or_harassment")) return "Create a voluntary challenge where every participant opts in before recording.";
  if (flags.includes("illegal_activity")) return "Use a legal skill, fitness, learning, or game challenge.";
  return "Rewrite this as a safe, voluntary, internal-credit skill challenge.";
}

function blockedProtocol(inputText: string, language: ProtocolSpecV2["language"], safety: RuleSafetyDecision): ProtocolSpecV2 {
  return {
    version: "2.0",
    title: "Challenge blocked by safety policy",
    userFacingSummary: safety.reason,
    rawPrompt: inputText,
    language,
    participantMode: "head_to_head",
    outcomeType: "custom",
    evidenceProtocol: {
      mode: "manual_review",
      requiredEvidence: ["No evidence can be accepted until the challenge is rewritten safely."],
      captureInstructions: ["Create a safe alternative before publishing."],
      invalidEvidenceRules: ["Unsafe, illegal, coercive, or non-consensual evidence is invalid."],
      requiredMetadata: ["created_at"],
    },
    identityProtocol: {
      mode: "manual_identity_review",
      required: true,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false },
        { role: "opponent", label: "Opponent", expectedPosition: "any", requiredQrOrCode: false },
      ],
      autoSettlementRequiresIdentityConfidence: 1,
    },
    locationProtocol: {
      mode: "none",
      requiresLiveLocation: false,
      requiresCoPresence: false,
      locationPrivacy: "hidden",
    },
    timingProtocol: {
      startCondition: "Blocked until rewritten.",
      endCondition: "Blocked until rewritten.",
      deadline: "none",
      tieBreaker: "none",
      allowedAttempts: "0",
    },
    settlementProtocol: {
      mode: "blocked",
      winCondition: "No winner can be decided for a blocked challenge.",
      judgeInstructions: ["Do not judge or settle this challenge."],
      autoSettleConfidenceThreshold: 1,
      manualReviewTriggers: [safety.reason],
    },
    riskPolicy: {
      riskLevel: safety.category === "review" ? "high" : "blocked",
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
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 0,
    },
  };
}

function pickProvider(requested?: string, tierId: 1 | 2 | 3 = 1) {
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
  const provider = resolveTierProvider(tierId) ?? configuredProviders()[0];
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

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fallbackProtocolFromPrompt(
  inputText: string,
  language: ProtocolSpecV2["language"],
  parsed?: unknown,
) {
  const protocol = protocolSpecFromChallengeSpec(generateChallengeSpec(inputText), inputText, { language });
  const record = objectRecord(parsed);
  const evidence = objectRecord(record?.evidenceProtocol);
  const settlement = objectRecord(record?.settlementProtocol);
  const risk = objectRecord(record?.riskPolicy);

  return finalizeCompiledProtocol({
    ...protocol,
    title: safeString(record?.title) ?? protocol.title,
    userFacingSummary: safeString(record?.userFacingSummary) ?? protocol.userFacingSummary,
    evidenceProtocol: {
      ...protocol.evidenceProtocol,
      requiredEvidence: Array.isArray(evidence?.requiredEvidence) && evidence.requiredEvidence.length
        ? evidence.requiredEvidence.map(String).filter(Boolean)
        : protocol.evidenceProtocol.requiredEvidence,
      captureInstructions: Array.isArray(evidence?.captureInstructions) && evidence.captureInstructions.length
        ? evidence.captureInstructions.map(String).filter(Boolean)
        : protocol.evidenceProtocol.captureInstructions,
    },
    settlementProtocol: {
      ...protocol.settlementProtocol,
      winCondition: safeString(settlement?.winCondition) ?? protocol.settlementProtocol.winCondition,
      judgeInstructions: Array.isArray(settlement?.judgeInstructions) && settlement.judgeInstructions.length
        ? settlement.judgeInstructions.map(String).filter(Boolean)
        : protocol.settlementProtocol.judgeInstructions,
    },
    riskPolicy: {
      ...protocol.riskPolicy,
      warnings: Array.isArray(risk?.warnings) && risk.warnings.length
        ? risk.warnings.map(String).filter(Boolean)
        : protocol.riskPolicy.warnings,
    },
  });
}

function isVisionEvidenceMode(mode: ProtocolSpecV2["evidenceProtocol"]["mode"]) {
  return mode === "same_camera_video" ||
    mode === "separate_video" ||
    mode === "live_host_video" ||
    mode === "photo";
}

function hasExplicitCounterparty(rawPrompt: string) {
  const text = rawPrompt.toLowerCase();
  if (/\b(vs\.?|versus|against|opponent|rival|challenger)\b/.test(text)) return true;
  if (/\b(who|whose|which of us)\b.*\b(faster|more|most|longer|better|wins?|winner)\b/.test(text)) return true;
  if (/\b(faster|more|most|longer|better)\s+than\b/.test(text)) return true;
  if (/\b(beat|outlast|defeat)\s+(?!my\b|the\b|this\b|that\b|a\b|an\b)/.test(text)) return true;
  if (/\bi\s+bet\s+(?!my\b|our\b|i\b|we\b|the\b|this\b|that\b|a\b|an\b)[a-z][\w-]*\s+(?:my|our|the|this|that|his|her|their)\b/.test(text)) return true;
  if (/(跟|和|对战|挑战).{0,12}(朋友|对手|别人|他|她|jer|jerry|alex)/i.test(rawPrompt)) return true;
  if (/(谁|哪一方|哪个).{0,12}(更|先|赢|多|快|久)/.test(rawPrompt)) return true;
  return false;
}

function _looksLikeSoloClaim(rawPrompt: string) {
  const text = rawPrompt.toLowerCase();
  if (hasExplicitCounterparty(rawPrompt)) return false;
  if (/\b(i|we|my|our)\b.{0,80}\b(can|will|finish|complete|do|hold|eat|make|solve|run|arrive|stay|last)\b/.test(text)) return true;
  if (/\b(my|our)\s+(cat|dog|pet|kid|robot|team|car|bike)\b/.test(text)) return true;
  if (/(我|我的|我们|我们的).{0,30}(能|可以|会|完成|吃完|做到|坚持|到达|跑完)/.test(rawPrompt)) return true;
  return false;
}

type ParticipantMode = ProtocolSpecV2["participantMode"];

function promptRequestedParticipantCount(rawPrompt: string): number | null {
  const patterns = [
    /\b([0-9][0-9,]{0,8})\s*(?:people|persons|participants|players|users|competitors)\b/i,
    /([0-9][0-9,]{0,8})\s*(?:\u4e2a\u4eba|\u4eba|\u540d|\u4f4d|\u53c2\u4e0e\u8005|\u73a9\u5bb6|\u7528\u6237)/,
  ];
  for (const pattern of patterns) {
    const raw = rawPrompt.match(pattern)?.[1];
    if (!raw) continue;
    const parsed = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const text = rawPrompt.toLowerCase();
  if (/\b(thousand|thousands)\b|\u51e0\u5343|\u4e0a\u5343/.test(text)) return 1000;
  if (/\b(hundred|hundreds)\b|\u51e0\u767e|\u4e0a\u767e/.test(text)) return 100;
  return null;
}

function promptWantsPublicMarket(rawPrompt: string) {
  const text = rawPrompt.toLowerCase();
  return /\b(prediction market|public market|open market|market for|anyone can bet|everyone can bet|public betting pool)\b/.test(text) ||
    /(\u9884\u6d4b\u5e02\u573a|\u516c\u5f00\u5e02\u573a|\u516c\u5f00\u4e0b\u6ce8|\u6240\u6709\u4eba.{0,8}\u4e0b\u6ce8|\u5927\u5bb6.{0,8}\u4e0b\u6ce8)/.test(rawPrompt);
}

function promptWantsMassCrowd(rawPrompt: string) {
  const count = promptRequestedParticipantCount(rawPrompt);
  const text = rawPrompt.toLowerCase();
  return Boolean(count && count >= 50) ||
    /\b(mass|crowd|large event|leaderboard|tournament|thousands of|hundreds of)\b/.test(text) ||
    /(\u5927\u578b|\u5927\u89c4\u6a21|\u6392\u884c\u699c|\u6bd4\u8d5b|\u9526\u6807\u8d5b|\u51e0\u767e\u4eba|\u51e0\u5343\u4eba|\u4e0a\u5343\u4eba)/.test(rawPrompt);
}

function promptWantsSmallGroup(rawPrompt: string) {
  const count = promptRequestedParticipantCount(rawPrompt);
  const text = rawPrompt.toLowerCase();
  if (count && count >= 3 && count < 50) return true;
  return /\b(group|party|friends|classmates|coworkers|nearby people|people nearby|everyone here|all of us|ktv)\b/.test(text) ||
    /(\u591a\u4eba|\u4e00\u7fa4|\u51e0\u4e2a\u4eba|\u670b\u53cb\u4eec|\u5927\u5bb6|\u65c1\u8fb9\u7684\u4eba|\u9644\u8fd1\u7684\u4eba|\u8def\u4eba|\u6211\u4eec\u51e0\u4e2a|KTV)/i.test(rawPrompt);
}

function promptHasCounterparty(rawPrompt: string) {
  const text = rawPrompt.toLowerCase();
  if (/\b(vs\.?|versus|against|opponent|rival|challenger)\b/.test(text)) return true;
  if (/\b(challenge|battle|compete with|compete against)\s+(?!my\b|our\b|the\b|this\b|that\b|a\b|an\b|someone\b|anyone\b)[a-z][\w-]*\b/.test(text)) return true;
  if (/\b(who|whose|which of us)\b.*\b(faster|more|most|longer|better|wins?|winner)\b/.test(text)) return true;
  if (/\b(faster|more|most|longer|better)\s+than\b/.test(text)) return true;
  if (/\b(beat|outlast|defeat)\s+(?!my\b|our\b|the\b|this\b|that\b|a\b|an\b)/.test(text)) return true;
  if (/\bi\s+bet\s+(?!my\b|our\b|i\b|we\b|the\b|this\b|that\b|a\b|an\b)[a-z][\w-]*\s+(?:my|our|the|this|that|his|her|their)\b/.test(text)) return true;
  if (/(\u8ddf|\u548c|\u4e0e|\u5bf9\u6218|\u6311\u6218).{0,18}(\u670b\u53cb|\u5bf9\u624b|\u522b\u4eba|\u4ed6|\u5979|jer|jerry|alex)/i.test(rawPrompt)) return true;
  if (/(\u8c01|\u54ea\u4e00\u65b9|\u54ea\u4e2a).{0,18}(\u66f4|\u5148|\u8d62|\u591a|\u5feb|\u4e45)/.test(rawPrompt)) return true;
  return false;
}

function promptLooksLikeSoloClaim(rawPrompt: string) {
  const text = rawPrompt.toLowerCase();
  if (promptHasCounterparty(rawPrompt) || promptWantsSmallGroup(rawPrompt) || promptWantsMassCrowd(rawPrompt)) return false;
  if (/\b(self|solo|personal|alone|by myself|for myself)\b/.test(text) || /(\u81ea\u5df1|\u4e2a\u4eba|\u5355\u4eba|\u500b\u4eba|\u55ae\u4eba|\u6253\u5361)/.test(rawPrompt)) return true;
  if (/\b(i|we|my|our)\b.{0,80}\b(can|will|finish|complete|do|hold|eat|make|solve|run|arrive|stay|last)\b/.test(text)) return true;
  if (/\b(my|our)\s+(cat|dog|pet|kid|robot|team|car|bike)\b/.test(text)) return true;
  if (/(\u6211|\u6211\u7684|\u6211\u4eec|\u6211\u4eec\u7684).{0,30}(\u80fd|\u53ef\u4ee5|\u4f1a|\u5b8c\u6210|\u5403\u5b8c|\u505a\u5230|\u575a\u6301|\u5230\u8fbe|\u8dd1\u5b8c)/.test(rawPrompt)) return true;
  return false;
}

export function inferParticipantModeFromPrompt(rawPrompt: string, currentMode?: ParticipantMode): ParticipantMode {
  if (promptWantsPublicMarket(rawPrompt)) return "public_market";
  if (promptWantsMassCrowd(rawPrompt)) return "mass_crowd";
  if (promptWantsSmallGroup(rawPrompt)) return "small_group";
  if (promptLooksLikeSoloClaim(rawPrompt)) return "solo";
  if (promptHasCounterparty(rawPrompt)) return "head_to_head";
  return currentMode ?? "head_to_head";
}

function looksLikeRandomChallengePrompt(rawPrompt: string) {
  const text = rawPrompt.toLowerCase();
  if (/\b(give|generate|create|make|pick|suggest)\s+(me\s+)?(a\s+)?(random|safe|fun|any)?\s*challenge\b/.test(text)) return true;
  if (/\b(random|any|surprise)\s+challenge\b/.test(text)) return true;
  return /[\u968f\u4fbf\u968f\u673a].{0,20}[\u6311\u6218]/.test(rawPrompt) ||
    /[\u6765\u751f\u6210].{0,12}[\u4e00\u4e2a].{0,12}[\u6311\u6218]/.test(rawPrompt);
}

function looksLikeGenericProtocolTitle(title: string) {
  const text = title.trim().toLowerCase();
  if (!text) return true;
  if (/^(challenge|ai challenge|challenge protocol|protocol example|challenge protocol example|generated challenge)$/i.test(text)) return true;
  return /[\u6311\u6218]\s*[\u534f\u8bae]/.test(title) ||
    /[\u793a\u4f8b\u6837\u4f8b\u6a21\u677f]/.test(title);
}

function concreteRandomProtocol(rawPrompt: string, language: ProtocolSpecV2["language"]) {
  const seedPrompt = language === "zh"
    ? "生成一个安全的双人平板支撑挑战，需要连续视频证据。"
    : "Create a safe two-person plank hold challenge with continuous video evidence.";
  const protocol = protocolSpecFromChallengeSpec(generateChallengeSpec(seedPrompt), rawPrompt, { language });
  return finalizeCompiledProtocol({
    ...protocol,
    rawPrompt,
    language,
    userFacingSummary: language === "zh"
      ? "两个人分别录制连续视频，比谁能保持标准平板支撑更久。AI 只在视频清晰、身份和动作都可信时推荐赢家。"
      : "Two people record continuous video and compete on who can hold a valid plank longer. AI recommends a winner only when video, identity, and form are clear.",
  });
}

function normalizeCompiledProtocol(protocol: ProtocolSpecV2): ProtocolSpecV2 {
  const participantMode = inferParticipantModeFromPrompt(protocol.rawPrompt, protocol.participantMode);
  const evidenceMode =
    participantMode === "solo" && protocol.evidenceProtocol.mode === "same_camera_video"
      ? "separate_video"
      : protocol.evidenceProtocol.mode;
  const visionEvidence = isVisionEvidenceMode(evidenceMode);
  const oracleEvidence = evidenceMode === "gps" ||
    evidenceMode === "public_oracle" ||
    evidenceMode === "platform_metric";
  const sameCamera = evidenceMode === "same_camera_video";
  const riskBlocked = !protocol.riskPolicy.allowed || protocol.riskPolicy.riskLevel === "blocked";
  const desiredSettlementMode: ProtocolSpecV2["settlementProtocol"]["mode"] =
    riskBlocked ? "blocked" :
      participantMode === "mass_crowd" ? "leaderboard" :
        visionEvidence ? "auto_ai_vision" :
          oracleEvidence ? "auto_oracle" :
            protocol.settlementProtocol.mode;
  const threshold = Math.max(0.85, Math.min(1, protocol.settlementProtocol.autoSettleConfidenceThreshold || 0.85));
  const identityThreshold = Math.max(0.85, Math.min(1, protocol.identityProtocol.autoSettlementRequiresIdentityConfidence || 0.85));
  const requiredMetadata = new Set(protocol.evidenceProtocol.requiredMetadata);
  if (visionEvidence) {
    requiredMetadata.add("created_at");
    requiredMetadata.add("duration");
    requiredMetadata.add("file_hash");
    requiredMetadata.add("device_timestamp");
  }
  const manualReviewTriggers = new Set(protocol.settlementProtocol.manualReviewTriggers.filter(Boolean));
  manualReviewTriggers.add("Identity confidence below threshold.");
  manualReviewTriggers.add("Evidence quality is unclear, insufficient, invalid, edited, or too short.");
  if (visionEvidence) {
    manualReviewTriggers.add("Full body, liveness phrase, or continuous attempt cannot be verified.");
  }

  const participantBindings = protocol.identityProtocol.participantBindings
    .filter((binding) => participantMode !== "solo" || binding.role !== "opponent")
    .map((binding) => ({
      ...binding,
      expectedPosition: sameCamera
        ? binding.role === "creator" ? "left" : binding.role === "opponent" ? "right" : binding.expectedPosition ?? "any"
        : "any",
      requiredQrOrCode: binding.requiredQrOrCode || visionEvidence,
    }));
  if (!participantBindings.some((binding) => binding.role === "creator")) {
    participantBindings.unshift({
      role: "creator",
      label: "Creator",
      expectedPosition: "any",
      requiredQrOrCode: visionEvidence,
    });
  }
  if (participantMode === "head_to_head" && !participantBindings.some((binding) => binding.role === "opponent")) {
    participantBindings.push({
      role: "opponent",
      label: "Opponent",
      expectedPosition: sameCamera ? "right" : "any",
      requiredQrOrCode: visionEvidence,
    });
  }
  if (
    (participantMode === "small_group" || participantMode === "team_vs_team" || participantMode === "mass_crowd" || participantMode === "public_market") &&
    !participantBindings.some((binding) => binding.role === "participant")
  ) {
    participantBindings.push({
      role: "participant",
      label: participantMode === "public_market" ? "Market participant" : "Participant",
      expectedPosition: "any",
      requiredQrOrCode: visionEvidence,
    });
  }
  const rawDeadline = protocol.timingProtocol.deadline?.trim() || "48 hours";
  const parsedDeadline = parseChallengeDeadline(rawDeadline, { fallbackHours: 48 });
  const rawAbsoluteDeadline = new Date(rawDeadline);
  const normalizedDeadline =
    Number.isFinite(rawAbsoluteDeadline.getTime()) || /^(none|no deadline|open|open ended|open-ended|n\/a|null)$/i.test(rawDeadline)
      ? parsedDeadline?.toISOString() ?? "48 hours"
      : rawDeadline;
  const endCondition = stripDeadlineArtifacts(protocol.timingProtocol.endCondition) || "When the attempt ends.";

  return {
    ...protocol,
    participantMode,
    timingProtocol: {
      ...protocol.timingProtocol,
      endCondition,
      deadline: normalizedDeadline,
    },
    identityProtocol: {
      ...protocol.identityProtocol,
      required: protocol.identityProtocol.required || visionEvidence,
      mode: sameCamera ? "left_right_assignment" : visionEvidence && (protocol.identityProtocol.mode === "account_only" || participantMode === "solo")
        ? "liveness_phrase"
        : protocol.identityProtocol.mode,
      autoSettlementRequiresIdentityConfidence: identityThreshold,
      participantBindings,
    },
    evidenceProtocol: {
      ...protocol.evidenceProtocol,
      mode: evidenceMode,
      requiredMetadata: [...requiredMetadata],
    },
    settlementProtocol: {
      ...protocol.settlementProtocol,
      mode: desiredSettlementMode,
      autoSettleConfidenceThreshold: threshold,
      manualReviewTriggers: [...manualReviewTriggers],
    },
    aiBudgetPolicy: {
      ...protocol.aiBudgetPolicy,
      estimatedCostTier: visionEvidence ? "medium" : protocol.aiBudgetPolicy.estimatedCostTier,
      maxVisionFrames: visionEvidence
        ? Math.min(18, Math.max(8, protocol.aiBudgetPolicy.maxVisionFrames || 12))
        : 0,
    },
  };
}

function finalizeCompiledProtocol(protocol: ProtocolSpecV2): ProtocolSpecV2 {
  return applyDataSourceGateToProtocol(normalizeCompiledProtocol(protocol));
}

function repairRandomProtocolIfGeneric(protocol: ProtocolSpecV2, language: ProtocolSpecV2["language"]) {
  if (!looksLikeRandomChallengePrompt(protocol.rawPrompt) || !looksLikeGenericProtocolTitle(protocol.title)) {
    return { protocol, repaired: false };
  }
  return {
    protocol: concreteRandomProtocol(protocol.rawPrompt, language),
    repaired: true,
  };
}

function compileSystemPrompt() {
  const nowIso = new Date().toISOString();
  return `You are Axelrod, an AI challenge protocol compiler.

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
- Current server time is ${nowIso}. Never use placeholder or past absolute dates such as 2023-12-31. If the user does not give a real future date, use a relative deadline like "24 hours" or "48 hours".
- If the user asks for a random challenge, invent one concrete safe challenge.
- Choose participantMode from intent, not from a default template:
  - solo: creator proves a claim about themself, their pet, their object, their habit, or a pass/fail task; no opponent invite is required.
  - head_to_head: exactly two sides or one named counterparty such as "Jerry", "my friend", "vs", "against", or "who is faster".
  - small_group: nearby people, friends, KTV/party/class/group prompts, or 3-49 participants.
  - mass_crowd: leaderboard/tournament/event prompts, hundreds/thousands of people, or 50+ participants.
  - public_market: an explicitly open prediction market where many people can take sides.
- Distinguish the counterparty from the evidence subject. "I bet my cat can finish the food under one minute" is a solo threshold/completion claim: the cat is the subject, not an opponent. Use participantMode="solo" unless the user names a counterparty ("I bet Jerry that my cat..."), compares two participants ("my cat vs Jerry's cat"), or asks nearby/public users to join.
- For solo claims, do not add an opponent participant binding. Use creator-only identity, evidence from the creator, and a pass/fail outcome. Do not make the user invite someone just to prove their own/pet's action.
- If the user bets another person that a solo subject will or will not satisfy a claim, use participantMode="head_to_head": the other person is the counterparty, not the subject in the video.
- If the idea is unsafe, illegal, coercive, alcohol/drug based, violent, non-consensual, stalking-like, or chance-based real-money gambling, set riskPolicy.allowed=false and settlementProtocol.mode="blocked"; include a safeAlternative when possible.
- Same-camera physical challenges require identityProtocol.required=true, identityProtocol.mode="left_right_assignment", creator left, opponent right, liveness/QR code required, and no auto-settlement unless identity is verified.
- Nearby or walk-by challenges should use locationProtocol.mode="nearby_discovery" or "walk_to_join", approximate public privacy, and a conservative radius.
- Mass crowd challenges should use participantMode="mass_crowd" and settlementProtocol.mode="leaderboard"; they should not look like a normal 1v1 challenge.
- Crypto price challenges must be public-oracle protocols: lock the selected CoinGecko asset id, target USD price, condition, settlement time, setup-time price snapshot, and use settlementProtocol.mode="auto_oracle".
- Weather rain/temperature challenges must be public-oracle protocols: lock Open-Meteo location latitude/longitude, date, metric, target, condition, setup-time weather snapshot, and use settlementProtocol.mode="auto_oracle".
- For any external/public data-source challenge, include machine-readable judge instructions when possible:
  DATA_SOURCE_KEY: <registered source key>
  DATA_SOURCE_PARAMS: {"required_field":"locked value"}
  If a required adapter field is unknown, list it in evidenceProtocol.requiredMetadata and manualReviewTriggers instead of inventing it.
- Auto-settle requires protocol, identity, evidence, outcome, risk, and confidence gates. Default confidence threshold is 0.85.
- Payment policy is supplied in Context.paymentPolicy. If cashStakeAllowed is not true, do not propose real-money stakes, cash payouts, USDC/ETH stakes, or Stripe-funded wager balances; use internal credits/points only and explain the jurisdiction restriction in riskPolicy.restrictions when the user asked for cash.
- If cashStakeAllowed is true, you may describe the challenge as cash-compatible, but still require protocol/evidence/identity/risk gates and do not bypass manual review triggers for high stakes.`;
}

export async function compileProtocolForUser(input: {
  userId: string;
  inputText: string;
  providerId?: string;
  model?: string;
  language?: ProtocolSpecV2["language"];
  context?: Record<string, unknown>;
  tierId?: 1 | 2 | 3;
  route?: string;
}) {
  const inputText = input.inputText.trim();
  const language = input.language ?? "auto";
  const tierId = input.tierId ?? 1;
  if (!inputText) throw new CompileRequestError("inputText is required", 400);
  if (inputText.length > 2000) {
    throw new CompileRequestError("Challenge prompt is too long. Keep it under 2000 characters.", 400);
  }

  const safety = evaluateRuleSafety(inputText);
  if (!safety.allowed) {
    const protocol = blockedProtocol(inputText, language, safety);
    console.warn("[compile-protocol] blocked by safety prefilter", {
      userId: input.userId,
      flags: safety.flags,
      reason: safety.reason,
    });
    return {
      rawPrompt: inputText,
      protocol,
      preview: protocolPreview(protocol),
      source: "safety_prefilter" as const,
      providerId: "safety_prefilter",
      model: "rule-safety",
      externalApiCharged: false,
      providerCall: null,
      dailyQuota: await getDailyAiQuotaStatus(input.userId),
    };
  }

  const deterministicOracleProtocol = await cryptoPriceProtocolFromPrompt(inputText, language);
  if (deterministicOracleProtocol) {
    console.log("[compile-protocol] deterministic crypto oracle protocol", {
      userId: input.userId,
      title: deterministicOracleProtocol.title,
    });
    return {
      rawPrompt: inputText,
      protocol: deterministicOracleProtocol,
      preview: protocolPreview(deterministicOracleProtocol),
      source: "deterministic_oracle" as const,
      providerId: "deterministic_oracle",
      model: "crypto-price-v1",
      externalApiCharged: false,
      providerCall: null,
      dailyQuota: await getDailyAiQuotaStatus(input.userId),
    };
  }

  const deterministicWeatherProtocol = await weatherProtocolFromPrompt(inputText, language);
  if (deterministicWeatherProtocol) {
    console.log("[compile-protocol] deterministic weather oracle protocol", {
      userId: input.userId,
      title: deterministicWeatherProtocol.title,
    });
    return {
      rawPrompt: inputText,
      protocol: deterministicWeatherProtocol,
      preview: protocolPreview(deterministicWeatherProtocol),
      source: "deterministic_oracle" as const,
      providerId: "deterministic_oracle",
      model: "weather-open-meteo-v1",
      externalApiCharged: false,
      providerCall: null,
      dailyQuota: await getDailyAiQuotaStatus(input.userId),
    };
  }

  const quota = await spendDailyAiQuota(input.userId, "spec");
  if (!quota.ok) {
    throw new CompileRequestError(quota.error, 429);
  }

  try {
    const provider = pickProvider(input.providerId, tierId);
    const selectedModel = input.model || resolveTierModel(provider, tierId);
    console.log(`[compile-protocol] calling provider=${provider.id} model=${selectedModel} promptChars=${inputText.length}`);
    const completion = await completeOraclePromptWithMetadata({
      providerId: provider.id,
      model: selectedModel,
      system: compileSystemPrompt(),
      user: [
        `User prompt: ${inputText}`,
        `Language hint: ${language}`,
        input.context ? `Context: ${JSON.stringify(input.context)}` : null,
        "Compile the protocol. Return JSON only.",
      ].filter(Boolean).join("\n\n"),
      maxTokens: 2400,
      temperature: 0.15,
    });
    await logAiUsage({
      userId: input.userId,
      route: input.route ?? "/api/challenges/compile",
      metadata: completion.metadata,
      extra: { surface: input.context?.surface ?? null, rawPromptChars: inputText.length },
    });

    let parsed: unknown = null;
    let normalizedProtocol: ProtocolSpecV2 | null = null;
    let fallbackReason: string | null = null;
    try {
      parsed = extractJson(completion.text);
      const protocol = parseProtocolSpecV2({
        ...(objectRecord(parsed) ?? {}),
        version: "2.0",
        rawPrompt: inputText,
        language,
      });
      if (protocol) {
        const normalized = finalizeCompiledProtocol(protocol);
        const repaired = repairRandomProtocolIfGeneric(normalized, language);
        normalizedProtocol = repaired.protocol;
        if (repaired.repaired) {
          fallbackReason = "LLM returned a generic random-challenge title; repaired to a concrete playable protocol";
        }
      } else {
        fallbackReason = "LLM response did not match ProtocolSpecV2";
      }
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : "LLM did not return valid protocol JSON";
    }

    const repairedProtocol = normalizedProtocol ?? fallbackProtocolFromPrompt(inputText, language, parsed);
    if (fallbackReason) {
      console.warn("[compile-protocol] repaired malformed LLM protocol", {
        providerId: provider.id,
        model: selectedModel,
        reason: fallbackReason,
      });
    }

    return {
      rawPrompt: inputText,
      protocol: repairedProtocol,
      preview: protocolPreview(repairedProtocol),
      source: fallbackReason ? "fallback" as const : "llm" as const,
      providerId: provider.id,
      model: selectedModel,
      externalApiCharged: isPaidProvider(provider),
      providerCall: completion.metadata,
      fallbackReason: fallbackReason ?? undefined,
      dailyQuota: quota.status,
    };
  } catch (error) {
    await refundDailyAiQuota(input.userId, "spec").catch(() => null);
    throw error;
  }
}
