/**
 * GambleAI Agent Orchestrator.
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
import { completeOraclePrompt } from "@/lib/llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";
import { executeAgentTool } from "./tools";
import {
  buildDeterministicAgentResponse,
  draftIssueQuestion,
  getDraftIssues,
  normalizeDraftState,
} from "./draft-policy";
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
  "updateDraft", "createChallenge", "acceptChallenge", "generateShareLink",
  "uploadEvidence", "extractVideoFrames", "runVisionJudge", "confirmVerdict", "settleCredits",
  "findOpenMarkets", "matchMe",
];

export interface AgentTurnInput {
  userId: string;
  baseUrl: string;
  message: string;
  history: AgentMessage[];
  draftState?: DraftState;
  requestId?: string;
  maxToolRounds?: number; // safety cap; default 1
}

/**
 * Run one conversational turn. Returns the structured response plus the
 * merged draft state, plus (if the LLM requested a tool) the tool's result.
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentResponse> {
  const draftState = normalizeDraftState(input.draftState ?? emptyDraftState());

  // Resolve provider/model
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const providerId = envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  const model = def?.defaultModel ?? "gpt-4o-mini";

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

  let parsed: RawAgentResponse | null = null;
  try {
    const rawText = await completeOraclePrompt({
      providerId,
      model,
      system: AGENT_SYSTEM_PROMPT,
      user: userPayload,
      maxTokens: 900,
      temperature: 0.4,
    });
    parsed = safeParseAgentJson(rawText);
  } catch (err) {
    console.error("[agent] LLM turn failed; using deterministic challenge compiler:", err instanceof Error ? err.message : err);
  }

  // A provider outage, exhausted account, missing key, or malformed JSON must
  // not turn the product's main entry point into a 500. The local compiler
  // covers the common friend-challenge path and remains conservative when the
  // win condition is genuinely ambiguous.
  if (!parsed) parsed = buildDeterministicAgentResponse(input.message, draftState);

  const validated = validateAgentResponse(parsed);
  const newDraftState = normalizeDraftState({
    ...draftState,
    ...validated.draftPatch,
    // Special merge rule for safetyNotes — append rather than replace so we
    // don't lose earlier redirects when AI forgets to include them again.
    safetyNotes: mergeSafetyNotes(draftState.safetyNotes, validated.draftPatch.safetyNotes),
  });

  // readyToPublish is a server-derived invariant, never an LLM assertion.
  // Do not let an incomplete draft appear ready or reach createChallenge.
  if (validated.toolName === "createChallenge" && !newDraftState.readyToPublish) {
    const chinese = /[\u3400-\u9fff]/.test(input.message);
    return {
      userVisibleReply: draftIssueQuestion(newDraftState, chinese),
      agentAction: "ask_followup",
      draftPatch: { readyToPublish: false },
      toolName: null,
      toolArgs: null,
      draftState: newDraftState,
    };
  }
  if (!validated.toolName && validated.agentAction === "show_draft" && !newDraftState.readyToPublish) {
    const chinese = /[\u3400-\u9fff]/.test(input.message);
    validated.agentAction = "ask_followup";
    validated.userVisibleReply = draftIssueQuestion(newDraftState, chinese);
  } else if (!validated.toolName && validated.agentAction === "ask_followup" && newDraftState.readyToPublish) {
    validated.agentAction = "show_draft";
    validated.userVisibleReply = /[\u3400-\u9fff]/.test(input.message)
      ? "挑战规则已经完整。请检查草稿，确认后发布。"
      : "The quest rules are complete. Review the draft, then publish it.";
  }

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

  if (validated.toolName) {
    const result = await executeAgentTool(
      validated.toolName,
      { userId: input.userId, baseUrl: input.baseUrl, draftState: newDraftState, requestId: input.requestId },
      validated.toolArgs ?? {},
    );
    if (result.ok) {
      toolResult = result.data;
    } else {
      toolError = result.error;
    }

    // The first model reply was written before the tool result existed. Never
    // leave a false "publishing now" message visible when creation failed.
    if (validated.toolName === "createChallenge") {
      const chinese = /[\u3400-\u9fff]/.test(input.message);
      finalReply = result.ok
        ? (chinese ? "Quest 已发布。现在可以把邀请链接发给朋友。" : "Quest published. You can now send the invite link to your friend.")
        : (chinese ? `发布失败：${result.error ?? "未知错误"}` : `Could not publish the quest: ${result.error ?? "unknown error"}`);
    }

    // Always normalize to call_tool — we did actually call a tool.
    finalAction = "call_tool";

    // If the first-turn reply was generated with no knowledge of the tool
    // outcome (LLM chose ask_followup/show_draft/etc but still requested a
    // tool), do a grounded 2nd turn so the reply reflects real data. For
    // clean `call_tool` responses we trust the first reply (usually a short
    // "doing it now…" placeholder before the client renders toolResult).
    const firstReplyWasUngrounded = validated.agentAction !== "call_tool" && validated.toolName !== "createChallenge";
    if (firstReplyWasUngrounded) {
      const grounded = await groundedReplyTurn({
        providerId,
        model,
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
        finalDraftState = normalizeDraftState({
          ...newDraftState,
          ...grounded.draftPatch,
          safetyNotes: mergeSafetyNotes(newDraftState.safetyNotes, grounded.draftPatch.safetyNotes),
        });
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
  };
}

/** Publish a reviewed draft without spending another LLM turn. */
export async function publishAgentDraft(input: Pick<AgentTurnInput, "userId" | "baseUrl" | "draftState" | "requestId">): Promise<AgentResponse> {
  const draftState = normalizeDraftState(input.draftState ?? emptyDraftState());
  const issues = getDraftIssues(draftState);
  const chinese = /[\u3400-\u9fff]/.test([draftState.title, draftState.proposition].filter(Boolean).join(" "));
  if (issues.length > 0) {
    return {
      userVisibleReply: draftIssueQuestion(draftState, chinese),
      agentAction: "ask_followup",
      draftPatch: { readyToPublish: false },
      toolName: null,
      toolArgs: null,
      draftState,
    };
  }

  const result = await executeAgentTool(
    "createChallenge",
    { userId: input.userId, baseUrl: input.baseUrl, draftState, requestId: input.requestId },
    {},
  );
  return {
    userVisibleReply: result.ok
      ? (chinese ? "Quest 已发布。现在可以把邀请链接发给朋友。" : "Quest published. You can now send the invite link to your friend.")
      : (chinese ? `发布失败：${result.error ?? "未知错误"}` : `Could not publish the quest: ${result.error ?? "unknown error"}`),
    agentAction: "call_tool",
    draftPatch: {},
    toolName: "createChallenge",
    toolArgs: {},
    draftState,
    toolResult: result.data,
    toolError: result.error,
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
  historyText: string;
  userMessage: string;
  draftStateBeforeTool: DraftState;
  toolName: AgentToolName;
  toolArgs: Record<string, unknown>;
  toolResult: unknown;
  toolError: string | undefined;
}): Promise<RawAgentResponse | null> {
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
    const rawText = await completeOraclePrompt({
      providerId: args.providerId,
      model: args.model,
      system: AGENT_SYSTEM_PROMPT,
      user: userPayload,
      maxTokens: 400,
      temperature: 0.3,
    });
    const parsed = safeParseAgentJson(rawText);
    if (!parsed) return null;
    const validated = validateAgentResponse(parsed);
    // Defensive: strip any tool re-request so we don't infinite-loop.
    validated.toolName = null;
    validated.toolArgs = null;
    return validated;
  } catch {
    return null;
  }
}

/** Merge safety notes by union — never lose a redirect. */
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
