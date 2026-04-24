/**
 * Agent Orchestrator — shared types.
 *
 * The orchestrator (src/lib/agent/orchestrator.ts) is the one AI-host layer
 * that sits between the user's chat and every backend tool. It owns the
 * conversation, asks follow-ups when needed, decides when the draft is ready
 * to publish, and dispatches tool calls. The user only ever sees chat +
 * optional cards — never a form.
 */

export type AgentAction =
  | "ask_followup"       // AI wants to ask one more question before committing
  | "show_draft"         // AI is confident; show the structured draft card
  | "call_tool"          // AI wants a backend tool invoked with toolArgs
  | "judge"              // AI has enough evidence and wants vision/text judgment
  | "confirm"            // AI surfaces a recommendation for human confirmation
  | "refuse_or_redirect"; // unsafe / illegal / unjudgeable — AI steers the user away

/**
 * The hidden draft state the orchestrator carries between turns. The user
 * never sees this raw JSON — the AI mutates it via draftPatch responses,
 * the server merges each patch, and the UI renders a card from it when
 * the AI decides `show_draft`.
 */
export interface DraftState {
  title: string | null;
  proposition: string | null;
  participants: string | null;   // human-readable summary ("you + 1 friend")
  stake: number | null;          // integer credits. 0 means "for fun"
  stakeType: "credits" | "none" | null;
  evidenceType: "video" | "photo" | "text" | null;
  judgeRule: string | null;      // natural-language rule the vision judge will follow
  timeWindow: string | null;     // e.g. "now", "by tomorrow", "within 1 hour"
  safetyNotes: string[];         // anything the AI flagged as a redirect/risk
  readyToPublish: boolean;       // AI sets true once the draft is complete enough to createChallenge
}

export function emptyDraftState(): DraftState {
  return {
    title: null,
    proposition: null,
    participants: null,
    stake: null,
    stakeType: null,
    evidenceType: null,
    judgeRule: null,
    timeWindow: null,
    safetyNotes: [],
    readyToPublish: false,
  };
}

/** Message in the chat history as passed to the orchestrator. */
export interface AgentMessage {
  role: "user" | "ai";
  content: string;
  timestamp?: string;
}

/** Tool name the agent may request. */
export type AgentToolName =
  | "updateDraft"          // merge a draft patch (server already did this — LLM can call redundantly but we no-op)
  | "createChallenge"      // persist Challenge row + charge creator stake (atomic)
  | "acceptChallenge"      // opponent seat (returns 409 if full, refunds on race)
  | "generateShareLink"    // just construct the /join/[id] URL
  | "uploadEvidence"       // record text evidence; video upload still goes through Blob presign separately
  | "extractVideoFrames"   // trigger the already-running pre-extract on an evidence row (no-op if already done)
  | "runVisionJudge"       // executeChallengeJudgment — real OpenAI vision call on extracted frames
  | "confirmVerdict"       // creator confirmation → settleCredits → settled status
  | "settleCredits"        // internal — tools above already call credits helpers; exposed for completeness
  | "findOpenMarkets"      // list public open challenges the user could join
  | "matchMe";             // auto-accept the best open market for the user (WeChat drift-bottle style)

/** Structured output the LLM is REQUIRED to return. */
export interface RawAgentResponse {
  userVisibleReply: string;
  agentAction: AgentAction;
  draftPatch: Partial<DraftState>;
  toolName: AgentToolName | null;
  toolArgs: Record<string, unknown> | null;
}

/** Envelope returned from the server to the client after one orchestrator turn. */
export interface AgentResponse extends RawAgentResponse {
  draftState: DraftState;         // merged state after applying draftPatch
  toolResult?: unknown;           // result of executing toolName (if any). Shape varies per tool.
  toolError?: string;             // present when the tool call failed — orchestrator can surface this.
}
