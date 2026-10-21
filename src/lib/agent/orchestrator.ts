/**
 * GambleAI Agent Orchestrator.
 *
 * One turn = one user message + current conversation history + current hidden
 * draft state → exact local edit or one LLM call → merge draftPatch → optionally
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
import { AiBudgetError } from "@/lib/ai-governance";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";
import { executeAgentTool, type ToolResult } from "./tools";
import {
  draftIssueQuestion,
  getDraftIssues,
  normalizeDraftState,
} from "./draft-policy";
import { boundedAgentHistory, MAX_AGENT_MESSAGE_CHARS, tryLocalAgentResponse } from "./local-routing";
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
  if (input.message.length > MAX_AGENT_MESSAGE_CHARS) {
    return {
      userVisibleReply: /[\u3400-\u9fff]/.test(input.message)
        ? `消息过长，请将本次要求缩短到 ${MAX_AGENT_MESSAGE_CHARS} 个字符以内；现有草稿已保留。`
        : `Please shorten this message to ${MAX_AGENT_MESSAGE_CHARS} characters. Your existing draft is preserved.`,
      agentAction: "ask_followup", draftPatch: {}, toolName: null, toolArgs: null, draftState,
    };
  }

  // Resolve provider/model
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const providerId = envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  const model = def?.defaultModel ?? "gpt-4o-mini";

  // Build the user-turn payload. We give the LLM:
  //   (a) the hidden draft state as JSON,
  //   (b) recent conversation history as plain text,
  //   (c) the user's new message.
  const historyText = boundedAgentHistory(input.history);

  const userPayload = [
    `Hidden draft state (merge your draftPatch into this):`,
    "```json",
    JSON.stringify(draftState),
    "```",
    "",
    historyText ? `Recent conversation excerpts (may be incomplete; the structured draft is the current state):\n${historyText}\n` : "No earlier conversation supplied.\n",
    `User's new message:\n${input.message}`,
    "",
    `Respond with the JSON object only. No markdown, no preamble, no explanation.`,
  ].join("\n");

  let parsed: RawAgentResponse | null = tryLocalAgentResponse(input.message, draftState);
  if (!parsed) try {
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
    if (err instanceof AiBudgetError) throw err;
    console.error("[agent] LLM turn failed; preserving draft:", err instanceof Error ? err.message : err);
  }

  // Never turn unsupported requests into plausible generic rules on outage,
  // and never publish from a local natural-language guess.
  if (!parsed) return {
    userVisibleReply: /[\u3400-\u9fff]/.test(input.message)
      ? "AI 暂时无法处理这次要求，现有草稿已保留。请稍后重试；若草稿已确认，可使用发布按钮。"
      : "The AI could not process this request. Your draft is preserved. Try again shortly; a reviewed draft can still be published with the publish button.",
    agentAction: "ask_followup", draftPatch: {}, toolName: null, toolArgs: null,
    draftState,
  };

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
  // and compose the reply from the actual tool receipt. Tool narration never
  // needs a second inference or gets to mutate the draft.
  let toolResult: unknown = undefined;
  let toolError: string | undefined;
  let finalReply = validated.userVisibleReply;
  let finalAction = validated.agentAction;

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

    finalReply = agentToolReceipt(validated.toolName, result, /[\u3400-\u9fff]/.test(input.message));

    // Always normalize to call_tool — we did actually call a tool.
    finalAction = "call_tool";
  }

  return {
    userVisibleReply: finalReply,
    agentAction: finalAction,
    draftPatch: validated.draftPatch,
    toolName: validated.toolName,
    toolArgs: validated.toolArgs,
    draftState: newDraftState,
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
    userVisibleReply: agentToolReceipt("createChallenge", result, chinese),
    agentAction: "call_tool",
    draftPatch: {},
    toolName: "createChallenge",
    toolArgs: {},
    draftState,
    toolResult: result.data,
    toolError: result.error,
  };
}

/** Render backend facts only; a tool's pre-execution model reply is never a receipt. */
export function agentToolReceipt(name: AgentToolName, result: ToolResult, chinese = false): string {
  if (!result.ok) return chinese
    ? `操作失败：${result.error ?? "未知错误"}`
    : `Could not complete the action: ${result.error ?? "unknown error"}`;
  const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const text = (key: string) => typeof data[key] === "string" ? (data[key] as string) : "";
  switch (name) {
    case "createChallenge":
      return chinese
        ? `Quest ${data.deduplicated === true ? "已存在" : "已发布"}。状态：${text("status") || "未知"}。${text("shareUrl")}`
        : `Quest ${data.deduplicated === true ? "already exists" : "published"}. Status: ${text("status") || "unknown"}. ${text("shareUrl")}`;
    case "acceptChallenge":
      return chinese ? `已加入 Quest。状态：${text("status") || "未知"}。` : `You joined the quest. Status: ${text("status") || "unknown"}.`;
    case "generateShareLink":
      return chinese ? `邀请链接：${text("shareUrl")}` : `Invite link: ${text("shareUrl")}`;
    case "uploadEvidence":
      return chinese ? "证明已保存。" : "Proof saved.";
    case "updateDraft":
      return chinese ? "请检查当前草稿，确认规则后再发布。" : "Review the current draft and its rules before publishing.";
    case "extractVideoFrames":
      return chinese ? "提交证明时会自动触发视频抽帧。" : "Video frame extraction is triggered automatically when proof is submitted.";
    case "runVisionJudge":
      return chinese
        ? `${data.method === "rules" ? "规则判定" : "AI 裁判"}建议已记录，仍需参与者确认或复核。${text("winnerId") ? "已提出赢家建议。" : "尚未建议赢家。"}`
        : `${data.method === "rules" ? "Rule" : "AI referee"} recommendation recorded; participant confirmation or review is still required. ${text("winnerId") ? "A winner was recommended." : "No winner recommended."}`;
    case "confirmVerdict": {
      if (data.settled === true && data.status === "settled") return chinese ? "Quest 已结算。" : "Quest settled.";
      if (data.reviewStatus === "pending" || data.reviewStatus === "processing") return chinese ? "确认已记录，正在等待复核。" : "Confirmation recorded; review is pending.";
      const waiting = Array.isArray(data.waitingForUserIds) ? data.waitingForUserIds.length : 0;
      if (waiting > 0) return chinese ? `确认已记录，等待 ${waiting} 位参与者确认。` : `Confirmation recorded; waiting for ${waiting} participant${waiting === 1 ? "" : "s"} to confirm.`;
      return chinese ? `确认已记录。状态：${text("status") || "未知"}。` : `Confirmation recorded. Status: ${text("status") || "unknown"}.`;
    }
    case "findOpenMarkets": {
      const markets = Array.isArray(data.markets) ? data.markets : [];
      if (markets.length === 0) return chinese ? "暂时没有返回可加入的公开 Quest。" : "No open public quests were returned.";
      const titles = markets.slice(0, 3).map(market => market && typeof market === "object" && "title" in market && typeof market.title === "string" ? market.title.slice(0, 100) : "").filter(Boolean).join("; ");
      return chinese ? `找到 ${markets.length} 个公开 Quest：${titles}` : `Found ${markets.length} open public quest${markets.length === 1 ? "" : "s"}: ${titles}`;
    }
    case "matchMe":
      if (data.matched === true) return chinese ? `已匹配并加入 Quest：${text("title")}。${text("marketUrl")}` : `Matched and joined the quest: ${text("title")}. ${text("marketUrl")}`;
      return chinese ? `尚未匹配到 Quest。${text("reason")}` : `No quest was matched. ${text("reason")}`;
    case "settleCredits":
      return chinese ? "请通过参与者确认流程查看结算结果。" : "Check the settlement result through participant confirmation.";
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
