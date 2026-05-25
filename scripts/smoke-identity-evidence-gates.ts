import assert from "node:assert/strict";
import { evaluateProtocolEvidencePayload } from "../src/lib/protocol-evidence-verification";
import { evaluateProtocolJudgmentGates } from "../src/lib/protocol-judgment-policy";
import type { JudgmentResult, VideoJudgmentParticipantMetrics } from "../src/lib/ai-engine";
import type { ProtocolSpecV2 } from "../src/lib/protocol-spec-v2";

function protocol(): ProtocolSpecV2 {
  return {
    version: "2.0",
    title: "Same-camera push-up challenge",
    userFacingSummary: "Creator and opponent compete in one continuous same-camera video.",
    rawPrompt: "I bet Jerry I can do more push-ups in one minute.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "count",
    evidenceProtocol: {
      mode: "same_camera_video",
      requiredEvidence: ["Continuous same-camera video"],
      captureInstructions: ["Creator stands left.", "Opponent stands right.", "Both show full body."],
      invalidEvidenceRules: ["Missing liveness code.", "Edited video.", "Only one participant visible."],
      requiredMetadata: ["recordingSessionId", "fileSizeBytes"],
    },
    identityProtocol: {
      mode: "liveness_phrase",
      required: true,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "left", requiredPhrase: "AXEL-CREATOR", requiredQrOrCode: true },
        { role: "opponent", label: "Opponent", expectedPosition: "right", requiredPhrase: "AXEL-OPPONENT", requiredQrOrCode: true },
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
      deadline: "2026-05-25T00:00:00.000Z",
      allowedAttempts: "One continuous attempt.",
    },
    settlementProtocol: {
      mode: "auto_ai_vision",
      winCondition: "Highest valid push-up count wins.",
      judgeInstructions: ["Verify identity first, then count valid reps."],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Identity unclear.", "Evidence unclear.", "Tie."],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: [],
      restrictions: ["Internal credits only."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 1000,
      judgeMaxTokens: 1800,
      maxVisionFrames: 8,
      allowEscalation: true,
      estimatedCostTier: "medium",
    },
  };
}

const creatorBinding = {
  bindingStatus: "pending",
  expectedPosition: "left",
  livenessCode: "AXEL-CREATOR",
  identityConfidence: null,
};

function participantMetrics(position: "left" | "right", count: number): VideoJudgmentParticipantMetrics {
  return {
    validRepCount: count,
    invalidRepNotes: [],
    observedPosition: position,
    fullDurationCovered: true,
    livenessPhraseVisible: true,
    fullBodyVisible: true,
    continuousAttemptLikely: true,
    videoTooShort: false,
    suspectedEditingOrLoop: false,
    antiCheatFlags: [],
  };
}

const exactCreator = evaluateProtocolEvidencePayload({
  protocol: protocol(),
  binding: creatorBinding,
  challengeLivenessPrompt: null,
  type: "video",
  url: "https://example.com/proof.mp4",
  description: "Creator says AXEL-CREATOR and stands on the left.",
  metadata: {
    recordingSessionId: "rec_123",
    observedPosition: "left",
    fileSizeBytes: 12345,
  },
});
assert.equal(exactCreator.decision, "passed");
assert.equal(exactCreator.identityCheck.passed, true);

const fakeLiveness = evaluateProtocolEvidencePayload({
  protocol: protocol(),
  binding: creatorBinding,
  challengeLivenessPrompt: null,
  type: "video",
  url: "https://example.com/proof.mp4",
  description: "Creator says a random phrase.",
  metadata: {
    recordingSessionId: "rec_123",
    livenessPhrase: "random phrase",
    observedPosition: "left",
    fileSizeBytes: 12345,
  },
});
assert.equal(fakeLiveness.decision, "needs_review");
assert.equal(fakeLiveness.identityCheck.passed, false);
assert.ok(fakeLiveness.blockingIssues.some((issue) => /exact assigned liveness code/i.test(issue)));

const visionResult: JudgmentResult = {
  winnerId: "creator_user",
  reasoning: "Creator completed more valid reps and both people passed visual identity/evidence checks.",
  confidence: 0.95,
  evidenceQuality: "good",
  recommendation: "settle_winner",
  source: "vision_llm",
  videoMetrics: {
    participantA: participantMetrics("left", 12),
    participantB: participantMetrics("right", 6),
    validRepDefinition: "Full lockout and controlled descent.",
    framesInspected: 8,
    judgingMethod: "vision_llm",
  },
};

const gates = evaluateProtocolJudgmentGates({
  protocol: protocol(),
  participants: [
    { userId: "creator_user", role: "creator", status: "accepted" },
    { userId: "opponent_user", role: "opponent", status: "accepted" },
  ],
  participantBindings: [
    { userId: "creator_user", role: "creator", expectedPosition: "left", livenessCode: "AXEL-CREATOR", qrTokenHash: null, bindingStatus: "pending", identityConfidence: null },
    { userId: "opponent_user", role: "opponent", expectedPosition: "right", livenessCode: "AXEL-OPPONENT", qrTokenHash: null, bindingStatus: "pending", identityConfidence: null },
  ],
  evidence: [
    { userId: "creator_user", type: "video", url: "https://example.com/proof.mp4", description: "shared same-camera proof" },
    { userId: "opponent_user", type: "video", url: "https://example.com/proof.mp4", description: "shared same-camera proof" },
  ],
  evidenceChecks: [
    {
      userId: "creator_user",
      decision: fakeLiveness.decision,
      identityConfidence: fakeLiveness.identityCheck.confidence,
      evidenceConfidence: fakeLiveness.evidenceCheck.confidence,
      blockingIssues: JSON.stringify(fakeLiveness.blockingIssues),
    },
    {
      userId: "opponent_user",
      decision: "needs_review",
      identityConfidence: 0.5,
      evidenceConfidence: 1,
      blockingIssues: JSON.stringify(["Visual verification required: exact liveness code was not confirmed in evidence metadata/description."]),
    },
  ],
  result: visionResult,
});
assert.equal(gates.protocolCompliance.passed, true);
assert.equal(gates.identityResult.passed, true);
assert.equal(gates.evidenceResult.passed, true);
assert.equal(gates.settlementEligibility.eligible, true);

const badVisionGates = evaluateProtocolJudgmentGates({
  protocol: protocol(),
  participants: [
    { userId: "creator_user", role: "creator", status: "accepted" },
    { userId: "opponent_user", role: "opponent", status: "accepted" },
  ],
  participantBindings: [
    { userId: "creator_user", role: "creator", expectedPosition: "left", livenessCode: "AXEL-CREATOR", qrTokenHash: null, bindingStatus: "pending", identityConfidence: null },
    { userId: "opponent_user", role: "opponent", expectedPosition: "right", livenessCode: "AXEL-OPPONENT", qrTokenHash: null, bindingStatus: "pending", identityConfidence: null },
  ],
  evidence: [
    { userId: "creator_user", type: "video", url: "https://example.com/proof.mp4", description: "shared same-camera proof" },
    { userId: "opponent_user", type: "video", url: "https://example.com/proof.mp4", description: "shared same-camera proof" },
  ],
  evidenceChecks: [],
  result: {
    ...visionResult,
    videoMetrics: {
      ...visionResult.videoMetrics!,
      participantB: {
        ...participantMetrics("right", 6),
        fullBodyVisible: false,
      },
    },
  },
});
assert.equal(badVisionGates.settlementEligibility.eligible, false);
assert.ok(badVisionGates.blockingIssues.some((issue) => /full body/i.test(issue)));

const soloPlatformMetricProtocol: ProtocolSpecV2 = {
  ...protocol(),
  title: "Solo platform metric proof",
  userFacingSummary: "Creator proves a solo objective claim without an opponent.",
  rawPrompt: "I bet my cat can finish the food under one minute.",
  participantMode: "solo",
  outcomeType: "threshold",
  evidenceProtocol: {
    mode: "platform_metric",
    requiredEvidence: ["Submit structured text proof with ANSWER."],
    captureInstructions: ["Submit one proof row before judging."],
    invalidEvidenceRules: ["Missing answer is invalid."],
    requiredMetadata: ["answer"],
  },
  identityProtocol: {
    mode: "account_only",
    required: false,
    participantBindings: [
      { role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false },
    ],
    autoSettlementRequiresIdentityConfidence: 1,
  },
  settlementProtocol: {
    mode: "auto_ai_text",
    winCondition: "If the creator submits the expected answer, the solo claim passes.",
    judgeInstructions: ["Read the answer from the evidence metadata or text."],
    autoSettleConfidenceThreshold: 0.85,
    manualReviewTriggers: ["Answer is missing or does not match."],
  },
};

const soloPlatformMetricGates = evaluateProtocolJudgmentGates({
  protocol: soloPlatformMetricProtocol,
  participants: [
    { userId: "creator_user", role: "creator", status: "accepted" },
  ],
  participantBindings: [],
  evidence: [
    { userId: "creator_user", type: "text", url: null, description: "ANSWER: SOLO-PASS" },
  ],
  evidenceChecks: [
    {
      userId: "creator_user",
      decision: "passed",
      identityConfidence: 1,
      evidenceConfidence: 1,
      blockingIssues: null,
    },
  ],
  result: {
    winnerId: "creator_user",
    reasoning: "Creator submitted the expected answer, so the solo claim passed.",
    confidence: 0.99,
    evidenceQuality: "good",
    recommendation: "settle_winner",
    settlementRecommendation: "settle_winner",
    source: "deterministic",
  },
});
assert.equal(soloPlatformMetricGates.protocolCompliance.passed, true);
assert.equal(soloPlatformMetricGates.identityResult.passed, true);
assert.equal(soloPlatformMetricGates.evidenceResult.passed, true);
assert.equal(soloPlatformMetricGates.settlementEligibility.eligible, true);

console.log(JSON.stringify({
  ok: true,
  exactCodeDecision: exactCreator.decision,
  fakeLivenessDecision: fakeLiveness.decision,
  visionResolvedSoftPrecheck: gates.settlementEligibility.eligible,
  badVisionEligible: badVisionGates.settlementEligibility.eligible,
  badVisionIssue: badVisionGates.blockingIssues[0],
  soloPlatformMetricEligible: soloPlatformMetricGates.settlementEligibility.eligible,
}, null, 2));
