import type { DraftState } from "./types";

export type AgentIntentRoute =
  | "compile_protocol"
  | "join_contract"
  | "evidence_intake"
  | "outcome_judge"
  | "challenge_discovery"
  | "chat_or_support";

export type AgentIntentDecision = {
  route: AgentIntentRoute;
  directCompile: boolean;
  language: "en" | "zh" | "auto";
  confidence: number;
  reason: string;
  blockingSignals: string[];
};

const HAN_RE = /[\u3400-\u9fff]/;

const CREATE_RE = /\b(challenge|bet|wager|compete|competition|contest|generate|random|give me|create|make)\b/i;
const CREATE_ZH_RE = /[\u6311\u6218\u8d4c]|\u6bd4\u8d5b|\u751f\u6210|\u968f\u4fbf|\u6765\u4e00\u4e2a|\u7ed9\u6211\u6765|\u7ed9\u6211\u751f\u6210/;

const JOIN_RE = /\b(join|accept|i'?m in|reviewed .*rules|agree .*rules|agree .*settlement)\b/i;
const JOIN_ZH_RE = /\u52a0\u5165|\u63a5\u53d7|\u540c\u610f|\u89c4\u5219|\u63a5\u53d7\u89c4\u5219/;

const EVIDENCE_RE = /\b(upload|submit|evidence|recording|video url|proof|recorded|file)\b/i;
const EVIDENCE_ZH_RE = /\u4e0a\u4f20|\u63d0\u4ea4|\u8bc1\u636e|\u5f55\u50cf|\u89c6\u9891|\u8bc1\u660e/;
const PROTOCOL_CHAIN_TOOL_RE = /\b(issue .*binding|participant binding|liveness code|qr token|start .*recording|recording session|verify identity|verify evidence|evidenceid|evidence id)\b/i;
const PROTOCOL_CHAIN_TOOL_ZH_RE = /\u8eab\u4efd\u7ed1\u5b9a|\u6d3b\u4f53\u7801|\u5f00\u59cb\u5f55\u5236|\u5f55\u5236\u4f1a\u8bdd|\u9a8c\u8bc1\u8eab\u4efd|\u9a8c\u8bc1\u8bc1\u636e/;

const JUDGE_RE = /\b(judge|verdict|who won|winner|settle|settlement|rejudge|review again)\b/i;
const JUDGE_ZH_RE = /\u5224\u5b9a|\u8c01\u8d62|\u8d62\u5bb6|\u7ed3\u7b97|\u91cd\u65b0\u5224|\u590d\u6838/;

const DISCOVERY_RE = /\b(match me|find .*challenge|nearby|open challenges|what can i play|browse)\b/i;
const DISCOVERY_ZH_RE = /\u5339\u914d|\u9644\u8fd1|\u6709\u4ec0\u4e48\u53ef\u4ee5\u73a9|\u627e.*\u6311\u6218|\u5f00\u653e\u6311\u6218/;

const DO_NOT_COMPILE_RE = /\b(do not call|don't call|ask one|follow-up|follow up)\b/i;

function has(pattern: RegExp, text: string) {
  return pattern.test(text);
}

export function detectInputLanguage(input: string): "en" | "zh" | "auto" {
  if (HAN_RE.test(input)) return "zh";
  if (/[A-Za-z]/.test(input)) return "en";
  return "auto";
}

export function classifyAgentIntent(message: string, draftState?: Pick<DraftState, "protocol"> | null): AgentIntentDecision {
  const raw = message.trim();
  const text = raw.toLowerCase();
  const language = detectInputLanguage(raw);
  const blockingSignals: string[] = [];
  if (!raw) {
    return {
      route: "chat_or_support",
      directCompile: false,
      language,
      confidence: 1,
      reason: "empty_message",
      blockingSignals: ["empty_message"],
    };
  }
  if (draftState?.protocol) {
    blockingSignals.push("existing_protocol");
  }
  if (has(DO_NOT_COMPILE_RE, text)) {
    blockingSignals.push("user_requested_no_direct_compile");
  }

  if (has(DISCOVERY_RE, text) || has(DISCOVERY_ZH_RE, raw)) {
    return {
      route: "challenge_discovery",
      directCompile: false,
      language,
      confidence: 0.92,
      reason: "discovery_or_match_request",
      blockingSignals,
    };
  }
  if (has(JOIN_RE, text) || has(JOIN_ZH_RE, raw)) {
    return {
      route: "join_contract",
      directCompile: false,
      language,
      confidence: 0.9,
      reason: "join_or_accept_request",
      blockingSignals,
    };
  }
  if (has(PROTOCOL_CHAIN_TOOL_RE, text) || has(PROTOCOL_CHAIN_TOOL_ZH_RE, raw)) {
    return {
      route: "evidence_intake",
      directCompile: false,
      language,
      confidence: 0.94,
      reason: "protocol_chain_tool_request",
      blockingSignals,
    };
  }
  if (has(EVIDENCE_RE, text) || has(EVIDENCE_ZH_RE, raw)) {
    return {
      route: "evidence_intake",
      directCompile: false,
      language,
      confidence: 0.9,
      reason: "evidence_submission_request",
      blockingSignals,
    };
  }
  if (has(JUDGE_RE, text) || has(JUDGE_ZH_RE, raw)) {
    return {
      route: "outcome_judge",
      directCompile: false,
      language,
      confidence: 0.9,
      reason: "judgment_or_settlement_request",
      blockingSignals,
    };
  }

  const looksLikeCreate = has(CREATE_RE, text) || has(CREATE_ZH_RE, raw);
  const directCompile = looksLikeCreate && blockingSignals.length === 0;
  return {
    route: directCompile ? "compile_protocol" : "chat_or_support",
    directCompile,
    language,
    confidence: looksLikeCreate ? 0.88 : 0.6,
    reason: looksLikeCreate ? "challenge_creation_prompt" : "no_high_confidence_product_intent",
    blockingSignals,
  };
}

export function shouldDirectCompile(message: string, draftState: Pick<DraftState, "protocol">) {
  return classifyAgentIntent(message, draftState).directCompile;
}
