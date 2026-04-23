import Anthropic from "@anthropic-ai/sdk";
import { getProviderById, type LlmProviderDefinition } from "./llm-providers";
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

async function anthropicComplete(def: LlmProviderDefinition, model: string, system: string, user: string, maxTokens: number, temperature?: number) {
  const key = process.env[def.envVar];
  if (!key) throw new Error(`${def.envVar} is not set`);
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    ...(temperature !== undefined ? { temperature } : {}),
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
}

async function openAiCompatibleComplete(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  querySuffix = "",
  temperature?: number,
) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions${querySuffix}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(temperature !== undefined ? { temperature } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM HTTP ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function googleComplete(model: string, system: string, user: string, maxTokens: number, apiKey: string, temperature?: number) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts;
  return parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function googleCompleteVision(
  model: string,
  system: string,
  userText: string,
  images: JudgeVisionImage[],
  maxTokens: number,
  apiKey: string,
  temperature?: number,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [{ text: userText }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
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
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const out = data.candidates?.[0]?.content?.parts;
  return out?.map((p) => p.text ?? "").join("") ?? "";
}

async function anthropicCompleteVision(
  def: LlmProviderDefinition,
  model: string,
  system: string,
  userText: string,
  images: JudgeVisionImage[],
  maxTokens: number,
  temperature?: number,
) {
  const key = process.env[def.envVar];
  if (!key) throw new Error(`${def.envVar} is not set`);
  const client = new Anthropic({ apiKey: key });
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [
    { type: "text", text: userText },
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType,
          data: img.base64,
        },
      }),
    ),
  ];
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
    ...(temperature !== undefined ? { temperature } : {}),
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
}

async function openAiCompatibleVisionComplete(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  userText: string,
  images: JudgeVisionImage[],
  maxTokens: number,
  querySuffix = "",
  temperature?: number,
) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions${querySuffix}`;
  const userContent: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  > = [{ type: "text", text: userText }];
  for (const img of images) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "auto" },
    });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      ...(temperature !== undefined ? { temperature } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM vision HTTP ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Single entry for oracle prompts — returns raw assistant text (expect JSON inside).
 */
export async function completeOraclePrompt(params: LlmCompleteParams): Promise<string> {
  const def = getProviderById(params.providerId);
  if (!def) throw new Error(`Unknown provider: ${params.providerId}`);

  const maxTokens = params.maxTokens ?? 1024;
  const temperature = params.temperature;
  const key = process.env[def.envVar];

  switch (def.kind) {
    case "anthropic":
      return anthropicComplete(def, params.model, params.system, params.user, maxTokens, temperature);
    case "openai_compat": {
      if (!key) throw new Error(`${def.envVar} is not set`);
      let baseUrl = def.baseUrl;
      let querySuffix = "";
      if (def.id === "azure_openai") {
        baseUrl = process.env.AZURE_OPENAI_BASE_URL || "";
        if (!baseUrl) throw new Error("AZURE_OPENAI_BASE_URL is not set (resource + /openai/deployments/<name>)");
        const ver = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
        querySuffix = `?api-version=${encodeURIComponent(ver)}`;
      }
      if (!baseUrl) throw new Error(`Provider ${def.id} has no baseUrl`);
      return openAiCompatibleComplete(
        baseUrl,
        key,
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
      return googleComplete(params.model, params.system, params.user, maxTokens, key, temperature);
    }
    default:
      throw new Error(`Unsupported backend: ${def.kind}`);
  }
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
  apiKey: string,
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
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
        ...(useTools ? { tools, tool_choice: "auto" } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
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
  const key = process.env[def.envVar];

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
  if (!key) throw new Error(`${def.envVar} is not set`);

  let baseUrl = def.baseUrl;
  let querySuffix = "";
  if (def.id === "azure_openai") {
    baseUrl = process.env.AZURE_OPENAI_BASE_URL || "";
    if (!baseUrl) throw new Error("AZURE_OPENAI_BASE_URL is not set");
    const ver = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
    querySuffix = `?api-version=${encodeURIComponent(ver)}`;
  }
  if (!baseUrl) throw new Error(`Provider ${def.id} has no baseUrl`);

  return openAiCompatibleWithTools(
    baseUrl,
    key,
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
  const def = getProviderById(params.providerId);
  if (!def) throw new Error(`Unknown provider: ${params.providerId}`);

  const maxTokens = params.maxTokens ?? 1024;
  const temperature = params.temperature;
  const key = process.env[def.envVar];

  if (params.images.length === 0) {
    return completeOraclePrompt({
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
      return anthropicCompleteVision(def, params.model, params.system, params.userText, params.images, maxTokens, temperature);
    case "openai_compat": {
      if (!key) throw new Error(`${def.envVar} is not set`);
      let baseUrl = def.baseUrl;
      let querySuffix = "";
      if (def.id === "azure_openai") {
        baseUrl = process.env.AZURE_OPENAI_BASE_URL || "";
        if (!baseUrl) throw new Error("AZURE_OPENAI_BASE_URL is not set");
        const ver = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
        querySuffix = `?api-version=${encodeURIComponent(ver)}`;
      }
      if (!baseUrl) throw new Error(`Provider ${def.id} has no baseUrl`);
      return openAiCompatibleVisionComplete(
        baseUrl,
        key,
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
      return googleCompleteVision(
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
