import { ChallengeStatus } from "./enums";
import type { JudgmentResult, VideoJudgmentParticipantMetrics } from "./ai-engine";

export type VerdictStatus =
  | typeof ChallengeStatus.ai_verdict_ready
  | typeof ChallengeStatus.ai_inconclusive
  | typeof ChallengeStatus.manual_review_required;

export interface JudgmentPolicyOptions {
  requiresVision?: boolean;
}

export interface AutoSettlePolicyResult {
  eligible: boolean;
  reason: string | null;
}

function evidenceQuality(result: JudgmentResult): "good" | "unclear" | "invalid" {
  if (result.evidenceQuality) return result.evidenceQuality;
  if (result.winnerId && result.confidence >= 0.85) return "good";
  if (result.confidence >= 0.6) return "unclear";
  return "invalid";
}

function settlementRecommendation(result: JudgmentResult): "settle_winner" | "refund" | "manual_review" {
  if (result.settlementRecommendation) return result.settlementRecommendation;
  if (result.winnerId && result.confidence >= 0.85) return "settle_winner";
  if (!result.winnerId && result.confidence < 0.6) return "refund";
  return "manual_review";
}

function participantAutoSettleBlock(
  label: string,
  metrics: VideoJudgmentParticipantMetrics | undefined,
): string | null {
  if (!metrics) return `${label}_metrics_missing`;
  if (metrics.fullDurationCovered !== true) return `${label}_duration_not_covered`;
  if (metrics.fullBodyVisible !== true) return `${label}_full_body_not_visible`;
  if (metrics.livenessPhraseVisible !== true) return `${label}_liveness_phrase_missing`;
  if (metrics.continuousAttemptLikely !== true) return `${label}_continuous_attempt_unclear`;
  if (metrics.videoTooShort === true) return `${label}_video_too_short`;
  if (metrics.suspectedEditingOrLoop === true) return `${label}_suspected_editing_or_loop`;
  if (metrics.reasonForManualReview) return `${label}_manual_review_reason`;
  if (metrics.antiCheatFlags.length > 0) return `${label}_anti_cheat_flags`;
  return null;
}

export function evaluateAutoSettleEligibility(
  result: JudgmentResult,
  options: JudgmentPolicyOptions = {},
): AutoSettlePolicyResult {
  const quality = evidenceQuality(result);
  const recommendation = settlementRecommendation(result);
  const isVisionJudgment = options.requiresVision || result.source === "vision_llm" || Boolean(result.videoMetrics);

  if (!result.winnerId) return { eligible: false, reason: "winner_missing" };
  if (result.confidence < 0.85) return { eligible: false, reason: "confidence_below_auto_settle_threshold" };
  if (quality !== "good") return { eligible: false, reason: "evidence_quality_not_good" };
  if (recommendation !== "settle_winner") return { eligible: false, reason: "recommendation_not_settle_winner" };

  if (!isVisionJudgment) return { eligible: true, reason: null };

  if (result.source !== "vision_llm") return { eligible: false, reason: "vision_source_required" };
  if (!result.videoMetrics) return { eligible: false, reason: "video_metrics_missing" };

  const blockA = participantAutoSettleBlock("participantA", result.videoMetrics.participantA);
  if (blockA) return { eligible: false, reason: blockA };
  const blockB = participantAutoSettleBlock("participantB", result.videoMetrics.participantB);
  if (blockB) return { eligible: false, reason: blockB };

  return { eligible: true, reason: null };
}

export function statusForJudgmentResult(
  result: JudgmentResult,
  options: JudgmentPolicyOptions = {},
): VerdictStatus {
  const quality = evidenceQuality(result);
  const recommendation = settlementRecommendation(result);
  const isVisionJudgment = options.requiresVision || result.source === "vision_llm" || Boolean(result.videoMetrics);

  if (!result.winnerId || result.confidence < 0.6 || quality === "invalid" || recommendation === "refund") {
    return ChallengeStatus.ai_inconclusive;
  }
  if (result.confidence < 0.85 || recommendation === "manual_review") {
    return ChallengeStatus.manual_review_required;
  }
  if (isVisionJudgment && !evaluateAutoSettleEligibility(result, options).eligible) {
    return ChallengeStatus.manual_review_required;
  }
  return ChallengeStatus.ai_verdict_ready;
}

export function buildJudgmentMetricsJson(
  result: JudgmentResult,
  params: {
    model: string;
    autoSettlePolicy: AutoSettlePolicyResult;
    status: VerdictStatus;
  },
): string {
  return JSON.stringify({
    source: result.source ?? "llm",
    model: params.model,
    evidenceQuality: evidenceQuality(result),
    settlementRecommendation: settlementRecommendation(result),
    confidence: result.confidence,
    videoMetrics: result.videoMetrics ?? null,
    judgingMethod: result.videoMetrics?.judgingMethod ?? result.source ?? "llm",
    autoSettleEligible: params.autoSettlePolicy.eligible,
    autoSettleBlockReason: params.autoSettlePolicy.reason,
    status: params.status,
  });
}

export function evidenceQualityForJudgment(result: JudgmentResult) {
  return evidenceQuality(result);
}

export function settlementRecommendationForJudgment(result: JudgmentResult) {
  return settlementRecommendation(result);
}
