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
  envVar: string;
  defaultModel: string;
  /** Suggested models in the collapsed panel */
  models: string[];
  docsUrl: string;
}

export const LLM_PROVIDERS: LlmProviderDefinition[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    shortLabel: "Anthropic",
    kind: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5-20251001",
    models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-20250514", "claude-opus-4-20250514"],
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    kind: "openai_compat",
    baseUrl: "https://api.openai.com/v1",
    envVar: "OPENAI_API_KEY",
    // gpt-4o-mini is our default now: it handles the kind of frames we get after
    // pre-extraction (already scene-change sampled + sharp-normalized to 1568px
    // JPEGs) for ~1/17 the cost and ~3x the speed of gpt-4o. Judge latency wins
    // are the user-visible metric. If it ever returns confidence < 0.70, the
    // judge auto-escalates to gpt-4o for a second pass (see ai-engine.ts).
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "o4-mini", "o3-mini"],
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
    defaultModel: "gpt-4o-mini",
    models: [],
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/",
  },
  {
    id: "google",
    label: "Google AI (Gemini)",
    shortLabel: "Google",
    kind: "google",
    envVar: "GOOGLE_AI_API_KEY",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.5-pro-preview-05-06", "gemini-1.5-pro"],
    docsUrl: "https://ai.google.dev/docs",
  },
  {
    id: "groq",
    label: "Groq",
    shortLabel: "Groq",
    kind: "openai_compat",
    baseUrl: "https://api.groq.com/openai/v1",
    envVar: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    docsUrl: "https://console.groq.com/docs",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    shortLabel: "Mistral",
    kind: "openai_compat",
    baseUrl: "https://api.mistral.ai/v1",
    envVar: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-large-latest", "codestral-latest"],
    docsUrl: "https://docs.mistral.ai",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    kind: "openai_compat",
    baseUrl: "https://api.deepseek.com",
    envVar: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    docsUrl: "https://api-docs.deepseek.com",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    shortLabel: "xAI",
    kind: "openai_compat",
    baseUrl: "https://api.x.ai/v1",
    envVar: "XAI_API_KEY",
    defaultModel: "grok-2-latest",
    models: ["grok-2-latest", "grok-2-vision-latest"],
    docsUrl: "https://docs.x.ai",
  },
  {
    id: "together",
    label: "Together AI",
    shortLabel: "Together",
    kind: "openai_compat",
    baseUrl: "https://api.together.xyz/v1",
    envVar: "TOGETHER_API_KEY",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
    docsUrl: "https://docs.together.ai",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    shortLabel: "Fireworks",
    kind: "openai_compat",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    envVar: "FIREWORKS_API_KEY",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
    docsUrl: "https://docs.fireworks.ai",
  },
];

export function getProviderById(id: string): LlmProviderDefinition | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id);
}

export const DEFAULT_LLM_PROVIDER_ID = "anthropic";
