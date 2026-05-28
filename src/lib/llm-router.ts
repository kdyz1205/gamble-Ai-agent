import Anthropic from "@anthropic-ai/sdk";
import { cleanEnvValue, getProviderById, isProviderConfigured, providerApiKey, providerBaseUrl, type LlmProviderDefinition } from "./llm-providers";
import type { JudgeVisionImage } from "./media/prepare-evidence-visuals";
import { executeOracleTool, type OpenAiTool, type OracleToolResult } from "./oracle-tools";

export interface LlmCompleteParams {
  providerId: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCallMetadata {
  providerId: string;
  providerLabel: string;
  model: string;
  requestKind: "text" | "vision" | "audio";
  usedApi: boolean;
  baseUrlHost?: string | null;
  httpStatus?: number | null;
  responseId?: string | null;
  responseModel?: string | null;
  durationMs: number;
  imageCount?: number;
  responseFormat?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}

export interface LlmCallResult {
  text: string;
  metadata: LlmCallMetadata;
}

const ANTHROPIC_TIMEOUT_MS = 45_000;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Wrap a promise with a hard timeout so a hung upstream never holds a serverless slot forever. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function hostFromBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
  }
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function jsonObjectResponseFormat(providerId: string, baseUrl: string) {
  if (providerId === "openai" || providerId === "deepseek" || baseUrl.includes("api.openai.com")) {
    return "json_object";
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(res: Response, errorText: string, attempt: number) {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(15_000, Math.max(250, seconds * 1000));

    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.min(15_000, Math.max(250, retryDate - Date.now()));
  }

  const msMatch = errorText.match(/try again in\s+(\d+(?:\.\d+)?)\s*ms/i);
  if (msMatch) return Math.min(15_000, Math.max(250, Number(msMatch[1])));

  const secMatch = errorText.match(/try again in\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i);
  if (secMatch) return Math.min(15_000, Math.max(250, Number(secMatch[1]) * 1000));

  return Math.min(15_000, 600 * 2 ** Math.max(0, attempt - 1));
}

async function fetchWithLlmRetry(
  url: string,
  init: RequestInit,
  label: string,
  maxAttempts = 3,
): Promise<{ res: Response; errorText?: string }> {
  let lastErrorText: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, init);
    if (res.ok || !RETRYABLE_HTTP_STATUSES.has(res.status) || attempt >= maxAttempts) {
      return { res, errorText: res.ok ? undefined : lastErrorText ?? (await res.text()) };
    }

    const errorText = await res.text();
    lastErrorText = errorText;
    const waitMs = retryDelayMs(res, errorText, attempt);
    console.warn(`[llm-router] ${label} HTTP ${res.status}; retrying in ${waitMs}ms (${attempt}/${maxAttempts})`);
    await sleep(waitMs);
  }

  throw new Error(`[llm-router] ${label} retry loop exited unexpectedly`);
}

async function anthropicCompleteWithMetadata(
  def: LlmProviderDefinition,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature?: number,
): Promise<LlmCallResult> {
  const key = providerApiKey(def);
  if (!key) throw new Error(`${def.envVar} is not set`);
  const startedAt = Date.now();
  const client = new Anthropic({ apiKey: key, maxRetries: 1 });
  const response = await withTimeout(
    client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      ...(temperature !== undefined ? { temperature } : {}),
    }),
    ANTHROPIC_TIMEOUT_MS,
    "anthropic.messages.create",
  );
  const block = response.content[0];
  return {
    text: block?.type === "text" ? block.text : "",
    metadata: {
      providerId: def.id,
      providerLabel: def.shortLabel,
      model,
      requestKind: "text",
      usedApi: true,
      httpStatus: null,
      responseId: response.id ?? null,
      responseModel: response.model ?? null,
      durationMs: elapsedMs(startedAt),
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      totalTokens: response.usage ? response.usage.input_tokens + response.usage.output_tokens : null,
    },
  };
}

async function openAiCompatibleCompleteWithMetadata(
  providerId: string,
  providerLabel: string,
  baseUrl: string,
  apiKey: string | null,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  querySuffix = "",
  temperature?: number,
): Promise<LlmCallResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions${querySuffix}`;
  const startedAt = Date.now();
  const responseFormat = jsonObjectResponseFormat(providerId, baseUrl);
  const { res, errorText } = await fetchWithLlmRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    },
    `${providerId}.chat`,
  );
  if (!res.ok) {
    const err = errorText ?? (await res.text());
    throw new Error(`LLM HTTP ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    id?: string;
    model?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    metadata: {
      providerId,
      providerLabel,
      model,
      requestKind: "text",
      usedApi: true,
      baseUrlHost: hostFromBaseUrl(baseUrl),
      httpStatus: res.status,
      responseId: data.id ?? null,
      responseModel: data.model ?? null,
      durationMs: elapsedMs(startedAt),
      responseFormat,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
    },
  };
}

async function googleCompleteWithMetadata(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  apiKey: string,
  temperature?: number,
): Promise<LlmCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    responseId?: string;
    modelVersion?: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts;
  return {
    text: parts?.map((p) => p.text ?? "").join("") ?? "",
    metadata: {
      providerId: "google",
      providerLabel: "Google",
      model,
      requestKind: "text",
      usedApi: true,
      baseUrlHost: "generativelanguage.googleapis.com",
      httpStatus: res.status,
      responseId: data.responseId ?? null,
      responseModel: data.modelVersion ?? null,
      durationMs: elapsedMs(startedAt),
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
      totalTokens: data.usageMetadata?.totalTokenCount ?? null,
    },
  };
}

async function googleCompleteVisionWithMetadata(
  model: string,
  system: string,
  userText: string,
  images: JudgeVisionImage[],
  maxTokens: number,
  apiKey: string,
  temperature?: number,
): Promise<LlmCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [{ text: userText }];
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    if (img.caption) parts.push({ text: `Image ${i + 1}: ${img.caption}` });
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini vision HTTP ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    responseId?: string;
    modelVersion?: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const out = data.candidates?.[0]?.content?.parts;
  return {
    text: out?.map((p) => p.text ?? "").join("") ?? "",
    metadata: {
      providerId: "google",
      providerLabel: "Google",
      model,
      requestKind: "vision",
      usedApi: true,
      baseUrlHost: "generativelanguage.googleapis.com",
      httpStatus: res.status,
      responseId: data.responseId ?? null,
      responseModel: data.modelVersion ?? null,
      durationMs: elapsedMs(startedAt),
      imageCount: images.length,
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
      totalTokens: data.usageMetadata?.totalTokenCount ?? null,
    },
  };
}

async function anthropicCompleteVisionWithMetadata(
  def: LlmProviderDefinition,
  model: string,
  system: string,
  userText: string,
  images: JudgeVisionImage[],
  maxTokens: number,
  temperature?: number,
): Promise<LlmCallResult> {
  const key = providerApiKey(def);
  if (!key) throw new Error(`${def.envVar} is not set`);
  const startedAt = Date.now();
  const client = new Anthropic({ apiKey: key, maxRetries: 1 });
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [
    { type: "text", text: userText },
    ...images.flatMap(
      (img, i): Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => [
        ...(img.caption ? [{ type: "text" as const, text: `Image ${i + 1}: ${img.caption}` }] : []),
        {
          type: "image",
          source: {
            type: "base64",
            media_type: img.mimeType,
            data: img.base64,
          },
        },
      ],
    ),
  ];
  // Vision calls are heavier — give them a bit more headroom.
  const response = await withTimeout(
    client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      ...(temperature !== undefined ? { temperature } : {}),
    }),
    ANTHROPIC_TIMEOUT_MS * 2,
    "anthropic.messages.create (vision)",
  );
  const block = response.content[0];
  return {
    text: block?.type === "text" ? block.text : "",
    metadata: {
      providerId: def.id,
      providerLabel: def.shortLabel,
      model,
      requestKind: "vision",
      usedApi: true,
      httpStatus: null,
      responseId: response.id ?? null,
      responseModel: response.model ?? null,
      durationMs: elapsedMs(startedAt),
      imageCount: images.length,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      totalTokens: response.usage ? response.usage.input_tokens + response.usage.output_tokens : null,
    },
  };
}

async function openAiCompatibleVisionCompleteWithMetadata(
  providerId: string,
  providerLabel: string,
  baseUrl: string,
  apiKey: string | null,
  model: string,
  system: string,
  userText: string,
  images: JudgeVisionImage[],
  maxTokens: number,
  querySuffix = "",
  temperature?: number,
): Promise<LlmCallResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions${querySuffix}`;
  const userContent: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  > = [{ type: "text", text: userText }];
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    if (img.caption) {
      userContent.push({ type: "text", text: `Image ${i + 1}: ${img.caption}` });
    }
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "auto" },
    });
  }
  const responseFormat = jsonObjectResponseFormat(providerId, baseUrl);
  const startedAt = Date.now();
  const { res, errorText } = await fetchWithLlmRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    },
    `${providerId}.vision`,
    4,
  );
  if (!res.ok) {
    const err = errorText ?? (await res.text());
    throw new Error(`LLM vision HTTP ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    id?: string;
    model?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    metadata: {
      providerId,
      providerLabel,
      model,
      requestKind: "vision",
      usedApi: true,
      baseUrlHost: hostFromBaseUrl(baseUrl),
      httpStatus: res.status,
      responseId: data.id ?? null,
      responseModel: data.model ?? null,
      durationMs: elapsedMs(startedAt),
      imageCount: images.length,
      responseFormat,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
    },
  };
}

/**
 * Single entry for oracle prompts — returns raw assistant text (expect JSON inside).
 */
export async function completeOraclePromptWithMetadata(params: LlmCompleteParams): Promise<LlmCallResult> {
  const def = getProviderById(params.providerId);
  if (!def) throw new Error(`Unknown provider: ${params.providerId}`);

  const maxTokens = params.maxTokens ?? 1024;
  const temperature = params.temperature;
  const key = providerApiKey(def);

  switch (def.kind) {
    case "anthropic":
      return anthropicCompleteWithMetadata(def, params.model, params.system, params.user, maxTokens, temperature);
    case "openai_compat": {
      if (!def.apiKeyOptional && !key) throw new Error(`${def.envVar} is not set`);
      if (!isProviderConfigured(def)) throw new Error(`Provider ${def.id} is not configured`);
      let baseUrl = providerBaseUrl(def);
      let querySuffix = "";
      if (def.id === "azure_openai") {
        baseUrl = cleanEnvValue(process.env.AZURE_OPENAI_BASE_URL);
        if (!baseUrl) throw new Error("AZURE_OPENAI_BASE_URL is not set (resource + /openai/deployments/<name>)");
        const ver = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
        querySuffix = `?api-version=${encodeURIComponent(ver)}`;
      }
      if (!baseUrl) throw new Error(`Provider ${def.id} has no baseUrl`);
      return openAiCompatibleCompleteWithMetadata(
        def.id,
        def.shortLabel,
        baseUrl,
        key || null,
        params.model,
        params.system,
        params.user,
        maxTokens,
        querySuffix,
        temperature,
      );
    }
    case "google": {
      if (!key) throw new Error(`${def.envVar} is not set`);
      return googleCompleteWithMetadata(params.model, params.system, params.user, maxTokens, key, temperature);
    }
    default:
      throw new Error(`Unsupported backend: ${def.kind}`);
  }
}

export async function completeOraclePrompt(params: LlmCompleteParams): Promise<string> {
  return (await completeOraclePromptWithMetadata(params)).text;
}

// ────────────────────────────────────────────────────────────────
// TOOL CALLING — lets parse-time LLM actually invoke real-world lookups
// (CoinGecko, Open-Meteo, …) rather than guessing at truth. Only implemented
// for openai_compat backends for now; anthropic/google use different shapes.
// ────────────────────────────────────────────────────────────────

export interface ToolInvocation {
  name: string;
  args: unknown;
  result: OracleToolResult;
}

export interface ToolCompletionResult {
  text: string;
  toolInvocations: ToolInvocation[];
}

type OpenAiChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "tool"; tool_call_id: string; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };

async function openAiCompatibleWithTools(
  baseUrl: string,
  apiKey: string | null,
  model: string,
  system: string,
  user: string,
  tools: OpenAiTool[],
  maxTokens: number,
  querySuffix = "",
  temperature?: number,
  maxIterations = 3,
): Promise<ToolCompletionResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions${querySuffix}`;
  const messages: OpenAiChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const toolInvocations: ToolInvocation[] = [];

  for (let iter = 0; iter < maxIterations; iter++) {
    const useTools = iter < maxIterations - 1; // on the last pass force a final text answer
    const { res, errorText } = await fetchWithLlmRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages,
          ...(useTools ? { tools, tool_choice: "auto" } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
        }),
      },
      "openai.tool",
    );
    if (!res.ok) {
      const err = errorText ?? (await res.text());
      throw new Error(`LLM tool HTTP ${res.status}: ${err.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          role: "assistant";
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) return { text: "", toolInvocations };

    // If the model asked for tool calls, execute them and feed results back.
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(call.function.arguments || "{}"); } catch { parsedArgs = {}; }
        const result = await executeOracleTool(call.function.name, parsedArgs);
        toolInvocations.push({ name: call.function.name, args: parsedArgs, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue; // loop — next pass, model sees the tool output and writes the final answer
    }

    // No tool calls — this is the final answer.
    return { text: msg.content ?? "", toolInvocations };
  }

  // Loop exhausted (rare). Return whatever we have.
  return { text: "", toolInvocations };
}

/**
 * Tool-using text completion. Currently openai_compat only — for other
 * backends we fall through to a plain completeOraclePrompt() call so the
 * caller still gets usable output (no tool trail).
 */
export async function completeOraclePromptWithTools(params: {
  providerId: string;
  model: string;
  system: string;
  user: string;
  tools: OpenAiTool[];
  maxTokens?: number;
  temperature?: number;
  maxIterations?: number;
}): Promise<ToolCompletionResult> {
  const def = getProviderById(params.providerId);
  if (!def) throw new Error(`Unknown provider: ${params.providerId}`);

  const maxTokens = params.maxTokens ?? 1024;
  const temperature = params.temperature;
  const key = providerApiKey(def);

  if (def.kind !== "openai_compat") {
    // Graceful degrade: use plain prompt, no tools.
    const text = await completeOraclePrompt({
      providerId: params.providerId,
      model: params.model,
      system: params.system,
      user: params.user,
      maxTokens,
      temperature,
    });
    return { text, toolInvocations: [] };
  }
  if (!def.apiKeyOptional && !key) throw new Error(`${def.envVar} is not set`);
  if (!isProviderConfigured(def)) throw new Error(`Provider ${def.id} is not configured`);

  let baseUrl = providerBaseUrl(def);
  let querySuffix = "";
  if (def.id === "azure_openai") {
    baseUrl = cleanEnvValue(process.env.AZURE_OPENAI_BASE_URL);
    if (!baseUrl) throw new Error("AZURE_OPENAI_BASE_URL is not set");
    const ver = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
    querySuffix = `?api-version=${encodeURIComponent(ver)}`;
  }
  if (!baseUrl) throw new Error(`Provider ${def.id} has no baseUrl`);

  return openAiCompatibleWithTools(
    baseUrl,
    key || null,
    params.model,
    params.system,
    params.user,
    params.tools,
    maxTokens,
    querySuffix,
    temperature,
    params.maxIterations,
  );
}

/**
 * Vision path for AI judge: same JSON contract as text-only, but with real image bytes (incl. video→frames).
 */
export async function completeOracleJudgeVision(params: {
  providerId: string;
  model: string;
  system: string;
  userText: string;
  images: JudgeVisionImage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  return (await completeOracleJudgeVisionWithMetadata(params)).text;
}

export async function completeOracleJudgeVisionWithMetadata(params: {
  providerId: string;
  model: string;
  system: string;
  userText: string;
  images: JudgeVisionImage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<LlmCallResult> {
  const def = getProviderById(params.providerId);
  if (!def) throw new Error(`Unknown provider: ${params.providerId}`);

  const maxTokens = params.maxTokens ?? 1024;
  const temperature = params.temperature;
  const key = providerApiKey(def);

  if (params.images.length === 0) {
    return completeOraclePromptWithMetadata({
      providerId: params.providerId,
      model: params.model,
      system: params.system,
      user: params.userText,
      maxTokens,
      temperature,
    });
  }

  switch (def.kind) {
    case "anthropic":
      return anthropicCompleteVisionWithMetadata(def, params.model, params.system, params.userText, params.images, maxTokens, temperature);
    case "openai_compat": {
      if (!def.apiKeyOptional && !key) throw new Error(`${def.envVar} is not set`);
      if (!isProviderConfigured(def)) throw new Error(`Provider ${def.id} is not configured`);
      let baseUrl = providerBaseUrl(def);
      let querySuffix = "";
      if (def.id === "azure_openai") {
        baseUrl = cleanEnvValue(process.env.AZURE_OPENAI_BASE_URL);
        if (!baseUrl) throw new Error("AZURE_OPENAI_BASE_URL is not set");
        const ver = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
        querySuffix = `?api-version=${encodeURIComponent(ver)}`;
      }
      if (!baseUrl) throw new Error(`Provider ${def.id} has no baseUrl`);
      return openAiCompatibleVisionCompleteWithMetadata(
        def.id,
        def.shortLabel,
        baseUrl,
        key || null,
        params.model,
        params.system,
        params.userText,
        params.images,
        maxTokens,
        querySuffix,
        temperature,
      );
    }
    case "google": {
      if (!key) throw new Error(`${def.envVar} is not set`);
      return googleCompleteVisionWithMetadata(
        params.model,
        params.system,
        params.userText,
        params.images,
        maxTokens,
        key,
        temperature,
      );
    }
    default:
      throw new Error(`Unsupported vision backend: ${def.kind}`);
  }
}
