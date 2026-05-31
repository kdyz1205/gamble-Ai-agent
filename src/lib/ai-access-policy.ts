import prisma from "@/lib/db";
import {
  configuredProviders,
  getProviderById,
  isProviderConfigured,
  resolveTierModel,
  resolveTierProvider,
} from "@/lib/llm-providers";
import type { TierId } from "@/lib/model-tiers";

export type AiAccessPlan = "free" | "premium";
export type AiAccessRole = "user" | "developer" | "admin";
export type AiAccessTier = AiAccessPlan;
export type AiQuotaTier = AiAccessPlan | "developer";

export interface AiAccessInternalFlags {
  developerOverride: boolean;
  premiumOverride: boolean;
  forcePremiumAll: boolean;
  creditsPurchased: boolean;
  stripeSubscription: boolean;
}

export interface AiAccessStatus {
  plan: AiAccessPlan;
  /** Backwards-compatible alias. User-facing code must use plan. */
  tier: AiAccessPlan;
  label: "Free" | "Premium";
  isPremium: boolean;
  role: AiAccessRole;
  internalFlags: AiAccessInternalFlags;
  allowedModelTier: AiAccessPlan;
  isDeveloper: boolean;
  canUsePremiumModels: boolean;
  maxJudgeTier: TierId;
  reason: string;
  freeTextModel: { providerId: string; model: string } | null;
  freeVisionModel: { providerId: string; model: string } | null;
  premiumTextModel: { providerId: string; model: string } | null;
  premiumVisionModel: { providerId: string; model: string } | null;
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
  moonshot: ["kimi-k2.5"],
  google: ["gemini-2.5-flash", "gemini-2.0-flash"],
};

const FREE_VISION_MODELS: Record<string, string[]> = {
  local_ollama: ["llama3.2-vision:latest"],
  google: ["gemini-2.5-flash", "gemini-2.0-flash"],
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

function accessLabel(plan: AiAccessPlan): AiAccessStatus["label"] {
  return plan === "premium" ? "Premium" : "Free";
}

function firstConfiguredFreeModel(needsVision: boolean, requestedProviderId?: string | null) {
  const modelMap = needsVision ? FREE_VISION_MODELS : FREE_TEXT_MODELS;
  const order = requestedProviderId
    ? [requestedProviderId, "local_ollama", "deepseek", "moonshot", "google"]
    : needsVision
      ? ["local_ollama", "google"]
      : ["local_ollama", "deepseek", "moonshot", "google"];

  for (const providerId of order) {
    const provider = getProviderById(providerId);
    const allowed = modelMap[providerId] ?? [];
    if (!provider || allowed.length === 0 || !isProviderConfigured(provider)) continue;
    const model = allowed.find((candidate) => provider.models.length === 0 || provider.models.includes(candidate)) ?? allowed[0];
    return { providerId, model };
  }
  return null;
}

function firstConfiguredPremiumModel(needsVision: boolean, requestedProviderId?: string | null) {
  const order = requestedProviderId
    ? [requestedProviderId, process.env.ORACLE_DEFAULT_PROVIDER, "deepseek", "openai", "anthropic", "google", "xai", "groq", "moonshot", "mistral", "together", "fireworks"]
    : needsVision
      ? [process.env.ORACLE_DEFAULT_PROVIDER, "openai", "google", "xai", "anthropic", "deepseek"]
      : [process.env.ORACLE_DEFAULT_PROVIDER, "deepseek", "openai", "anthropic", "xai", "google", "groq", "moonshot", "mistral", "together", "fireworks"];

  for (const maybeProviderId of order) {
    const providerId = maybeProviderId?.trim();
    if (!providerId) continue;
    const provider = getProviderById(providerId);
    if (!provider || !isProviderConfigured(provider)) continue;
    return {
      providerId,
      model: resolveTierModel(provider, 3, needsVision),
    };
  }
  return null;
}

function buildStatus(input: {
  plan: AiAccessPlan;
  reason: string;
  role?: AiAccessRole;
  internalFlags?: Partial<AiAccessInternalFlags>;
}): AiAccessStatus {
  const plan = input.plan;
  const role = input.role ?? "user";
  const internalFlags: AiAccessInternalFlags = {
    developerOverride: false,
    premiumOverride: false,
    forcePremiumAll: false,
    creditsPurchased: false,
    stripeSubscription: false,
    ...input.internalFlags,
  };
  const freeTextModel = firstConfiguredFreeModel(false);
  const freeVisionModel = firstConfiguredFreeModel(true);
  const premiumTextModel = firstConfiguredPremiumModel(false);
  const premiumVisionModel = firstConfiguredPremiumModel(true);
  return {
    plan,
    tier: plan,
    label: accessLabel(plan),
    isPremium: plan === "premium",
    role,
    internalFlags,
    allowedModelTier: plan,
    isDeveloper: role === "developer" || internalFlags.developerOverride,
    canUsePremiumModels: plan === "premium",
    maxJudgeTier: plan === "free" ? 1 : 3,
    reason: input.reason,
    freeTextModel,
    freeVisionModel,
    premiumTextModel,
    premiumVisionModel,
    upgradeRequiredMessage:
      "This challenge needs a Premium judge model. Free mode uses slower low-cost models and may ask for manual review instead of forcing a weak verdict.",
  };
}

export async function getAiAccessForUser(userId: string): Promise<AiAccessStatus> {
  if (process.env.STUBBORN_FORCE_PREMIUM_ALL === "1" || process.env.StepOne_FORCE_PREMIUM_ALL === "1") {
    return buildStatus({
      plan: "premium",
      reason: "STUBBORN_FORCE_PREMIUM_ALL enabled",
      internalFlags: { forcePremiumAll: true, premiumOverride: true },
    });
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
    ...splitEnvList("STUBBORN_DEV_USERS"),
    ...splitEnvList("StepOne_DEV_USERS"),
  ];
  const adminIdentities = [
    ...splitEnvList("STUBBORN_ADMIN_USERS"),
    ...splitEnvList("StepOne_ADMIN_USERS"),
  ];
  const premiumIdentities = [
    ...splitEnvList("STUBBORN_PREMIUM_USERS"),
    ...splitEnvList("StepOne_PREMIUM_USERS"),
  ];

  if (
    identityMatches(user?.email, adminIdentities) ||
    identityMatches(user?.username, adminIdentities)
  ) {
    return buildStatus({
      plan: "premium",
      role: "admin",
      reason: "admin allowlist",
      internalFlags: { premiumOverride: true },
    });
  }

  if (
    identityMatches(user?.email, devIdentities) ||
    identityMatches(user?.username, devIdentities)
  ) {
    return buildStatus({
      plan: "premium",
      role: "developer",
      reason: "developer allowlist",
      internalFlags: { developerOverride: true, premiumOverride: true },
    });
  }

  if (
    identityMatches(user?.email, premiumIdentities) ||
    identityMatches(user?.username, premiumIdentities)
  ) {
    return buildStatus({
      plan: "premium",
      reason: "premium allowlist",
      internalFlags: { premiumOverride: true },
    });
  }

  if ((user?.totalCreditsBought ?? 0) > 0) {
    return buildStatus({
      plan: "premium",
      reason: "credits purchased",
      internalFlags: { creditsPurchased: true },
    });
  }

  return buildStatus({ plan: "free", reason: "free beta account" });
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
  const requestedDefinition = requestedProvider ? getProviderById(requestedProvider) : undefined;
  const provider =
    requestedDefinition && isProviderConfigured(requestedDefinition)
      ? requestedDefinition
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

  if (input.access.isPremium) {
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
      reason: "No configured Free AI route is available.",
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
        ? "Free account routed to a Free AI model."
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
