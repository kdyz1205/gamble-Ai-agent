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

export type AgentReadinessStatus = "production_proven" | "runtime_backed" | "partial" | "graph_only";

export type AgentReadiness = {
  status: AgentReadinessStatus;
  summary: string;
  evidence: string[];
  missing: string[];
  nextProof: string;
};

export const AGENT_READINESS: Record<AgentNodeId, AgentReadiness> = {
  conversation_host: {
    status: "production_proven",
    summary: "Production agent flows prove the respond route can compile, publish, upload evidence, judge, confirm, and return graph traces from user messages.",
    evidence: ["src/app/api/agent/respond/route.ts", "src/lib/agent/orchestrator.ts", "scripts/e2e-agent-compile-publish.mjs", "scripts/e2e-agent-golden-path.mjs", ".github/workflows/production-agent-protocol-chain.yml"],
    missing: ["Still not a long-running independent background process; it is a request/response agent host with tool execution."],
    nextProof: "Add browser-level proof that the visible homepage chat executes the same API path end to end.",
  },
  intent_router: {
    status: "production_proven",
    summary: "Production agent-chain E2E proves routing for compile, publish, join contract guard, binding, recording session, evidence upload, identity verification, judge, confirm, review, and rejudge turns.",
    evidence: ["src/lib/agent/intent-router.ts", "src/app/api/agent/respond/route.ts", "scripts/smoke-agent-intent-router.ts", "scripts/e2e-agent-tool-guardrails.mjs", "scripts/e2e-agent-golden-path.mjs"],
    missing: ["No broad multilingual voice-transcript confusion matrix over real user traffic yet."],
    nextProof: "Run production prompt replay for Chinese/English speech transcripts across compile, publish, join, evidence, judge, discovery, and support prompts.",
  },
  rule_safety: {
    status: "production_proven",
    summary: "Rule safety has a production E2E prefilter proof for alcohol, violence, non-consensual recording, chance/cash, and illegal-account prompts before any paid LLM call.",
    evidence: ["src/lib/rule-safety.ts", "src/lib/protocol-compiler.ts", "scripts/smoke-rule-safety.ts", "scripts/e2e-rule-safety-production.mjs", ".github/workflows/production-agent-protocol-chain.yml"],
    missing: ["No large adversarial multilingual red-team run in production telemetry."],
    nextProof: "Broaden the production prompt replay with Chinese, slang, legal-region cash policy, safe alternatives, and jailbreak-style edge cases.",
  },
  data_source_router: {
    status: "production_proven",
    summary: "Production oracle E2E proves live npm Registry fetching can route into an oracle verdict, produce a winner, confirm settlement, and write stake/loss/win ledger rows.",
    evidence: ["src/lib/data-source-registry.ts", "src/app/api/data-sources/[sourceKey]/run/route.ts", "scripts/smoke-data-source-registry.ts", "scripts/smoke-data-source-judge-router.ts", "scripts/e2e-data-source-oracle-settlement.mjs", ".github/workflows/production-agent-protocol-chain.yml"],
    missing: ["Only implemented public adapters are production-proven; many cataloged or future sources still need OAuth, API keys, provider contracts, document AI, or manual review before auto-settlement."],
    nextProof: "Broaden production oracle probes across crypto, weather, npm, GitHub, and one user-authorized source with adapter-specific settlement assertions.",
  },
  protocol_compiler: {
    status: "production_proven",
    summary: "Production compile matrix proves real selected-provider calls for solo pet, counterparty pet, same-camera, random Chinese, mass-crowd leaderboard, nearby photo, and deterministic BTC oracle protocols.",
    evidence: ["src/app/api/challenges/compile/route.ts", "src/lib/protocol-compiler.ts", "scripts/e2e-protocol-compile-matrix.mjs", ".github/workflows/production-agent-protocol-chain.yml"],
    missing: ["No proof that every possible weird prompt compiles correctly; coverage is representative, not exhaustive."],
    nextProof: "Expand production compile fixtures with more Chinese speech, slang, team modes, receipts, screenshots, GPS, and oracle prompts.",
  },
  identity_protocol: {
    status: "production_proven",
    summary: "Production same-camera guardrail E2E proves participant bindings, liveness codes, expected positions, and agent-issued identity instructions are created and returned.",
    evidence: ["prisma/schema.prisma:ParticipantBinding", "src/app/api/challenges/[id]/bindings/issue/route.ts", "scripts/smoke-identity-evidence-gates.ts", "scripts/e2e-agent-tool-guardrails.mjs"],
    missing: ["No stable real phone video proof that AI visually detects spoken/shown liveness phrase plus left/right identity."],
    nextProof: "Run same-camera real video E2E where visual identity must pass before judgment can settle.",
  },
  evidence_protocol: {
    status: "production_proven",
    summary: "Production chain proves evidence protocols for same-camera recording requirements, text-answer evidence, generated video evidence, GPS/oracle style settlement paths, and shared-evidence row creation.",
    evidence: ["ProtocolSpecV2.evidenceProtocol", "src/app/api/challenges/[id]/evidence/route.ts", "scripts/e2e-agent-tool-guardrails.mjs", "scripts/e2e-agent-golden-path.mjs", "scripts/e2e-real-video-robustness.mjs"],
    missing: ["Not every evidence mode has a polished guided capture UI and production E2E."],
    nextProof: "Run mode-specific browser E2E for same-camera video, separate video, screenshot, GPS, receipt, and public oracle.",
  },
  challenge_creator: {
    status: "production_proven",
    summary: "Challenge creation from protocol is backed by API/tool code and has been exercised in production E2E paths.",
    evidence: ["src/app/api/challenges/route.ts", "src/lib/agent/tools.ts:createChallengeTool"],
    missing: ["Mass-crowd event path still has separate maturity requirements."],
    nextProof: "Keep no-regression coverage for create -> join -> evidence -> judge -> settle.",
  },
  challenge_discovery: {
    status: "runtime_backed",
    summary: "Nearby/open discovery routes exist and sort/filter challenges; production robustness still depends on location UX.",
    evidence: ["src/app/api/challenges/discover/route.ts", "src/app/api/map/challenges/route.ts", "src/app/radar/page.tsx"],
    missing: ["No full two-device nearby location proof in the latest run."],
    nextProof: "Run two-account nearby challenge creation and join from current GPS snapshots.",
  },
  join_contract: {
    status: "production_proven",
    summary: "Production guardrail E2E proves agent join attempts cannot accept without the rule contract, and explicit accept opens the evidence window.",
    evidence: ["src/app/join/[id]/page.tsx", "src/app/api/challenges/[id]/accept/route.ts", "scripts/e2e-agent-tool-guardrails.mjs", "scripts/e2e-agent-golden-path.mjs"],
    missing: ["Needs repeated browser proof for invite-link and nearby-discovery joins after UI changes."],
    nextProof: "Run browser/incognito join-link E2E: open /join/:id, accept rules, verify evidence_window_open.",
  },
  location_gate: {
    status: "runtime_backed",
    summary: "Location eligibility is a shared gate used by join routes/tools and supports outside-radius rejection plus inside-radius acceptance.",
    evidence: ["src/lib/location-eligibility.ts", "src/app/api/challenges/[id]/check-location-eligibility/route.ts", "src/app/api/map/ping/route.ts", "scripts/smoke-location-gate.ts"],
    missing: ["No latest two-device production proof for walk-to-join/same-place-required challenges."],
    nextProof: "Create walk-to-join challenge and prove outside-radius reject plus inside-radius accept.",
  },
  recording_session: {
    status: "production_proven",
    summary: "Production agent-tool E2E proves same-camera recording sessions start, persist mode/pre-roll protocol, and return participant binding codes used by evidence upload.",
    evidence: ["src/lib/recording-session-protocol.ts", "src/app/api/challenges/[id]/recording-session/start/route.ts", "prisma/schema.prisma:RecordingSession", "scripts/smoke-recording-session.ts", "scripts/e2e-agent-tool-guardrails.mjs"],
    missing: ["Black-screen recording/camera fallback and full guided same-camera flow still need real browser/device proof."],
    nextProof: "Run mobile browser recording session: camera opens, captures, uploads, and stores recordingSessionId.",
  },
  evidence_intake: {
    status: "production_proven",
    summary: "Evidence upload/storage path is backed by routes, Blob handling, cleanup, and production video fixture proof.",
    evidence: ["src/app/api/challenges/[id]/evidence/route.ts", "src/app/api/uploads/evidence-presign/route.ts"],
    missing: ["Arbitrary real phone media robustness still needs the next E2E suite."],
    nextProof: "Run real-video robustness suite without labels and with unclear/invalid cases.",
  },
  evidence_identity_verifier: {
    status: "production_proven",
    summary: "Production same-camera guardrail E2E proves EvidenceCheck rows and identity verification pass when required recording session, liveness codes, and expected positions are supplied.",
    evidence: ["src/app/api/challenges/[id]/evidence/[evidenceId]/verify-identity/route.ts", "prisma/schema.prisma:EvidenceCheck", "scripts/smoke-identity-evidence-gates.ts", "scripts/e2e-agent-tool-guardrails.mjs"],
    missing: ["No proven automatic liveness/position/QR detection gate on real videos."],
    nextProof: "Add and pass identity verifier E2E with pass, unclear, wrong-side, and missing-phrase clips.",
  },
  outcome_judge: {
    status: "runtime_backed",
    summary: "Text, oracle, and vision judge paths exist; production robustness now covers labeled and unlabeled generated phone-style video fixtures, but arbitrary real human phone video is not proven.",
    evidence: ["src/app/api/challenges/[id]/judge/route.ts", "src/lib/ai-engine.ts", "scripts/e2e-real-video-robustness.mjs", ".github/workflows/production-video-robustness.yml"],
    missing: ["No reliable proof that arbitrary real human push-up videos are counted correctly across real-world bodies, angles, lighting, and camera motion."],
    nextProof: "Run a real-human phone footage suite: clean, bad angle, cropped, low light, tie, non-push-up, and looped media with no answer labels.",
  },
  settlement_gate: {
    status: "production_proven",
    summary: "Settlement now depends on recommendation, confidence, evidence quality, and protocol gates before credits move.",
    evidence: ["src/lib/judgment-policy.ts", "src/lib/protocol-judgment-policy.ts", "src/app/api/challenges/[id]/judge/route.ts"],
    missing: ["Needs regression tests around every failure state and rejudge branch."],
    nextProof: "Run no-settle tests for low confidence, bad evidence, identity failure, and missing winnerId.",
  },
  credit_settlement: {
    status: "production_proven",
    summary: "Ledger settlement/refund helpers exist and production proof has shown winnerSettled=true for controlled paths.",
    evidence: ["src/lib/credits.ts:settleChallenge", "src/app/api/challenges/[id]/confirm-verdict/route.ts"],
    missing: ["Still needs broad idempotency/retry tests across manual resolve, cancel, confirm, and judge routes."],
    nextProof: "Run duplicate-confirm and retry settlement tests that prove no double payout.",
  },
  rejudge_escalation: {
    status: "production_proven",
    summary: "Rejudge escalation has production proof for explicit retry from a Light judge call to a stronger Pro model, separate AI judge ledger rows, no provider fallback refund, and manual-review stop after max attempts.",
    evidence: ["src/lib/rejudge-escalation.ts", "src/app/api/challenges/[id]/judge/route.ts rejudge routing", "scripts/smoke-rejudge-escalation.ts", "scripts/e2e-rejudge-verdict.mjs", ".github/workflows/production-agent-protocol-chain.yml"],
    missing: ["No production proof yet for an unclear real video rejudge that escalates vision models/providers before manual review."],
    nextProof: "Run a video rejudge E2E: unclear vision verdict -> explicit rejudge -> stronger vision model/provider -> settled or manual_review_required with audit trace.",
  },
  manual_review: {
    status: "production_proven",
    summary: "Manual review has dispute, queue, resolve, duplicate-resolution guard, and production ledger proof for overriding an AI verdict into a settled winner.",
    evidence: ["src/lib/manual-review-policy.ts", "src/app/api/manual-review/queue/route.ts", "src/app/manual-review/page.tsx", "src/app/api/challenges/[id]/manual-resolve/route.ts", "src/app/api/challenges/[id]/dispute/route.ts", "scripts/e2e-manual-review-resolution.mjs"],
    missing: ["No reviewer assignment, SLA, appeal flow, or multi-reviewer audit workflow."],
    nextProof: "Add reviewer assignment/SLA/appeal proof after the MVP manual override path remains stable.",
  },
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
    protocol.settlementProtocol.mode === "auto_oracle";
}

export function agentGraphCatalog() {
  const readinessSummary = agentReadinessSummary();
  return {
    graphVersion: "agent-graph-v1" as const,
    nodes: AGENT_GRAPH_REGISTRY.map((node) => ({
      ...node,
      readiness: AGENT_READINESS[node.id],
    })),
    edges: AGENT_GRAPH_REGISTRY.flatMap((node) =>
      node.canCall.map((target) => ({ from: node.id, to: target })),
    ),
    readinessSummary,
  };
}

export function agentReadinessSummary() {
  const initial: Record<AgentReadinessStatus, number> = {
    production_proven: 0,
    runtime_backed: 0,
    partial: 0,
    graph_only: 0,
  };
  return Object.values(AGENT_READINESS).reduce((acc, readiness) => {
    acc[readiness.status] += 1;
    return acc;
  }, initial);
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
    issueParticipantBinding: {
      routeId: "issue_participant_binding",
      route: ["conversation_host", "identity_protocol", "join_contract"],
    },
    acceptChallenge: {
      routeId: "accept_challenge",
      route: ["conversation_host", "intent_router", "join_contract", "location_gate"],
    },
    startRecordingSession: {
      routeId: "start_recording_session",
      route: ["conversation_host", "identity_protocol", "recording_session"],
    },
    generateShareLink: {
      routeId: "generate_share_link",
      route: ["conversation_host", "challenge_creator", "join_contract"],
    },
    uploadEvidence: {
      routeId: "upload_evidence",
      route: ["conversation_host", "evidence_intake", "evidence_identity_verifier"],
    },
    verifyIdentity: {
      routeId: "verify_identity",
      route: ["conversation_host", "evidence_identity_verifier", "settlement_gate"],
    },
    extractVideoFrames: {
      routeId: "extract_video_frames",
      route: ["conversation_host", "evidence_intake", "evidence_identity_verifier"],
    },
    runProtocolJudge: {
      routeId: "run_protocol_judge",
      route: ["conversation_host", "evidence_identity_verifier", "outcome_judge", "settlement_gate"],
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
  rejudgePlan?: unknown;
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
      rejudgePlan: input.rejudgePlan ?? null,
    },
  });
}
