import prisma from "@/lib/db";
import {
  configuredProviders,
  getProviderById,
  isProviderConfigured,
  resolveTierModel,
  resolveTierProvider,
} from "@/lib/llm-providers";
import type { TierId } from "@/lib/model-tiers";

export type AiAccessTier = "free" | "premium" | "developer";

export interface AiAccessStatus {
  tier: AiAccessTier;
  label: "Free" | "Premium" | "Developer";
  isDeveloper: boolean;
  canUsePremiumModels: boolean;
  maxJudgeTier: TierId;
  reason: string;
  freeTextModel: { providerId: string; model: string } | null;
  freeVisionModel: { providerId: string; model: string } | null;
  upgradeRequiredMessage: string;
}

export interface ModelAccessDecision {
  ok: boolean;
  tierId: TierId;
  providerId: string;
  model: string;
  needsUpgrade: boolean;
  downgraded: boolean;
  reason: string | null;
  access: AiAccessStatus;
  status?: number;
}

const DEFAULT_DEV_IDENTITIES = ["kdys1205", "kdyz1205", "alexl"];

const FREE_TEXT_MODELS: Record<string, string[]> = {
  local_ollama: ["llama4:latest", "qwen3:latest", "llama3.3:latest", "llama3.2-vision:latest"],
  deepseek: ["deepseek-v4-flash"],
  moonshot: ["kimi-k2.5", "moonshot-v1-8k"],
  google: ["gemini-3.1-flash-lite"],
  openai: ["gpt-5.4-nano"],
  anthropic: ["claude-haiku-4-5-20251001"],
  groq: ["openai/gpt-oss-20b", "llama-3.1-8b-instant"],
  mistral: ["mistral-small-latest"],
  fireworks: ["accounts/fireworks/models/llama4-maverick-instruct-basic"],
};

const FREE_VISION_MODELS: Record<string, string[]> = {
  local_ollama: ["llama3.2-vision:latest"],
  google: ["gemini-3.1-flash-lite"],
  openai: ["gpt-5.4-nano"],
};

function splitEnvList(name: string) {
  return (process.env[name] ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function identityMatches(identity: string | null | undefined, candidates: string[]) {
  const normalized = String(identity ?? "").trim().toLowerCase();
  return Boolean(normalized && candidates.includes(normalized));
}

function accessLabel(tier: AiAccessTier): AiAccessStatus["label"] {
  if (tier === "developer") return "Developer";
  if (tier === "premium") return "Premium";
  return "Free";
}

function firstConfiguredFreeModel(needsVision: boolean, requestedProviderId?: string | null) {
  const modelMap = needsVision ? FREE_VISION_MODELS : FREE_TEXT_MODELS;
  const order = requestedProviderId
    ? [requestedProviderId, "local_ollama", "deepseek", "google", "groq", "moonshot", "openai", "anthropic", "mistral", "fireworks"]
    : needsVision
      ? ["local_ollama", "google", "openai"]
      : ["local_ollama", "deepseek", "groq", "moonshot", "google", "openai", "anthropic", "mistral", "fireworks"];

  for (const providerId of order) {
    const provider = getProviderById(providerId);
    const allowed = modelMap[providerId] ?? [];
    if (!provider || allowed.length === 0 || !isProviderConfigured(provider)) continue;
    const model = allowed.find((candidate) => provider.models.length === 0 || provider.models.includes(candidate)) ?? allowed[0];
    return { providerId, model };
  }
  return null;
}

function buildStatus(tier: AiAccessTier, reason: string): AiAccessStatus {
  const freeTextModel = firstConfiguredFreeModel(false);
  const freeVisionModel = firstConfiguredFreeModel(true);
  return {
    tier,
    label: accessLabel(tier),
    isDeveloper: tier === "developer",
    canUsePremiumModels: tier !== "free",
    maxJudgeTier: tier === "free" ? 1 : 3,
    reason,
    freeTextModel,
    freeVisionModel,
    upgradeRequiredMessage:
      "This challenge needs a Premium judge model. Free mode uses slower low-cost models and may ask for manual review instead of forcing a weak verdict.",
  };
}

export async function getAiAccessForUser(userId: string): Promise<AiAccessStatus> {
  if (process.env.AXELROD_FORCE_PREMIUM_ALL === "1") {
    return buildStatus("premium", "AXELROD_FORCE_PREMIUM_ALL enabled");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      username: true,
      totalCreditsBought: true,
    },
  });

  const devIdentities = [
    ...DEFAULT_DEV_IDENTITIES,
    ...splitEnvList("AXELROD_DEV_USERS"),
  ];
  const premiumIdentities = splitEnvList("AXELROD_PREMIUM_USERS");

  if (
    identityMatches(user?.email, devIdentities) ||
    identityMatches(user?.username, devIdentities)
  ) {
    return buildStatus("developer", "developer allowlist");
  }

  if (
    identityMatches(user?.email, premiumIdentities) ||
    identityMatches(user?.username, premiumIdentities)
  ) {
    return buildStatus("premium", "premium allowlist");
  }

  if ((user?.totalCreditsBought ?? 0) > 0) {
    return buildStatus("premium", "credits purchased");
  }

  return buildStatus("free", "free beta account");
}

function isFreeModelAllowed(providerId: string, model: string, needsVision: boolean) {
  const textAllowed = FREE_TEXT_MODELS[providerId] ?? [];
  const visionAllowed = FREE_VISION_MODELS[providerId] ?? [];
  const allowed = needsVision ? [...visionAllowed, ...textAllowed] : textAllowed;
  return providerId === "local_ollama" || allowed.includes(model);
}

function resolvePremiumModel(input: {
  requestedProviderId?: string | null;
  requestedModel?: string | null;
  requestedTierId?: TierId;
  needsVision?: boolean;
}) {
  const requestedProvider = input.requestedProviderId?.trim();
  const requestedModel = input.requestedModel?.trim();
  const requestedTierId = input.requestedTierId ?? 1;
  const provider =
    requestedProvider && getProviderById(requestedProvider)
      ? getProviderById(requestedProvider)
      : resolveTierProvider(requestedTierId, input.needsVision);
  const model = requestedModel || resolveTierModel(provider, requestedTierId, input.needsVision);
  return {
    providerId: provider?.id ?? configuredProviders()[0]?.id ?? "local_ollama",
    model,
  };
}

export function resolveModelForAiAccess(input: {
  access: AiAccessStatus;
  requestedProviderId?: string | null;
  requestedModel?: string | null;
  requestedTierId?: TierId;
  needsVision?: boolean;
  allowFreeDowngrade?: boolean;
}): ModelAccessDecision {
  const requestedTierId = input.requestedTierId ?? 1;
  const requestedProviderId = input.requestedProviderId?.trim() || null;
  const requestedModel = input.requestedModel?.trim() || null;
  const needsVision = input.needsVision === true;

  if (input.access.canUsePremiumModels) {
    const premium = resolvePremiumModel({
      requestedProviderId,
      requestedModel,
      requestedTierId,
      needsVision,
    });
    return {
      ok: true,
      tierId: requestedTierId,
      providerId: premium.providerId,
      model: premium.model,
      needsUpgrade: false,
      downgraded: false,
      reason: null,
      access: input.access,
    };
  }

  if (requestedTierId > 1) {
    const fallback = firstConfiguredFreeModel(needsVision);
    return {
      ok: false,
      tierId: 1,
      providerId: fallback?.providerId ?? requestedProviderId ?? "unconfigured",
      model: fallback?.model ?? requestedModel ?? "unconfigured-model",
      needsUpgrade: true,
      downgraded: false,
      reason: input.access.upgradeRequiredMessage,
      access: input.access,
      status: 402,
    };
  }

  const provider = requestedProviderId ? getProviderById(requestedProviderId) : null;
  if (requestedProviderId && !provider) {
    return {
      ok: false,
      tierId: 1,
      providerId: requestedProviderId,
      model: requestedModel ?? "unknown-model",
      needsUpgrade: false,
      downgraded: false,
      reason: `Unknown AI provider: ${requestedProviderId}`,
      access: input.access,
      status: 400,
    };
  }

  if (
    requestedProviderId &&
    requestedModel &&
    provider &&
    isProviderConfigured(provider) &&
    isFreeModelAllowed(requestedProviderId, requestedModel, needsVision)
  ) {
    return {
      ok: true,
      tierId: 1,
      providerId: requestedProviderId,
      model: requestedModel,
      needsUpgrade: false,
      downgraded: false,
      reason: null,
      access: input.access,
    };
  }

  const freeChoice = firstConfiguredFreeModel(needsVision, requestedProviderId);
  if (!freeChoice) {
    return {
      ok: false,
      tierId: 1,
      providerId: requestedProviderId ?? "unconfigured",
      model: requestedModel ?? "unconfigured-model",
      needsUpgrade: false,
      downgraded: false,
      reason: "No configured Free AI model is available. Connect DeepSeek flash, Google flash-lite, Groq, or Local Ollama.",
      access: input.access,
      status: 503,
    };
  }

  if (requestedModel && !input.allowFreeDowngrade) {
    return {
      ok: false,
      tierId: 1,
      providerId: requestedProviderId ?? freeChoice.providerId,
      model: requestedModel,
      needsUpgrade: true,
      downgraded: false,
      reason: input.access.upgradeRequiredMessage,
      access: input.access,
      status: 402,
    };
  }

  return {
    ok: true,
    tierId: 1,
    providerId: freeChoice.providerId,
    model: freeChoice.model,
    needsUpgrade: false,
    downgraded: Boolean(
      requestedProviderId &&
      (requestedProviderId !== freeChoice.providerId || (requestedModel && requestedModel !== freeChoice.model)),
    ),
    reason:
      requestedProviderId || requestedModel
        ? `Free account routed to ${freeChoice.providerId}/${freeChoice.model}.`
        : null,
    access: input.access,
  };
}

export function modelAccessResponse(decision: ModelAccessDecision) {
  return {
    tierId: decision.tierId,
    providerId: decision.providerId,
    model: decision.model,
    downgraded: decision.downgraded,
    needsUpgrade: decision.needsUpgrade,
    reason: decision.reason,
  };
}
