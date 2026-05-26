import { LLM_PROVIDERS, getProviderById } from "@/lib/llm-providers";
import type { EvidenceQuality, VerdictRecommendation } from "@/lib/judgment-policy";

export type RejudgeEscalationAction =
  | "none"
  | "retry_stronger_model"
  | "try_alternate_provider"
  | "manual_review";

export type RejudgeEscalationPlan = {
  agent: "rejudge_escalation";
  action: RejudgeEscalationAction;
  shouldRunRejudge: boolean;
  reason: string;
  nextProviderId: string | null;
  nextModel: string | null;
  attemptCount: number;
  maxAttempts: number;
  allowEscalation: boolean;
  requiresExplicitRequest: boolean;
  blockingIssues: string[];
  notes: string[];
};

export type RejudgeVerdictSnapshot = {
  status?: string | null;
  winnerId?: string | null;
  confidence?: number | null;
  evidenceQuality?: EvidenceQuality | null;
  recommendation?: VerdictRecommendation | null;
  source?: string | null;
  autoSettleEligible?: boolean | null;
  blockingIssues?: string[] | null;
};

export type RejudgeEscalationInput = {
  verdict: RejudgeVerdictSnapshot;
  currentProviderId: string | null;
  currentModel: string | null;
  needsVision: boolean;
  attemptCount: number;
  maxAttempts?: number;
  allowEscalation?: boolean;
  configuredProviderIds?: string[];
};

const DEFAULT_MAX_ATTEMPTS = 2;

const STRONGER_MODELS: Record<string, string[]> = {
  openai: ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"],
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"],
  google: ["gemini-3.1-flash-lite", "gemini-3-flash", "gemini-3.5-flash", "gemini-3.1-pro"],
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  moonshot: ["kimi-k2.5", "kimi-k2.6"],
  xai: ["grok-2-vision-latest", "grok-4.3"],
  local_ollama: ["llama3.3:latest", "qwen3:latest", "llama4:latest", "llama3.2-vision:latest"],
};

const VISION_PROVIDER_ORDER = ["openai", "google", "anthropic", "xai", "local_ollama"];
const TEXT_PROVIDER_ORDER = ["openai", "anthropic", "google", "deepseek", "moonshot", "groq", "local_ollama"];

function normalizedIssues(issues: string[] | null | undefined) {
  return [...new Set((issues ?? []).filter((issue) => issue.trim()).map((issue) => issue.trim()))];
}

function configuredSet(ids: string[] | undefined) {
  if (!ids) return new Set(LLM_PROVIDERS.map((provider) => provider.id));
  return new Set(ids.filter((id) => Boolean(getProviderById(id))));
}

function isSameModel(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function strongerModelFor(providerId: string | null, model: string | null, needsVision: boolean) {
  if (!providerId) return null;
  const current = model?.trim() || getProviderById(providerId)?.defaultModel || "";
  const ordered = STRONGER_MODELS[providerId] ?? getProviderById(providerId)?.models ?? [];
  if (!ordered.length) return null;

  if (providerId === "openai" && /mini|nano|fast/i.test(current) && !isSameModel(current, "gpt-5.5")) {
    return "gpt-5.5";
  }

  const currentIndex = ordered.findIndex((candidate) => isSameModel(candidate, current));
  if (currentIndex >= 0) {
    const next = ordered.slice(currentIndex + 1).find((candidate) =>
      needsVision ? supportsVisionCandidate(providerId, candidate) : true,
    );
    return next && !isSameModel(next, current) ? next : null;
  }

  const directMiniUpgrade =
    providerId === "openai" && /mini|nano|fast/i.test(current) ? "gpt-5.5" :
    providerId === "anthropic" && /haiku|sonnet/i.test(current) ? "claude-opus-4-7" :
    providerId === "google" && /flash/i.test(current) ? "gemini-3.1-pro" :
    providerId === "deepseek" && /flash/i.test(current) ? "deepseek-v4-pro" :
    providerId === "moonshot" && /k2\.5|0711|preview/i.test(current) ? "kimi-k2.6" :
    null;
  if (directMiniUpgrade && !isSameModel(directMiniUpgrade, current)) return directMiniUpgrade;

  const fallback = ordered.find((candidate) => needsVision ? supportsVisionCandidate(providerId, candidate) : true);
  return fallback && !isSameModel(fallback, current) ? fallback : null;
}

function supportsVisionCandidate(providerId: string, model: string) {
  if (providerId === "openai") return /gpt-5|gpt-4o|o4/i.test(model);
  if (providerId === "google") return /gemini/i.test(model);
  if (providerId === "anthropic") return /claude/i.test(model);
  if (providerId === "xai") return /vision|grok-2|grok-4/i.test(model);
  if (providerId === "local_ollama") return /vision|llama4/i.test(model);
  return false;
}

function alternateProvider(
  currentProviderId: string | null,
  needsVision: boolean,
  configuredProviderIds: Set<string>,
) {
  const order = needsVision ? VISION_PROVIDER_ORDER : TEXT_PROVIDER_ORDER;
  return order.find((providerId) => providerId !== currentProviderId && configuredProviderIds.has(providerId)) ?? null;
}

function hardIssueReason(verdict: RejudgeVerdictSnapshot, issues: string[]) {
  if (verdict.autoSettleEligible === true) return null;
  if (verdict.recommendation === "invalid_evidence") return "invalid_evidence";
  const text = issues.join("\n").toLowerCase();
  if (
    /protocolspecv2 is missing|risk policy|settlement mode is .*not an automatic|participant is missing|identity binding is missing|has no liveness code|identity is not verified|observed position .* expected|evidence is missing|evidence check decision is (?:failed|invalid|rejected|blocked)|video does not cover|video is too short|full body is not visible|appears edited|static, or looped|does not show the required action|public oracle.*did not come|no runtime data-source adapter/.test(text)
  ) {
    return "hard_protocol_identity_or_evidence_failure";
  }
  if (verdict.evidenceQuality === "invalid" || verdict.evidenceQuality === "insufficient") {
    return "evidence_quality_not_recoverable_by_rejudge";
  }
  if (verdict.recommendation === "tie_or_no_winner") return "tie_or_no_winner";
  return null;
}

function modelFailure(verdict: RejudgeVerdictSnapshot, issues: string[]) {
  if (verdict.source === "fallback") return true;
  const text = issues.join("\n").toLowerCase();
  return /malformed json|provider call failed|llm judge call failed|no usable model verdict|returned no json|unable to evaluate/.test(text);
}

function shouldConsiderRejudge(verdict: RejudgeVerdictSnapshot, issues: string[]) {
  if (verdict.autoSettleEligible === true) return false;
  if (modelFailure(verdict, issues)) return true;
  const confidence = typeof verdict.confidence === "number" && Number.isFinite(verdict.confidence)
    ? verdict.confidence
    : null;
  if (confidence !== null && confidence >= 0.6 && confidence < 0.85) return true;
  if (verdict.winnerId && verdict.recommendation === "needs_review" && verdict.evidenceQuality === "unclear") return true;
  return false;
}

function plan(
  input: RejudgeEscalationInput,
  action: RejudgeEscalationAction,
  reason: string,
  nextProviderId: string | null,
  nextModel: string | null,
  notes: string[] = [],
): RejudgeEscalationPlan {
  const shouldRunRejudge = action === "retry_stronger_model" || action === "try_alternate_provider";
  return {
    agent: "rejudge_escalation",
    action,
    shouldRunRejudge,
    reason,
    nextProviderId,
    nextModel,
    attemptCount: input.attemptCount,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    allowEscalation: input.allowEscalation !== false,
    requiresExplicitRequest: shouldRunRejudge,
    blockingIssues: normalizedIssues(input.verdict.blockingIssues),
    notes,
  };
}

export function planRejudgeEscalation(input: RejudgeEscalationInput): RejudgeEscalationPlan {
  const issues = normalizedIssues(input.verdict.blockingIssues);
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const withDefaults = { ...input, maxAttempts };

  if (input.verdict.autoSettleEligible === true) {
    return plan(withDefaults, "none", "verdict_already_eligible_for_settlement", null, null);
  }
  if (input.allowEscalation === false) {
    return plan(withDefaults, "manual_review", "protocol_disallows_ai_escalation", null, null);
  }
  if (input.attemptCount >= maxAttempts) {
    return plan(withDefaults, "manual_review", "max_rejudge_attempts_reached", null, null);
  }

  const hardReason = hardIssueReason(input.verdict, issues);
  if (hardReason && !modelFailure(input.verdict, issues)) {
    return plan(withDefaults, "manual_review", hardReason, null, null);
  }
  if (!shouldConsiderRejudge(input.verdict, issues)) {
    return plan(withDefaults, "manual_review", "verdict_needs_human_review_not_model_retry", null, null);
  }

  const currentProviderId = input.currentProviderId && getProviderById(input.currentProviderId)
    ? input.currentProviderId
    : null;
  const configuredProviderIds = configuredSet(input.configuredProviderIds);
  const stronger = strongerModelFor(currentProviderId, input.currentModel, input.needsVision);
  if (currentProviderId && configuredProviderIds.has(currentProviderId) && stronger) {
    return plan(
      withDefaults,
      "retry_stronger_model",
      modelFailure(input.verdict, issues) ? "previous_model_failed" : "confidence_or_quality_below_threshold",
      currentProviderId,
      stronger,
      [`previousProvider=${currentProviderId}`, `previousModel=${input.currentModel ?? "unknown"}`],
    );
  }

  const alternate = alternateProvider(currentProviderId, input.needsVision, configuredProviderIds);
  if (alternate) {
    const provider = getProviderById(alternate);
    const alternateModel = strongerModelFor(alternate, provider?.defaultModel ?? null, input.needsVision) ?? provider?.defaultModel ?? null;
    return plan(
      withDefaults,
      "try_alternate_provider",
      modelFailure(input.verdict, issues) ? "previous_provider_failed" : "no_stronger_model_available_on_current_provider",
      alternate,
      alternateModel,
      currentProviderId ? [`previousProvider=${currentProviderId}`] : [],
    );
  }

  return plan(withDefaults, "manual_review", "no_configured_escalation_provider_available", null, null);
}
