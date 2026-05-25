/**
 * Axelrod Agent Orchestrator.
 *
 * One turn = one user message + current conversation history + current hidden
 * draft state → one LLM call → structured JSON → merge draftPatch → optionally
 * execute a single tool → return an AgentResponse.
 *
 * The LLM's contract is enforced by:
 *   1. System prompt (src/lib/agent/system-prompt.ts) tells it to emit ONLY
 *      JSON with exactly five keys.
 *   2. A JSON extractor that recovers the first {...} block and strips
 *      trailing commas — the same safety net parseChallenge uses.
 *   3. A post-parse validator that clamps agentAction to the allowed set and
 *      defaults a missing draftPatch to {}.
 *
 * This module is SERVER-ONLY. The frontend talks to /api/agent/respond, which
 * delegates here.
 */
import { logAiUsage } from "@/lib/ai-usage-log";
import { completeOraclePromptWithMetadata, type LlmCallMetadata } from "@/lib/llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";
import { routeAgentTool, routeAgentTurn, routeJudgmentOutcome } from "./agent-graph";
import { executeAgentTool } from "./tools";
import {
  emptyDraftState,
  type AgentAction,
  type AgentMessage,
  type AgentResponse,
  type AgentToolName,
  type DraftState,
  type RawAgentResponse,
} from "./types";

const ALLOWED_ACTIONS: AgentAction[] = [
  "ask_followup", "show_draft", "call_tool", "judge", "confirm", "refuse_or_redirect",
];
const ALLOWED_TOOLS: AgentToolName[] = [
  "updateDraft", "compileProtocol", "createChallengeFromProtocol", "createChallenge", "acceptChallenge", "generateShareLink",
  "issueParticipantBinding", "startRecordingSession", "uploadEvidence", "verifyIdentity", "extractVideoFrames", "runProtocolJudge", "runVisionJudge", "confirmVerdict", "settleCredits",
  "findOpenMarkets", "matchMe",
];

export interface AgentTurnInput {
  userId: string;
  baseUrl: string;
  message: string;
  history: AgentMessage[];
  draftState?: DraftState;
  locationSnapshot?: { lat: number; lng: number } | null;
  providerId?: string | null;
  model?: string | null;
  maxToolRounds?: number; // safety cap; default 1
}

function summarizeLlmCall(metadata: LlmCallMetadata) {
  return {
    providerId: metadata.providerId,
    model: metadata.model,
    responseModel: metadata.responseModel ?? null,
    usedApi: metadata.usedApi,
    totalTokens: metadata.totalTokens ?? null,
    durationMs: metadata.durationMs ?? null,
  };
}

/**
 * Run one conversational turn. Returns the structured response plus the
 * merged draft state, plus (if the LLM requested a tool) the tool's result.
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentResponse> {
  const draftState: DraftState = input.draftState ?? emptyDraftState();

  // Resolve provider/model. A selected provider/model from the UI or caller
  // takes precedence; otherwise use the environment default.
  const requestedProviderId = input.providerId?.trim();
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const providerId = requestedProviderId && getProviderById(requestedProviderId)
    ? requestedProviderId
    : envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  const model = input.model?.trim() || def?.defaultModel || "gpt-4o-mini";

  // Build the user-turn payload. We give the LLM:
  //   (a) the hidden draft state as JSON,
  //   (b) recent conversation history as plain text,
  //   (c) the user's new message.
  const historyText = input.history
    .slice(-16) // keep last 16 turns to stay under context budget
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const userPayload = [
    `Hidden draft state (merge your draftPatch into this):`,
    "```json",
    JSON.stringify(draftState, null, 2),
    "```",
    "",
    historyText ? `Conversation so far:\n${historyText}\n` : "Conversation so far: (this is the first turn)\n",
    `User's new message:\n${input.message}`,
    "",
    `Respond with the JSON object only. No markdown, no preamble, no explanation.`,
  ].join("\n");

  console.log(`[agent/respond] calling provider=${providerId} model=${model} user=${input.userId}`);
  const completion = await completeOraclePromptWithMetadata({
    providerId,
    model,
    system: AGENT_SYSTEM_PROMPT,
    user: userPayload,
    maxTokens: 900,
    temperature: 0.4,
  });
  await logAiUsage({
    userId: input.userId,
    route: "/api/agent/respond",
    metadata: completion.metadata,
    extra: { phase: "agent_turn", toolRequested: false },
  });
  const llmCall = summarizeLlmCall(completion.metadata);
  const rawText = completion.text;

  const parsed = safeParseAgentJson(rawText);
  if (!parsed) {
    // Graceful fallback: ask the user to restate. Never return raw JSON to UI.
    return {
      userVisibleReply:
        "抱歉, 我这边没解出你刚才那句话 — 再说一次好吗? 或者换一种说法。",
      agentAction: "ask_followup",
      draftPatch: {},
      toolName: null,
      toolArgs: null,
      draftState,
      llmCall,
      agentGraph: routeAgentTurn({
        source: "/api/agent/respond",
        message: input.message,
        action: "ask_followup",
        toolName: null,
        draftState,
      }),
    };
  }

  const validated = validateAgentResponse(parsed);
  const newDraftState: DraftState = {
    ...draftState,
    ...validated.draftPatch,
    // Special merge rule for safetyNotes — append rather than replace so we
    // don't lose earlier redirects when AI forgets to include them again.
    safetyNotes: mergeSafetyNotes(draftState.safetyNotes, validated.draftPatch.safetyNotes),
  };

  // Execute tool if the LLM named one.
  //
  // IMPORTANT: we used to gate this behind `agentAction === "call_tool"`, but
  // in practice the LLM occasionally returns `agentAction: ask_followup` while
  // still filling in `toolName` (e.g. "I'll find a challenge for you" + tool).
  // When that happens, gating on the action caused the tool to be silently
  // dropped and the LLM's userVisibleReply became a hallucination of data it
  // never actually queried. Instead, treat any valid `toolName` as intent to
  // call the tool, promote the action to "call_tool" for client consistency,
  // and — if the reply was composed without tool results — do a 2nd grounded
  // LLM round so we don't show a fabricated answer.
  let toolResult: unknown = undefined;
  let toolError: string | undefined;
  let finalReply = validated.userVisibleReply;
  let finalAction = validated.agentAction;
  let finalPatch = validated.draftPatch;
  let finalDraftState = newDraftState;
  let groundedLlmCall: ReturnType<typeof summarizeLlmCall> | undefined;
  let agentGraph = routeAgentTurn({
    source: "/api/agent/respond",
    message: input.message,
    action: validated.agentAction,
    toolName: validated.toolName,
    draftState: newDraftState,
  });

  if (validated.toolName) {
    const result = await executeAgentTool(
      validated.toolName,
      {
        userId: input.userId,
        baseUrl: input.baseUrl,
        draftState: newDraftState,
        locationSnapshot: input.locationSnapshot ?? null,
        providerId,
        model,
      },
      validated.toolArgs ?? {},
    );
    if (result.ok) {
      toolResult = result.data;
      const toolPatch = extractDraftPatchFromToolResult(result.data);
      if (toolPatch) {
        finalPatch = { ...finalPatch, ...toolPatch };
        finalDraftState = {
          ...finalDraftState,
          ...toolPatch,
          safetyNotes: mergeSafetyNotes(finalDraftState.safetyNotes, toolPatch.safetyNotes),
        };
      }
    } else {
      toolError = result.error;
    }

    // Always normalize to call_tool — we did actually call a tool.
    finalAction = "call_tool";

    // If the first-turn reply was generated with no knowledge of the tool
    // outcome (LLM chose ask_followup/show_draft/etc but still requested a
    // tool), do a grounded 2nd turn so the reply reflects real data. For
    // clean `call_tool` responses we trust the first reply (usually a short
    // "doing it now…" placeholder before the client renders toolResult).
    agentGraph = judgmentGraphForToolResult(validated.toolName, result.data) ?? routeAgentTool(validated.toolName, {
      source: "/api/agent/respond",
      draftState: finalDraftState,
      toolOk: result.ok,
      toolError: result.ok ? null : result.error ?? "tool_failed",
      resultStatus: extractToolResultStatus(result.data),
    });

    const firstReplyWasUngrounded = validated.agentAction !== "call_tool";
    if (firstReplyWasUngrounded) {
      const grounded = await groundedReplyTurn({
        providerId,
        model,
        userId: input.userId,
        historyText,
        userMessage: input.message,
        draftStateBeforeTool: newDraftState,
        toolName: validated.toolName,
        toolArgs: validated.toolArgs ?? {},
        toolResult,
        toolError,
      });
      if (grounded) {
        finalReply = grounded.userVisibleReply || finalReply;
        finalPatch = { ...finalPatch, ...grounded.draftPatch };
        finalDraftState = {
          ...finalDraftState,
          ...grounded.draftPatch,
          safetyNotes: mergeSafetyNotes(finalDraftState.safetyNotes, grounded.draftPatch.safetyNotes),
        };
        groundedLlmCall = grounded.llmCall;
      }
    }
  }

  return {
    userVisibleReply: finalReply,
    agentAction: finalAction,
    draftPatch: finalPatch,
    toolName: validated.toolName,
    toolArgs: validated.toolArgs,
    draftState: finalDraftState,
    toolResult,
    toolError,
    llmCall,
    groundedLlmCall,
    agentGraph,
  };
}

/**
 * Second LLM pass that runs AFTER a tool executed. We feed the real tool
 * result back into the model so its userVisibleReply is grounded in reality
 * instead of hallucinated. We keep this cheap (short prompt, low tokens) and
 * ignore it on failure — the first-turn reply remains as a fallback.
 */
async function groundedReplyTurn(args: {
  providerId: string;
  model: string;
  userId: string;
  historyText: string;
  userMessage: string;
  draftStateBeforeTool: DraftState;
  toolName: AgentToolName;
  toolArgs: Record<string, unknown>;
  toolResult: unknown;
  toolError: string | undefined;
}): Promise<(RawAgentResponse & { llmCall?: ReturnType<typeof summarizeLlmCall> }) | null> {
  const toolPayload = args.toolError
    ? { error: args.toolError }
    : { data: args.toolResult };

  const userPayload = [
    `You just called the backend tool \`${args.toolName}\` with these args:`,
    "```json",
    JSON.stringify(args.toolArgs, null, 2),
    "```",
    "",
    `The tool returned:`,
    "```json",
    JSON.stringify(toolPayload, null, 2),
    "```",
    "",
    `Current hidden draft state:`,
    "```json",
    JSON.stringify(args.draftStateBeforeTool, null, 2),
    "```",
    "",
    args.historyText ? `Conversation so far:\n${args.historyText}\n` : "",
    `Original user message:\n${args.userMessage}`,
    "",
    `Now write ONE short natural reply (userVisibleReply) grounded in the actual tool result — no invented details. If the tool failed or returned nothing useful, say so naturally and offer a next step.`,
    `Respond with the same JSON object format (userVisibleReply, agentAction, draftPatch, toolName: null, toolArgs: null). Do NOT request another tool. No markdown fences. agentAction should reflect what you want to do NEXT (usually ask_followup or show_draft or refuse_or_redirect).`,
  ].join("\n");

  try {
    const completion = await completeOraclePromptWithMetadata({
      providerId: args.providerId,
      model: args.model,
      system: AGENT_SYSTEM_PROMPT,
      user: userPayload,
      maxTokens: 400,
      temperature: 0.3,
    });
    await logAiUsage({
      userId: args.userId,
      route: "/api/agent/respond",
      metadata: completion.metadata,
      extra: { phase: "grounded_tool_reply", toolName: args.toolName, toolError: Boolean(args.toolError) },
    });
    const rawText = completion.text;
    const parsed = safeParseAgentJson(rawText);
    if (!parsed) return null;
    const validated = validateAgentResponse(parsed);
    // Defensive: strip any tool re-request so we don't infinite-loop.
    validated.toolName = null;
    validated.toolArgs = null;
    return { ...validated, llmCall: summarizeLlmCall(completion.metadata) };
  } catch {
    return null;
  }
}

function extractDraftPatchFromToolResult(data: unknown): Partial<DraftState> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const patch = (data as { draftPatch?: unknown }).draftPatch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  return patch as Partial<DraftState>;
}

/** Merge safety notes by union — never lose a redirect. */
function extractToolResultStatus(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const status = record.status ?? record.finalStatus;
  return typeof status === "string" ? status : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function judgmentGraphForToolResult(toolName: AgentToolName | null, data: unknown) {
  if (toolName !== "runProtocolJudge" && toolName !== "runVisionJudge") return null;
  const record = objectValue(data);
  if (!record) return null;
  const settlementEligibility = objectValue(record.settlementEligibility);
  const eligible = settlementEligibility
    ? settlementEligibility.eligible === true
    : Boolean(record.winnerId && numberOrNull(record.confidence) !== null && (numberOrNull(record.confidence) ?? 0) >= 0.85);
  const blockingIssues = [
    ...stringArrayValue(record.blockingIssues),
    ...stringArrayValue(settlementEligibility?.blockingIssues),
  ];
  return routeJudgmentOutcome({
    source: "/api/agent/respond",
    verdictStatus: stringOrNull(record.status),
    winnerId: stringOrNull(record.winnerId),
    confidence: numberOrNull(record.confidence),
    recommendation: stringOrNull(record.recommendation),
    autoSettleEligible: eligible,
    blockingIssues,
  });
}

function mergeSafetyNotes(prev: string[], next: unknown): string[] {
  const a = Array.isArray(prev) ? prev : [];
  const b = Array.isArray(next) ? next.filter((x): x is string => typeof x === "string") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...a, ...b]) {
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** Extract the first {...} block and tolerate trailing commas / pre-JSON text. */
function safeParseAgentJson(text: string): RawAgentResponse | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw = match[0];
  try {
    return JSON.parse(raw) as RawAgentResponse;
  } catch { /* continue */ }
  // Strip trailing commas
  raw = raw.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(raw) as RawAgentResponse;
  } catch { /* continue */ }
  // Trim to the last closing brace
  for (let i = raw.length; i > 50; i--) {
    const lastBrace = raw.slice(0, i).lastIndexOf("}");
    if (lastBrace < 0) break;
    const candidate = raw.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, "$1");
    try { return JSON.parse(candidate) as RawAgentResponse; } catch { /* continue */ }
  }
  return null;
}

/** Validate + coerce LLM output into the agreed shape. */
function validateAgentResponse(p: RawAgentResponse): RawAgentResponse {
  const reply = typeof p.userVisibleReply === "string" && p.userVisibleReply.trim().length > 0
    ? p.userVisibleReply
    : "…";
  const action: AgentAction = ALLOWED_ACTIONS.includes(p.agentAction)
    ? p.agentAction
    : "ask_followup";
  const patch = p.draftPatch && typeof p.draftPatch === "object" ? p.draftPatch : {};
  const toolName = p.toolName && ALLOWED_TOOLS.includes(p.toolName as AgentToolName)
    ? (p.toolName as AgentToolName)
    : null;
  const toolArgs = toolName && p.toolArgs && typeof p.toolArgs === "object" ? p.toolArgs : null;
  return {
    userVisibleReply: reply,
    agentAction: action,
    draftPatch: patch,
    toolName,
    toolArgs,
  };
}
