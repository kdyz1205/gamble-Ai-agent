import Link from "next/link";
import {
  AGENT_READINESS,
  AGENT_GRAPH_REGISTRY,
  agentGraphCatalog,
  routeAgentTool,
  routeCompiledProtocol,
  routeJudgmentOutcome,
  type AgentGraphTrace,
  type AgentNodeId,
} from "@/lib/agent/agent-graph";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export const metadata = {
  title: "Axelrod Agent Workflow",
  description: "Internal agent graph and routing view for Axelrod challenge protocols.",
};

const nodeById = new Map(AGENT_GRAPH_REGISTRY.map((node) => [node.id, node]));

const lanes: Array<{
  title: string;
  eyebrow: string;
  tone: string;
  nodes: AgentNodeId[];
}> = [
  {
    title: "Prompt to protocol",
    eyebrow: "compile",
    tone: "mint",
    nodes: [
      "conversation_host",
      "intent_router",
      "rule_safety",
      "data_source_router",
      "protocol_compiler",
      "identity_protocol",
      "evidence_protocol",
      "settlement_gate",
    ],
  },
  {
    title: "Protocol to playable challenge",
    eyebrow: "publish + join",
    tone: "sky",
    nodes: [
      "challenge_creator",
      "challenge_discovery",
      "join_contract",
      "location_gate",
      "recording_session",
      "evidence_intake",
    ],
  },
  {
    title: "Evidence to outcome",
    eyebrow: "judge",
    tone: "peach",
    nodes: [
      "evidence_identity_verifier",
      "outcome_judge",
      "settlement_gate",
      "credit_settlement",
    ],
  },
  {
    title: "Unclear verdict loop",
    eyebrow: "fallback",
    tone: "lavender",
    nodes: [
      "settlement_gate",
      "rejudge_escalation",
      "outcome_judge",
      "manual_review",
    ],
  },
];

function exampleProtocol(): ProtocolSpecV2 {
  return {
    version: "2.0",
    title: "Push-up challenge",
    userFacingSummary: "Two players compete on valid push-up count.",
    rawPrompt: "I bet Jerry I can do more push-ups in one minute.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "count",
    evidenceProtocol: {
      mode: "same_camera_video",
      requiredEvidence: ["Continuous same-camera video"],
      captureInstructions: ["Show both people full body, no cuts."],
      invalidEvidenceRules: ["Edited, cropped, or unclear video cannot auto-settle."],
      requiredMetadata: ["recordingSessionId"],
    },
    identityProtocol: {
      mode: "liveness_phrase",
      required: true,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "left", requiredPhrase: "AXEL-1234", requiredQrOrCode: true },
        { role: "opponent", label: "Opponent", expectedPosition: "right", requiredPhrase: "AXEL-5678", requiredQrOrCode: true },
      ],
      autoSettlementRequiresIdentityConfidence: 0.85,
    },
    locationProtocol: {
      mode: "none",
      locationPrivacy: "hidden",
    },
    timingProtocol: {
      startCondition: "After both players accept.",
      endCondition: "After 60 seconds.",
      deadline: "2026-05-25T00:00:00.000Z",
      allowedAttempts: "One continuous attempt.",
    },
    settlementProtocol: {
      mode: "auto_ai_vision",
      winCondition: "Highest valid push-up count wins.",
      judgeInstructions: ["Count only valid reps; require identity and evidence gates first."],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Identity unclear", "Video too short", "Full body not visible", "AI confidence below threshold"],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: [],
      restrictions: ["Internal credits only."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 1200,
      judgeMaxTokens: 1800,
      maxVisionFrames: 8,
      allowEscalation: true,
      estimatedCostTier: "medium",
    },
  };
}

const routeExamples: Array<{ title: string; trigger: string; trace: AgentGraphTrace }> = [
  {
    title: "User prompt becomes ProtocolSpecV2",
    trigger: "POST /api/challenges/compile",
    trace: routeCompiledProtocol(exampleProtocol(), {
      source: "/api/challenges/compile",
      compileSource: "llm",
      providerId: "openai",
      model: "gpt-5.4-mini",
    }),
  },
  {
    title: "Confirmed protocol creates a challenge",
    trigger: "createChallengeFromProtocol tool",
    trace: routeAgentTool("createChallengeFromProtocol", { source: "/api/agent/respond", toolOk: true }),
  },
  {
    title: "Opponent accepts the rule contract",
    trigger: "acceptChallenge tool",
    trace: routeAgentTool("acceptChallenge", { source: "/api/agent/respond", toolOk: true }),
  },
  {
    title: "Video evidence enters validation",
    trigger: "uploadEvidence tool",
    trace: routeAgentTool("uploadEvidence", { source: "/api/agent/respond", toolOk: true }),
  },
  {
    title: "High-confidence verdict settles credits",
    trigger: "POST /api/challenges/:id/judge",
    trace: routeJudgmentOutcome({
      source: "/api/challenges/[id]/judge",
      verdictStatus: "ai_verdict_ready",
      winnerId: "creator",
      confidence: 0.95,
      recommendation: "settle_winner",
      autoSettleEligible: true,
      blockingIssues: [],
    }),
  },
  {
    title: "Unclear verdict routes back",
    trigger: "POST /api/challenges/:id/judge",
    trace: routeJudgmentOutcome({
      source: "/api/challenges/[id]/judge",
      verdictStatus: "ai_inconclusive",
      winnerId: null,
      confidence: 0.52,
      recommendation: "needs_review",
      autoSettleEligible: false,
      blockingIssues: ["Participant full body not visible."],
    }),
  },
];

function toneClass(tone: string) {
  if (tone === "mint") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "peach") return "border-orange-200 bg-orange-50 text-orange-950";
  if (tone === "lavender") return "border-violet-200 bg-violet-50 text-violet-950";
  return "border-sky-200 bg-sky-50 text-sky-950";
}

function readinessClass(status: string) {
  if (status === "production_proven") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "runtime_backed") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "partial") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function readinessLabel(status: string) {
  if (status === "production_proven") return "production proven";
  if (status === "runtime_backed") return "runtime backed";
  if (status === "partial") return "partial";
  return "graph only";
}

function NodePill({ id, index }: { id: AgentNodeId; index?: number }) {
  const node = nodeById.get(id);
  const readiness = AGENT_READINESS[id];
  return (
    <div className="min-w-[160px] flex-1 rounded-[20px] border border-white/80 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex items-center gap-2">
        {typeof index === "number" ? (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-extrabold text-white">
            {index + 1}
          </span>
        ) : null}
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">
          {id.replaceAll("_", " ")}
        </span>
      </div>
      <div className="text-sm font-extrabold text-slate-950">{node?.label ?? id}</div>
      <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${readinessClass(readiness.status)}`}>
        {readinessLabel(readiness.status)}
      </div>
      <div className="mt-2 text-xs font-semibold leading-5 text-slate-600">{node?.output.slice(0, 2).join(" + ")}</div>
    </div>
  );
}

function RouteRail({ route }: { route: AgentNodeId[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {route.map((id, index) => (
        <div key={`${id}-${index}`} className="flex min-w-fit items-center gap-3">
          <NodePill id={id} index={index} />
          {index < route.length - 1 ? (
            <div className="h-[2px] w-10 shrink-0 rounded-full bg-slate-300" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TraceCard({ item }: { item: (typeof routeExamples)[number] }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white/80 p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">{item.trigger}</div>
          <h3 className="mt-1 text-xl font-extrabold text-slate-950">{item.title}</h3>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-700">
          {item.trace.status}
        </div>
      </div>
      <RouteRail route={item.trace.route} />
      <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
        <div>Current: <span className="text-slate-950">{item.trace.currentAgent.replaceAll("_", " ")}</span></div>
        <div>Route: <span className="text-slate-950">{item.trace.routeId}</span></div>
        <div>Block: <span className="text-slate-950">{item.trace.blockingReason ?? "none"}</span></div>
      </div>
    </section>
  );
}

export default function WorkflowPage() {
  const catalog = agentGraphCatalog();

  return (
    <main className="relative z-10 min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <nav className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-extrabold text-slate-700 shadow-sm"
          >
            Back
          </Link>
          <a
            href="/api/agent/graph"
            className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-800 shadow-sm"
          >
            Raw graph JSON
          </a>
        </nav>

        <section className="mb-8 rounded-[32px] border border-white/80 bg-white/75 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.07)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                Axelrod agent graph, not a completion claim
              </div>
              <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight text-slate-950 sm:text-6xl">
                Prompt in. Protocol, evidence, verdict, payout out.
              </h1>
              <p className="mt-5 max-w-3xl text-base font-bold leading-7 text-slate-600">
                This page shows the current routing system and the honest implementation state. Green agents have production proof, blue agents have executable routes/tools, orange agents still need real E2E proof or missing product surfaces.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-slate-200 bg-white p-4">
                <div className="text-3xl font-black text-slate-950">{catalog.nodes.length}</div>
                <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">agents</div>
              </div>
              <div className="rounded-[18px] border border-slate-200 bg-white p-4">
                <div className="text-3xl font-black text-slate-950">{catalog.edges.length}</div>
                <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">calls</div>
              </div>
              <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-3xl font-black text-emerald-800">{catalog.readinessSummary.production_proven}</div>
                <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700">proven</div>
              </div>
              <div className="rounded-[18px] border border-orange-200 bg-orange-50 p-4">
                <div className="text-3xl font-black text-orange-800">{catalog.readinessSummary.partial}</div>
                <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-orange-700">partial</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-[28px] border border-orange-200 bg-orange-50/90 p-5 text-orange-950 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-700">current truth</div>
          <h2 className="mt-2 text-2xl font-black">The graph exists. Several agents are still not fully finished.</h2>
          <p className="mt-2 max-w-4xl text-sm font-bold leading-6 text-orange-900">
            Fully finished means: independent runtime behavior, production or production-equivalent E2E proof, and no hidden manual assumption for that agent. The main unfinished blockers are real-world identity verification, arbitrary real phone video judging, automatic rejudge escalation, and a complete manual-review operator flow.
          </p>
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-4">
          {lanes.map((lane) => (
            <div key={lane.title} className={`rounded-[24px] border p-5 ${toneClass(lane.tone)}`}>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] opacity-70">{lane.eyebrow}</div>
              <h2 className="mt-2 text-xl font-black">{lane.title}</h2>
              <div className="mt-4 flex flex-col gap-2">
                {lane.nodes.map((id, index) => (
                  <div key={id} className="flex items-center gap-3 rounded-[14px] bg-white/70 px-3 py-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-black shadow-sm">
                      {index + 1}
                    </span>
                    <span className="text-sm font-extrabold">{id.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">runtime traces</div>
              <h2 className="mt-2 text-3xl font-black text-slate-950">Actual call chains</h2>
            </div>
            <div className="text-sm font-bold text-slate-500">
              Generated from route functions in <span className="font-mono">src/lib/agent/agent-graph.ts</span>
            </div>
          </div>
          <div className="grid gap-4">
            {routeExamples.map((item) => (
              <TraceCard key={item.title} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/80 bg-white/75 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.07)]">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">agent directory</div>
              <h2 className="mt-2 text-3xl font-black text-slate-950">Who owns what</h2>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AGENT_GRAPH_REGISTRY.map((node) => (
              <article key={node.id} className="rounded-[20px] border border-slate-200 bg-white/85 p-4">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">
                  {node.id.replaceAll("_", " ")}
                </div>
                <h3 className="mt-2 text-lg font-black text-slate-950">{node.label}</h3>
                <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] ${readinessClass(AGENT_READINESS[node.id].status)}`}>
                  {readinessLabel(AGENT_READINESS[node.id].status)}
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{node.responsibility}</p>
                <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{AGENT_READINESS[node.id].summary}</p>
                {AGENT_READINESS[node.id].missing.length ? (
                  <div className="mt-3 rounded-[14px] bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
                    Missing: {AGENT_READINESS[node.id].missing[0]}
                  </div>
                ) : null}
                <div className="mt-3 text-xs font-bold text-slate-500">
                  Calls: {node.canCall.length ? node.canCall.map((id) => id.replaceAll("_", " ")).join(", ") : "terminal"}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
