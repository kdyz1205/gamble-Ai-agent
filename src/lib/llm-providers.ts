/**
 * Registry of LLM backends for the off-chain AI oracle.
 * UI lists these; the router uses env vars per provider.
 */
export type LlmBackendKind = "anthropic" | "openai_compat" | "google";

export interface LlmProviderDefinition {
  id: string;
  label: string;
  shortLabel: string;
  kind: LlmBackendKind;
  /** OpenAI-compatible base URL (no trailing slash), when kind === openai_compat */
  baseUrl?: string;
  /** Optional env override for OpenAI-compatible base URL. */
  baseUrlEnv?: string;
  envVar: string;
  /** Local providers such as Ollama can run without a paid API key. */
  apiKeyOptional?: boolean;
  defaultModel: string;
  /** Suggested models in the collapsed panel */
  models: string[];
  docsUrl: string;
}

export function cleanEnvValue(value: string | undefined | null) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}

export const LLM_PROVIDERS: LlmProviderDefinition[] = [
  {
    id: "local_ollama",
    label: "Local Ollama / Llama",
    shortLabel: "Local",
    kind: "openai_compat",
    baseUrl: "http://127.0.0.1:11434/v1",
    baseUrlEnv: "OLLAMA_BASE_URL",
    envVar: "OLLAMA_API_KEY",
    apiKeyOptional: true,
    defaultModel: "llama4:latest",
    models: ["llama4:latest", "qwen3:latest", "llama3.3:latest", "llama3.2-vision:latest"],
    docsUrl: "https://ollama.com",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    shortLabel: "Anthropic",
    kind: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-4-7",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    kind: "openai_compat",
    baseUrl: "https://api.openai.com/v1",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4.1", "gpt-4o"],
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "azure_openai",
    label: "Azure OpenAI",
    shortLabel: "Azure",
    kind: "openai_compat",
    /** Router uses env AZURE_OPENAI_BASE_URL (deployment path + api-version), not this field. */
    baseUrl: "",
    envVar: "AZURE_OPENAI_API_KEY",
    defaultModel: "gpt-5.5",
    models: [],
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/",
  },
  {
    id: "google",
    label: "Google AI (Gemini)",
    shortLabel: "Google",
    kind: "google",
    envVar: "GOOGLE_AI_API_KEY",
    defaultModel: "gemini-3.5-flash",
    models: ["gemini-3.5-flash", "gemini-3.1-pro", "gemini-3-flash", "gemini-3.1-flash-lite", "gemini-2.5-pro"],
    docsUrl: "https://ai.google.dev/docs",
  },
  {
    id: "groq",
    label: "Groq",
    shortLabel: "Groq",
    kind: "openai_compat",
    baseUrl: "https://api.groq.com/openai/v1",
    envVar: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    docsUrl: "https://console.groq.com/docs",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    shortLabel: "Mistral",
    kind: "openai_compat",
    baseUrl: "https://api.mistral.ai/v1",
    envVar: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest"],
    docsUrl: "https://docs.mistral.ai",
  },
  {
    id: "moonshot",
    label: "Moonshot AI (Kimi)",
    shortLabel: "Kimi",
    kind: "openai_compat",
    baseUrl: "https://api.moonshot.ai/v1",
    envVar: "MOONSHOT_API_KEY",
    defaultModel: "kimi-k2.6",
    models: ["kimi-k2.6", "kimi-k2.5", "moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
    docsUrl: "https://platform.moonshot.ai/docs",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    kind: "openai_compat",
    baseUrl: "https://api.deepseek.com",
    envVar: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-pro",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
    docsUrl: "https://api-docs.deepseek.com",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    shortLabel: "xAI",
    kind: "openai_compat",
    baseUrl: "https://api.x.ai/v1",
    envVar: "XAI_API_KEY",
    defaultModel: "grok-4.3",
    models: ["grok-4.3", "grok-4.20", "grok-2-vision-latest"],
    docsUrl: "https://docs.x.ai",
  },
  {
    id: "together",
    label: "Together AI",
    shortLabel: "Together",
    kind: "openai_compat",
    baseUrl: "https://api.together.xyz/v1",
    envVar: "TOGETHER_API_KEY",
    defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    models: ["deepseek-ai/DeepSeek-V4-Pro", "moonshotai/Kimi-K2.6", "openai/gpt-oss-120b", "Qwen/Qwen3.5-397B-A17B"],
    docsUrl: "https://docs.together.ai",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    shortLabel: "Fireworks",
    kind: "openai_compat",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    envVar: "FIREWORKS_API_KEY",
    defaultModel: "accounts/fireworks/models/llama4-maverick-instruct-basic",
    models: ["accounts/fireworks/models/llama4-maverick-instruct-basic", "accounts/fireworks/models/llama-v3p3-70b-instruct"],
    docsUrl: "https://docs.fireworks.ai",
  },
];

export function getProviderById(id: string): LlmProviderDefinition | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id);
}

export function providerBaseUrl(def: LlmProviderDefinition) {
  return cleanEnvValue(def.baseUrlEnv ? process.env[def.baseUrlEnv] : undefined) || def.baseUrl || "";
}

export function isProviderConfigured(defOrId: LlmProviderDefinition | string | undefined) {
  const def = typeof defOrId === "string" ? getProviderById(defOrId) : defOrId;
  if (!def) return false;
  if (def.id === "local_ollama") {
    return process.env.LOCAL_LLM_ENABLED === "1" || Boolean(process.env.OLLAMA_BASE_URL);
  }
  if (process.env.ALLOW_PAID_AI !== "1") return false;
  return Boolean(cleanEnvValue(process.env[def.envVar]));
}

export function isPaidProvider(def: LlmProviderDefinition | undefined) {
  return Boolean(def && !def.apiKeyOptional);
}

export function configuredProviders() {
  return LLM_PROVIDERS.filter((provider) => isProviderConfigured(provider));
}

export function resolveTierProvider(tierId: 1 | 2 | 3, needsVision = false) {
  const envDefault = process.env.ORACLE_DEFAULT_PROVIDER;
  if (envDefault && isProviderConfigured(envDefault)) return getProviderById(envDefault);

  if (tierId === 1 && isProviderConfigured("local_ollama")) return getProviderById("local_ollama");

  if (needsVision && isProviderConfigured("google")) return getProviderById("google");

  if (tierId === 2) {
    for (const id of ["moonshot", "deepseek", "groq", "mistral", "together"]) {
      if (isProviderConfigured(id)) return getProviderById(id);
    }
  }

  if (tierId === 3) {
    for (const id of ["openai", "anthropic", "google", "xai"]) {
      if (isProviderConfigured(id)) return getProviderById(id);
    }
  }

  return configuredProviders()[0] ?? getProviderById("local_ollama");
}

export function resolveTierModel(provider: LlmProviderDefinition | undefined, tierId: 1 | 2 | 3, needsVision = false) {
  if (!provider) return "unconfigured-model";
  if (provider.id === "local_ollama") {
    if (needsVision && process.env.LOCAL_VISION_MODEL) return process.env.LOCAL_VISION_MODEL;
    return process.env.LOCAL_LLM_MODEL || provider.defaultModel;
  }
  if (provider.id === "google" && needsVision) return "gemini-3.5-flash";
  if (provider.id === "openai" && tierId === 3) return process.env.OPENAI_JUDGE_MODEL || provider.defaultModel;
  if (provider.id === "anthropic" && tierId === 3) return process.env.ANTHROPIC_JUDGE_MODEL || provider.defaultModel;
  return provider.defaultModel;
}

export const DEFAULT_LLM_PROVIDER_ID = "deepseek";
