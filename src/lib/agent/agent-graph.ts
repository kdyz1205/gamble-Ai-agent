import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import type { AgentAction, AgentToolName, DraftState } from "./types";

export type AgentNodeId =
  | "conversation_host"
  | "intent_router"
  | "rule_safety"
  | "data_source_router"
  | "protocol_compiler"
  | "identity_protocol"
  | "evidence_protocol"
  | "challenge_creator"
  | "challenge_discovery"
  | "join_contract"
  | "location_gate"
  | "recording_session"
  | "evidence_intake"
  | "evidence_identity_verifier"
  | "outcome_judge"
  | "settlement_gate"
  | "credit_settlement"
  | "rejudge_escalation"
  | "manual_review";

export type AgentGraphNode = {
  id: AgentNodeId;
  label: string;
  responsibility: string;
  owns: string[];
  input: string[];
  output: string[];
  canCall: AgentNodeId[];
  fallback: AgentNodeId[];
};

export type AgentGraphTrace = {
  graphVersion: "agent-graph-v1";
  routeId: string;
  source: string;
  status: "planned" | "executed" | "blocked" | "needs_review";
  route: AgentNodeId[];
  currentAgent: AgentNodeId;
  nextAgents: AgentNodeId[];
  blockingReason: string | null;
  notes: string[];
  context: Record<string, unknown>;
  createdAt: string;
};

export const AGENT_GRAPH_REGISTRY: AgentGraphNode[] = [
  {
    id: "conversation_host",
    label: "Conversation Host Agent",
    responsibility: "Owns the natural-language turn, draft state, tool intent, and grounded reply.",
    owns: ["chat turn", "hidden draft state", "tool intent"],
    input: ["user message", "conversation history", "draft state"],
    output: ["agent action", "draft patch", "tool request"],
    canCall: ["intent_router", "challenge_discovery", "join_contract", "evidence_intake", "outcome_judge"],
    fallback: ["manual_review"],
  },
  {
    id: "intent_router",
    label: "Intent Router Agent",
    responsibility: "Classifies whether the turn is compile, publish, join, evidence, judge, discovery, or support.",
    owns: ["intent class", "route selection"],
    input: ["user message", "draft state"],
    output: ["route id", "required downstream agents"],
    canCall: ["rule_safety", "challenge_discovery", "join_contract", "evidence_intake"],
    fallback: ["conversation_host"],
  },
  {
    id: "rule_safety",
    label: "Rule Safety Agent",
    responsibility: "Blocks or redirects unsafe, illegal, coercive, non-consensual, or unjudgeable challenges.",
    owns: ["risk category", "safe alternative", "blocked reason"],
    input: ["raw prompt"],
    output: ["risk policy"],
    canCall: ["data_source_router", "protocol_compiler"],
    fallback: ["manual_review"],
  },
  {
    id: "data_source_router",
    label: "Data Source Router Agent",
    responsibility: "Finds whether the challenge should use a public oracle, user-authorized API, document AI, or manual review.",
    owns: ["source key", "adapter status", "auto-settle data gate"],
    input: ["raw prompt", "protocol text"],
    output: ["data source match", "adapter requirements"],
    canCall: ["protocol_compiler", "settlement_gate"],
    fallback: ["manual_review"],
  },
  {
    id: "protocol_compiler",
    label: "Protocol Compiler Agent",
    responsibility: "Compiles the user idea into ProtocolSpecV2, not just title/rules.",
    owns: ["ProtocolSpecV2", "participant mode", "outcome type", "settlement mode"],
    input: ["raw prompt", "safety decision", "data source match"],
    output: ["ProtocolSpecV2", "preview"],
    canCall: ["identity_protocol", "evidence_protocol", "settlement_gate"],
    fallback: ["manual_review"],
  },
  {
    id: "identity_protocol",
    label: "Identity Protocol Agent",
    responsibility: "Decides account-only, liveness phrase, same-camera position, QR card, host check-in, or manual identity review.",
    owns: ["participant bindings", "liveness code requirements", "identity threshold"],
    input: ["ProtocolSpecV2"],
    output: ["identity protocol", "participant bindings"],
    canCall: ["evidence_protocol"],
    fallback: ["manual_review"],
  },
  {
    id: "evidence_protocol",
    label: "Evidence Protocol Agent",
    responsibility: "Decides video/photo/GPS/oracle/receipt/witness evidence rules and invalid evidence conditions.",
    owns: ["required evidence", "capture instructions", "invalid evidence rules"],
    input: ["ProtocolSpecV2", "identity protocol"],
    output: ["evidence requirements"],
    canCall: ["challenge_creator", "recording_session", "evidence_identity_verifier"],
    fallback: ["manual_review"],
  },
  {
    id: "challenge_creator",
    label: "Challenge Creator Agent",
    responsibility: "Persists the challenge, protocol snapshot, creator participant, bindings, liveness code, and location snapshot.",
    owns: ["Challenge", "ChallengeProtocol", "Participant", "ParticipantBinding"],
    input: ["ProtocolSpecV2", "stake", "location snapshot"],
    output: ["challenge id", "join link"],
    canCall: ["join_contract", "challenge_discovery"],
    fallback: ["manual_review"],
  },
  {
    id: "challenge_discovery",
    label: "Challenge Discovery Agent",
    responsibility: "Finds open public/nearby challenges and returns join contracts without auto-accepting.",
    owns: ["nearby/open challenge list", "match result"],
    input: ["user intent", "location snapshot"],
    output: ["join URL", "challenge summaries"],
    canCall: ["join_contract"],
    fallback: ["conversation_host"],
  },
  {
    id: "join_contract",
    label: "Join Contract Agent",
    responsibility: "Requires explicit rule, evidence, AI judging, dispute, and credit settlement acceptance before joining.",
    owns: ["acceptance contract", "opponent seat"],
    input: ["challenge id", "acceptedRuleContract", "location snapshot"],
    output: ["participant status", "evidence window status"],
    canCall: ["location_gate", "evidence_intake"],
    fallback: ["manual_review"],
  },
  {
    id: "location_gate",
    label: "Location Gate Agent",
    responsibility: "Checks nearby, same-place, walk-to-join, and geo-fenced eligibility with privacy rules.",
    owns: ["distance", "radius", "eligibility"],
    input: ["challenge location", "user location", "location protocol"],
    output: ["location eligibility"],
    canCall: ["join_contract"],
    fallback: ["manual_review"],
  },
  {
    id: "recording_session",
    label: "Recording Session Agent",
    responsibility: "Starts a capture session for same-camera/live-host attempts and freezes capture instructions.",
    owns: ["recording session", "pre-roll instructions"],
    input: ["challenge id", "evidence protocol", "participant bindings"],
    output: ["recordingSessionId"],
    canCall: ["evidence_intake"],
    fallback: ["manual_review"],
  },
  {
    id: "evidence_intake",
    label: "Evidence Intake Agent",
    responsibility: "Stores evidence rows, replaces old evidence safely, creates EvidenceCheck rows, and triggers validation.",
    owns: ["Evidence", "EvidenceCheck pending", "Blob cleanup"],
    input: ["challenge id", "media URL or text", "metadata"],
    output: ["evidence ids", "verification status"],
    canCall: ["evidence_identity_verifier", "outcome_judge"],
    fallback: ["manual_review"],
  },
  {
    id: "evidence_identity_verifier",
    label: "Evidence / Identity Verification Agent",
    responsibility: "Checks protocol compliance, identity confidence, evidence quality, liveness, duration, and anti-cheat flags.",
    owns: ["EvidenceCheck", "identityResult", "evidenceResult"],
    input: ["ProtocolSpecV2", "evidence", "participant bindings"],
    output: ["protocol/evidence/identity gates"],
    canCall: ["outcome_judge", "manual_review"],
    fallback: ["manual_review"],
  },
  {
    id: "outcome_judge",
    label: "Outcome Judge Agent",
    responsibility: "Runs the text, oracle, or vision judge and produces winner, confidence, reasoning, and metrics.",
    owns: ["Judgment", "videoMetrics", "dataSourceTrace"],
    input: ["rules", "evidence", "protocol", "selected provider/model"],
    output: ["winnerId", "confidence", "reasoning", "metrics"],
    canCall: ["settlement_gate", "rejudge_escalation"],
    fallback: ["rejudge_escalation", "manual_review"],
  },
  {
    id: "settlement_gate",
    label: "Settlement Gate Agent",
    responsibility: "Decides whether auto-settlement is allowed after protocol, identity, evidence, outcome, risk, and confidence gates.",
    owns: ["autoSettleEligible", "blockingIssues", "manualReviewRequired"],
    input: ["judgment result", "protocol gates"],
    output: ["settle", "manual review", "void/refund route"],
    canCall: ["credit_settlement", "rejudge_escalation", "manual_review"],
    fallback: ["manual_review"],
  },
  {
    id: "credit_settlement",
    label: "Credit Settlement Agent",
    responsibility: "Moves credits through audited ledger helpers only after the settlement gate passes.",
    owns: ["stake", "win/loss/refund ledger rows", "final terminal status"],
    input: ["eligible verdict", "participants", "stake"],
    output: ["settled/refunded/voided status", "CreditTx rows"],
    canCall: [],
    fallback: ["manual_review"],
  },
  {
    id: "rejudge_escalation",
    label: "Rejudge / Escalation Agent",
    responsibility: "Routes unclear or disputed verdicts to a stronger model, alternate provider, or manual review.",
    owns: ["rejudge reason", "provider/model escalation"],
    input: ["failed verdict", "blocking issues", "requested tier/model"],
    output: ["new judge request", "manual review route"],
    canCall: ["outcome_judge", "manual_review"],
    fallback: ["manual_review"],
  },
  {
    id: "manual_review",
    label: "Manual Review Agent",
    responsibility: "Holds challenges that cannot be auto-settled and preserves the reason for human/operator review.",
    owns: ["manual review status", "blocking issue explanation"],
    input: ["blocking issues", "challenge state"],
    output: ["manual_review_required"],
    canCall: [],
    fallback: [],
  },
];

const NODE_IDS = new Set<AgentNodeId>(AGENT_GRAPH_REGISTRY.map((node) => node.id));

function nowIso() {
  return new Date().toISOString();
}

function compactRoute(route: AgentNodeId[]) {
  return route.filter((id, index) => NODE_IDS.has(id) && route.indexOf(id) === index);
}

function makeTrace(input: {
  routeId: string;
  source: string;
  status?: AgentGraphTrace["status"];
  route: AgentNodeId[];
  blockingReason?: string | null;
  notes?: string[];
  context?: Record<string, unknown>;
}): AgentGraphTrace {
  const route = compactRoute(input.route);
  const currentAgent = route.at(-1) ?? "conversation_host";
  const currentNode = AGENT_GRAPH_REGISTRY.find((node) => node.id === currentAgent);
  return {
    graphVersion: "agent-graph-v1",
    routeId: input.routeId,
    source: input.source,
    status: input.status ?? "planned",
    route,
    currentAgent,
    nextAgents: currentNode?.canCall ?? [],
    blockingReason: input.blockingReason ?? null,
    notes: input.notes ?? [],
    context: input.context ?? {},
    createdAt: nowIso(),
  };
}

function usesVisualEvidence(protocol: ProtocolSpecV2) {
  return protocol.evidenceProtocol.mode === "same_camera_video" ||
    protocol.evidenceProtocol.mode === "separate_video" ||
    protocol.evidenceProtocol.mode === "live_host_video" ||
    protocol.evidenceProtocol.mode === "photo";
}

function usesOracleEvidence(protocol: ProtocolSpecV2) {
  return protocol.evidenceProtocol.mode === "public_oracle" ||
    protocol.evidenceProtocol.mode === "platform_metric" ||
    protocol.settlementProtocol.mode === "auto_oracle";
}

export function agentGraphCatalog() {
  return {
    graphVersion: "agent-graph-v1" as const,
    nodes: AGENT_GRAPH_REGISTRY,
    edges: AGENT_GRAPH_REGISTRY.flatMap((node) =>
      node.canCall.map((target) => ({ from: node.id, to: target })),
    ),
  };
}

export function routeCompiledProtocol(
  protocol: ProtocolSpecV2,
  options: {
    source: string;
    compileSource?: string;
    providerId?: string | null;
    model?: string | null;
    fallbackReason?: string | null;
  },
): AgentGraphTrace {
  const route: AgentNodeId[] = ["conversation_host", "intent_router", "rule_safety"];
  if (usesOracleEvidence(protocol)) route.push("data_source_router");
  route.push("protocol_compiler", "identity_protocol", "evidence_protocol", "settlement_gate");
  if (!protocol.riskPolicy.allowed || protocol.settlementProtocol.mode === "blocked") route.push("manual_review");
  return makeTrace({
    routeId: "compile_protocol",
    source: options.source,
    status: protocol.riskPolicy.allowed ? "executed" : "blocked",
    route,
    blockingReason: protocol.riskPolicy.allowed ? null : protocol.riskPolicy.blockedReason ?? "risk_policy_blocked",
    notes: [
      `participantMode=${protocol.participantMode}`,
      `evidenceMode=${protocol.evidenceProtocol.mode}`,
      `settlementMode=${protocol.settlementProtocol.mode}`,
      ...(options.fallbackReason ? [`compilerFallback=${options.fallbackReason}`] : []),
    ],
    context: {
      title: protocol.title,
      compileSource: options.compileSource ?? null,
      providerId: options.providerId ?? null,
      model: options.model ?? null,
      usesVisualEvidence: usesVisualEvidence(protocol),
      usesOracleEvidence: usesOracleEvidence(protocol),
    },
  });
}

export function routeAgentTurn(input: {
  source: string;
  message: string;
  action: AgentAction;
  toolName: AgentToolName | null;
  draftState: DraftState;
}): AgentGraphTrace {
  if (input.toolName) return routeAgentTool(input.toolName, { source: input.source, draftState: input.draftState });
  const route: AgentNodeId[] = ["conversation_host", "intent_router"];
  if (input.action === "show_draft" || input.draftState.protocol) {
    route.push("rule_safety", "protocol_compiler", "identity_protocol", "evidence_protocol", "settlement_gate");
  } else if (input.action === "refuse_or_redirect") {
    route.push("rule_safety", "manual_review");
  }
  return makeTrace({
    routeId: `agent_turn_${input.action}`,
    source: input.source,
    status: input.action === "refuse_or_redirect" ? "blocked" : "executed",
    route,
    notes: [
      `action=${input.action}`,
      input.toolName ? `tool=${input.toolName}` : "tool=none",
    ],
    context: {
      messagePreview: input.message.slice(0, 160),
      hasProtocol: Boolean(input.draftState.protocol),
      readyToPublish: input.draftState.readyToPublish,
    },
  });
}

export function routeAgentTool(
  toolName: AgentToolName,
  options: {
    source: string;
    draftState?: DraftState;
    toolOk?: boolean;
    toolError?: string | null;
    resultStatus?: string | null;
  },
): AgentGraphTrace {
  const byTool: Record<AgentToolName, { routeId: string; route: AgentNodeId[] }> = {
    updateDraft: {
      routeId: "update_draft",
      route: ["conversation_host", "intent_router"],
    },
    compileProtocol: {
      routeId: "compile_protocol_tool",
      route: ["conversation_host", "intent_router", "rule_safety", "data_source_router", "protocol_compiler", "identity_protocol", "evidence_protocol", "settlement_gate"],
    },
    createChallengeFromProtocol: {
      routeId: "create_challenge_from_protocol",
      route: ["conversation_host", "intent_router", "protocol_compiler", "identity_protocol", "evidence_protocol", "challenge_creator"],
    },
    createChallenge: {
      routeId: "create_challenge",
      route: ["conversation_host", "intent_router", "protocol_compiler", "identity_protocol", "evidence_protocol", "challenge_creator"],
    },
    acceptChallenge: {
      routeId: "accept_challenge",
      route: ["conversation_host", "intent_router", "join_contract", "location_gate"],
    },
    generateShareLink: {
      routeId: "generate_share_link",
      route: ["conversation_host", "challenge_creator", "join_contract"],
    },
    uploadEvidence: {
      routeId: "upload_evidence",
      route: ["conversation_host", "evidence_intake", "evidence_identity_verifier"],
    },
    extractVideoFrames: {
      routeId: "extract_video_frames",
      route: ["conversation_host", "evidence_intake", "evidence_identity_verifier"],
    },
    runVisionJudge: {
      routeId: "run_vision_judge",
      route: ["conversation_host", "evidence_identity_verifier", "outcome_judge", "settlement_gate"],
    },
    confirmVerdict: {
      routeId: "confirm_verdict",
      route: ["conversation_host", "settlement_gate", "credit_settlement"],
    },
    settleCredits: {
      routeId: "settle_credits_blocked",
      route: ["conversation_host", "settlement_gate", "manual_review"],
    },
    findOpenMarkets: {
      routeId: "find_open_markets",
      route: ["conversation_host", "intent_router", "challenge_discovery"],
    },
    matchMe: {
      routeId: "match_me",
      route: ["conversation_host", "intent_router", "challenge_discovery", "join_contract"],
    },
  };
  const entry = byTool[toolName];
  const blocked = options.toolOk === false || Boolean(options.toolError);
  return makeTrace({
    routeId: entry.routeId,
    source: options.source,
    status: blocked ? "needs_review" : "executed",
    route: blocked ? [...entry.route, "manual_review"] : entry.route,
    blockingReason: options.toolError ?? null,
    notes: [
      `tool=${toolName}`,
      options.toolOk === undefined ? "toolStatus=planned" : `toolStatus=${options.toolOk ? "ok" : "error"}`,
      ...(options.resultStatus ? [`resultStatus=${options.resultStatus}`] : []),
    ],
    context: {
      hasProtocol: Boolean(options.draftState?.protocol),
      participantMode: options.draftState?.protocol?.participantMode ?? null,
      evidenceMode: options.draftState?.protocol?.evidenceProtocol.mode ?? null,
      settlementMode: options.draftState?.protocol?.settlementProtocol.mode ?? null,
    },
  });
}

export function routeJudgmentOutcome(input: {
  source: string;
  verdictStatus?: string | null;
  winnerId?: string | null;
  confidence?: number | null;
  recommendation?: string | null;
  autoSettleEligible?: boolean | null;
  blockingIssues?: string[];
}): AgentGraphTrace {
  const eligible = input.autoSettleEligible === true;
  const route: AgentNodeId[] = [
    "evidence_identity_verifier",
    "outcome_judge",
    "settlement_gate",
    ...(eligible ? ["credit_settlement" as const] : ["rejudge_escalation" as const, "manual_review" as const]),
  ];
  return makeTrace({
    routeId: "judge_to_settlement",
    source: input.source,
    status: eligible ? "executed" : "needs_review",
    route,
    blockingReason: eligible ? null : input.blockingIssues?.[0] ?? "settlement_gate_not_eligible",
    notes: [
      `status=${input.verdictStatus ?? "unknown"}`,
      `recommendation=${input.recommendation ?? "unknown"}`,
      `confidence=${input.confidence ?? "unknown"}`,
      `winner=${input.winnerId ? "present" : "missing"}`,
    ],
    context: {
      winnerId: input.winnerId ?? null,
      autoSettleEligible: eligible,
      blockingIssues: input.blockingIssues ?? [],
    },
  });
}
