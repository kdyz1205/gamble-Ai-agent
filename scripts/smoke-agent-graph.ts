import assert from "node:assert/strict";
import {
  AGENT_READINESS,
  agentGraphCatalog,
  routeAgentTool,
  routeCompiledProtocol,
  routeJudgmentOutcome,
  type AgentNodeId,
} from "../src/lib/agent/agent-graph";
import type { ProtocolSpecV2 } from "../src/lib/protocol-spec-v2";

function protocol(overrides: Partial<ProtocolSpecV2> = {}): ProtocolSpecV2 {
  const base: ProtocolSpecV2 = {
    version: "2.0",
    title: "Push-up challenge",
    userFacingSummary: "Two people compete on valid push-up count.",
    rawPrompt: "I bet Jerry I can do more push-ups in one minute.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "count",
    evidenceProtocol: {
      mode: "same_camera_video",
      requiredEvidence: ["Continuous video"],
      captureInstructions: ["Show both participants full body."],
      invalidEvidenceRules: ["Edited or unclear video is invalid."],
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
      startCondition: "After both accept.",
      endCondition: "After 60 seconds.",
      deadline: new Date("2026-05-25T00:00:00.000Z").toISOString(),
      allowedAttempts: "One continuous attempt.",
    },
    settlementProtocol: {
      mode: "auto_ai_vision",
      winCondition: "Highest valid push-up count wins.",
      judgeInstructions: ["Count only valid push-ups."],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Identity unclear.", "Video unclear.", "Tie."],
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
  return { ...base, ...overrides };
}

function includesInOrder(route: AgentNodeId[], expected: AgentNodeId[]) {
  let cursor = 0;
  for (const id of route) {
    if (id === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return false;
}

const catalog = agentGraphCatalog();
assert.ok(catalog.nodes.length >= 18, "agent graph should expose the product agent registry");
assert.equal(catalog.nodes.length, Object.keys(AGENT_READINESS).length, "every graph node must have a readiness entry");
assert.ok(catalog.readinessSummary.production_proven > 0, "some agents should have production proof");
assert.notEqual(catalog.readinessSummary.production_proven, catalog.nodes.length, "do not mark every agent production-proven without E2E proof");
assert.equal(catalog.readinessSummary.graph_only, 0, "no agent should exist only as a graph node");
assert.ok(catalog.readinessSummary.runtime_backed > 0, "non-production-proven agents must remain explicit as runtime-backed");
assert.ok(catalog.edges.some((edge) => edge.from === "settlement_gate" && edge.to === "credit_settlement"));
assert.ok(catalog.edges.some((edge) => edge.from === "settlement_gate" && edge.to === "rejudge_escalation"));
assert.ok(catalog.edges.some((edge) => edge.from === "settlement_gate" && edge.to === "manual_review"));

const compileTrace = routeCompiledProtocol(protocol(), {
  source: "smoke",
  compileSource: "llm",
  providerId: "openai",
  model: "gpt-4o-mini",
});
assert.equal(compileTrace.status, "executed");
assert.ok(includesInOrder(compileTrace.route, ["rule_safety", "protocol_compiler", "identity_protocol", "evidence_protocol", "settlement_gate"]));
assert.equal(compileTrace.context.usesVisualEvidence, true);

const blockedTrace = routeCompiledProtocol(protocol({
  title: "Unsafe challenge",
  riskPolicy: {
    riskLevel: "blocked",
    allowed: false,
    warnings: ["Unsafe"],
    restrictions: [],
    blockedReason: "unsafe_challenge",
  },
  settlementProtocol: {
    mode: "blocked",
    winCondition: "Blocked.",
    judgeInstructions: [],
    autoSettleConfidenceThreshold: 1,
    manualReviewTriggers: ["Blocked by safety."],
  },
}), {
  source: "smoke",
  compileSource: "safety_prefilter",
  providerId: "safety_prefilter",
  model: "rule-safety",
});
assert.equal(blockedTrace.status, "blocked");
assert.equal(blockedTrace.currentAgent, "manual_review");
assert.equal(blockedTrace.blockingReason, "unsafe_challenge");

const visionToolTrace = routeAgentTool("runVisionJudge", {
  source: "smoke",
  toolOk: true,
  resultStatus: "ai_verdict_ready",
});
assert.ok(includesInOrder(visionToolTrace.route, ["evidence_identity_verifier", "outcome_judge", "settlement_gate"]));

const settleTrace = routeJudgmentOutcome({
  source: "smoke",
  verdictStatus: "ai_verdict_ready",
  winnerId: "user_creator",
  confidence: 0.95,
  recommendation: "settle_winner",
  autoSettleEligible: true,
  blockingIssues: [],
});
assert.equal(settleTrace.status, "executed");
assert.equal(settleTrace.currentAgent, "credit_settlement");

const rejudgeTrace = routeJudgmentOutcome({
  source: "smoke",
  verdictStatus: "ai_inconclusive",
  winnerId: null,
  confidence: 0.42,
  recommendation: "needs_review",
  autoSettleEligible: false,
  blockingIssues: ["Participant full body not visible."],
});
assert.equal(rejudgeTrace.status, "needs_review");
assert.ok(rejudgeTrace.route.includes("rejudge_escalation"));
assert.equal(rejudgeTrace.currentAgent, "manual_review");

console.log(JSON.stringify({
  ok: true,
  graphVersion: catalog.graphVersion,
  nodeCount: catalog.nodes.length,
  edgeCount: catalog.edges.length,
  readinessSummary: catalog.readinessSummary,
  compileRoute: compileTrace.route,
  blockedCurrentAgent: blockedTrace.currentAgent,
  settleCurrentAgent: settleTrace.currentAgent,
  rejudgeRoute: rejudgeTrace.route,
}, null, 2));
