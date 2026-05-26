import assert from "node:assert/strict";
import { planRejudgeEscalation } from "../src/lib/rejudge-escalation";

const configuredProviderIds = ["openai", "anthropic", "google", "local_ollama"];

const lowConfidencePlan = planRejudgeEscalation({
  verdict: {
    status: "manual_review_required",
    winnerId: "user_creator",
    confidence: 0.72,
    evidenceQuality: "unclear",
    recommendation: "needs_review",
    source: "vision_llm",
    autoSettleEligible: false,
    blockingIssues: ["Confidence 72% is below the 85% settlement threshold."],
  },
  currentProviderId: "openai",
  currentModel: "gpt-5.4-mini",
  needsVision: true,
  attemptCount: 1,
  configuredProviderIds,
});
assert.equal(lowConfidencePlan.action, "retry_stronger_model");
assert.equal(lowConfidencePlan.shouldRunRejudge, true);
assert.equal(lowConfidencePlan.nextProviderId, "openai");
assert.equal(lowConfidencePlan.nextModel, "gpt-5.5");

const fallbackPlan = planRejudgeEscalation({
  verdict: {
    status: "ai_inconclusive",
    winnerId: null,
    confidence: 0.4,
    evidenceQuality: "unclear",
    recommendation: "needs_review",
    source: "fallback",
    autoSettleEligible: false,
    blockingIssues: ["AI judge returned malformed JSON or provider call failed."],
  },
  currentProviderId: "local_ollama",
  currentModel: "llama4:latest",
  needsVision: true,
  attemptCount: 1,
  configuredProviderIds,
});
assert.equal(fallbackPlan.shouldRunRejudge, true);
assert.ok(fallbackPlan.nextProviderId === "local_ollama" || fallbackPlan.nextProviderId === "openai");

const hardFailurePlan = planRejudgeEscalation({
  verdict: {
    status: "manual_review_required",
    winnerId: "user_creator",
    confidence: 0.91,
    evidenceQuality: "invalid",
    recommendation: "invalid_evidence",
    source: "vision_llm",
    autoSettleEligible: false,
    blockingIssues: ["Participant B full body is not visible enough."],
  },
  currentProviderId: "openai",
  currentModel: "gpt-5.5",
  needsVision: true,
  attemptCount: 1,
  configuredProviderIds,
});
assert.equal(hardFailurePlan.action, "manual_review");
assert.equal(hardFailurePlan.shouldRunRejudge, false);
assert.equal(hardFailurePlan.reason, "invalid_evidence");

const maxAttemptsPlan = planRejudgeEscalation({
  verdict: {
    status: "manual_review_required",
    winnerId: "user_creator",
    confidence: 0.73,
    evidenceQuality: "unclear",
    recommendation: "needs_review",
    source: "vision_llm",
    autoSettleEligible: false,
    blockingIssues: ["Confidence 73% is below the 85% settlement threshold."],
  },
  currentProviderId: "openai",
  currentModel: "gpt-5.4-mini",
  needsVision: true,
  attemptCount: 2,
  maxAttempts: 2,
  configuredProviderIds,
});
assert.equal(maxAttemptsPlan.action, "manual_review");
assert.equal(maxAttemptsPlan.reason, "max_rejudge_attempts_reached");

const eligiblePlan = planRejudgeEscalation({
  verdict: {
    status: "ai_verdict_ready",
    winnerId: "user_creator",
    confidence: 0.95,
    evidenceQuality: "good",
    recommendation: "settle_winner",
    source: "vision_llm",
    autoSettleEligible: true,
    blockingIssues: [],
  },
  currentProviderId: "openai",
  currentModel: "gpt-5.5",
  needsVision: true,
  attemptCount: 1,
  configuredProviderIds,
});
assert.equal(eligiblePlan.action, "none");
assert.equal(eligiblePlan.shouldRunRejudge, false);

console.log(JSON.stringify({
  ok: true,
  lowConfidence: {
    action: lowConfidencePlan.action,
    nextProviderId: lowConfidencePlan.nextProviderId,
    nextModel: lowConfidencePlan.nextModel,
  },
  fallback: {
    action: fallbackPlan.action,
    nextProviderId: fallbackPlan.nextProviderId,
    nextModel: fallbackPlan.nextModel,
  },
  hardFailure: {
    action: hardFailurePlan.action,
    reason: hardFailurePlan.reason,
  },
  maxAttempts: {
    action: maxAttemptsPlan.action,
    reason: maxAttemptsPlan.reason,
  },
  eligible: {
    action: eligiblePlan.action,
  },
}, null, 2));
