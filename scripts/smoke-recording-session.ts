import assert from "node:assert/strict";
import {
  buildPreRollInstructions,
  buildRecordingSessionProtocolJson,
  recordingModeForProtocol,
} from "../src/lib/recording-session-protocol";
import type { ProtocolSpecV2 } from "../src/lib/protocol-spec-v2";

const protocol: ProtocolSpecV2 = {
  version: "2.0",
  title: "Same-camera push-up challenge",
  userFacingSummary: "Two participants record together.",
  rawPrompt: "I bet Jerry I can do 10 pushups faster.",
  language: "en",
  participantMode: "head_to_head",
  outcomeType: "speed",
  evidenceProtocol: {
    mode: "same_camera_video",
    requiredEvidence: ["Continuous same-camera video"],
    captureInstructions: ["Show both participants from head to toe."],
    invalidEvidenceRules: ["No cuts, crops, or missing bodies."],
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
    startCondition: "After the countdown.",
    endCondition: "After 60 seconds.",
    deadline: "2026-05-25T00:00:00.000Z",
    allowedAttempts: "One continuous recording.",
  },
  settlementProtocol: {
    mode: "auto_ai_vision",
    winCondition: "Fastest valid completion wins.",
    judgeInstructions: ["Verify identity and count valid reps."],
    autoSettleConfidenceThreshold: 0.85,
    manualReviewTriggers: ["Identity unclear.", "Video unclear."],
  },
  riskPolicy: {
    riskLevel: "safe",
    allowed: true,
    warnings: [],
    restrictions: ["Internal credits only."],
  },
  aiBudgetPolicy: {
    compileMaxTokens: 0,
    judgeMaxTokens: 1200,
    maxVisionFrames: 8,
    allowEscalation: true,
    estimatedCostTier: "medium",
  },
};

const sameCameraMode = recordingModeForProtocol(protocol, undefined);
assert.equal(sameCameraMode, "same_camera_video");
const sameCameraInstructions = buildPreRollInstructions(protocol, sameCameraMode);
assert.ok(sameCameraInstructions.some((line) => /creator stands left/i.test(line)));
assert.ok(sameCameraInstructions.some((line) => /liveness code/i.test(line)));
assert.ok(sameCameraInstructions.some((line) => /head to toe/i.test(line)));

const separateMode = recordingModeForProtocol(protocol, "separate_video");
assert.equal(separateMode, "separate_video");
const separateInstructions = buildPreRollInstructions(protocol, separateMode);
assert.ok(separateInstructions.some((line) => /show your face/i.test(line)));
assert.ok(!separateInstructions.some((line) => /creator stands left/i.test(line)));

const notVideoProtocol = {
  ...protocol,
  evidenceProtocol: {
    ...protocol.evidenceProtocol,
    mode: "photo" as const,
  },
};
assert.equal(recordingModeForProtocol(notVideoProtocol, undefined), null);

const protocolJson = buildRecordingSessionProtocolJson({
  protocol,
  mode: "same_camera_video",
  startedByUserId: "user_creator",
  participantBindings: [
    {
      userId: "user_creator",
      displayName: "Creator",
      expectedPosition: "left",
      livenessCode: "AXEL-1234",
      role: "creator",
      bindingStatus: "pending",
    },
    {
      userId: "user_opponent",
      displayName: "Opponent",
      expectedPosition: "right",
      livenessCode: "AXEL-5678",
      role: "opponent",
      bindingStatus: "pending",
    },
  ],
});
const parsed = JSON.parse(protocolJson);
assert.equal(parsed.mode, "same_camera_video");
assert.equal(parsed.participantBindings.length, 2);
assert.equal(parsed.participantBindings[0].expectedPosition, "left");

console.log(JSON.stringify({
  ok: true,
  sameCameraMode,
  sameCameraInstructions,
  separateInstructions,
  participantBindingCount: parsed.participantBindings.length,
}, null, 2));
