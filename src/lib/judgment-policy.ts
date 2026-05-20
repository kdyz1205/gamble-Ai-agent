import { ChallengeStatus } from "./enums";
import type { JudgmentResult, VideoJudgmentParticipantMetrics } from "./ai-engine";
import type { ProtocolJudgmentGateResult } from "./protocol-judgment-policy";

export type EvidenceQuality = "good" | "unclear" | "insufficient" | "invalid";
export type VerdictRecommendation =
  | "settle_winner"
  | "needs_review"
  | "invalid_evidence"
  | "tie_or_no_winner";

export type VerdictStatus =
  | typeof ChallengeStatus.ai_verdict_ready
  | typeof ChallengeStatus.ai_inconclusive
  | typeof ChallengeStatus.manual_review_required;

export interface JudgmentPolicyOptions {
  requiresVision?: boolean;
  requiresRepCountWinner?: boolean;
  participantAId?: string | null;
  participantBId?: string | null;
}

export interface AutoSettlePolicyResult {
  eligible: boolean;
  reason: string | null;
  blockingIssues: string[];
}

function evidenceQuality(result: JudgmentResult): EvidenceQuality {
  if (result.evidenceQuality) return result.evidenceQuality;
  if (result.winnerId && result.confidence >= 0.85) return "good";
  if (result.confidence >= 0.6) return "unclear";
  return "invalid";
}

function recommendation(result: JudgmentResult): VerdictRecommendation {
  if (result.recommendation) return result.recommendation;
  if (result.settlementRecommendation === "settle_winner") return "settle_winner";
  if (result.settlementRecommendation === "manual_review") return "needs_review";
  if (result.settlementRecommendation === "refund") {
    return evidenceQuality(result) === "invalid" ? "invalid_evidence" : "tie_or_no_winner";
  }
  if (result.winnerId && result.confidence >= 0.85) return "settle_winner";
  if (!result.winnerId) return "tie_or_no_winner";
  return "needs_review";
}

function recommendationFromBlockingIssues(
  base: VerdictRecommendation,
  blockingIssues: string[],
): VerdictRecommendation {
  if (base !== "settle_winner") return base;
  const text = blockingIssues.join("\n").toLowerCase();
  if (/\btied?\b|tie_or_no_winner|no winner|winner is missing/.test(text)) return "tie_or_no_winner";
  if (
    /does not show the required action|not show the required action|invalid evidence|video is too short|too short|missing or not visible|full body is not visible|edited, static, or looped/.test(text)
  ) {
    return "invalid_evidence";
  }
  return "needs_review";
}

function evidenceQualityFromBlockingIssues(
  base: EvidenceQuality,
  effectiveRecommendation: VerdictRecommendation,
  blockingIssues: string[],
): EvidenceQuality {
  if (effectiveRecommendation === "invalid_evidence") return "invalid";
  if (base !== "good") return base;
  if (blockingIssues.length === 0) return base;
  const text = blockingIssues.join("\n").toLowerCase();
  if (/confidence .* below|recommendation is/.test(text)) return "unclear";
  return "insufficient";
}

function issueSlug(issue: string) {
  return issue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function uniqueIssues(issues: string[]) {
  return [...new Set(issues.filter((issue) => issue.trim()).map((issue) => issue.trim()))];
}

export function requiresRepCountWinnerFromText(...parts: Array<string | null | undefined>): boolean {
  const text = parts.filter(Boolean).join("\n").toLowerCase();
  if (!text) return false;
  const hasRepSubject = /\b(push[-\s]?ups?|reps?|repetitions?|valid reps?|valid push[-\s]?ups?)\b/.test(text);
  const hasCountScoring = /\b(more|most|highest|count|counts|counting|many|number|as many|valid rep count)\b/.test(text);
  return hasRepSubject && hasCountScoring;
}

function participantBlockingIssues(
  label: string,
  metrics: VideoJudgmentParticipantMetrics | undefined,
): string[] {
  const issues: string[] = [];
  if (!metrics) return [`${label} metrics are missing.`];
  const invalidActionNote = (metrics.invalidRepNotes ?? []).some((note) =>
    /\b(no|not|non)\b.*\b(push[-\s]?up|motion|attempt)\b|\b(static|standing|unrelated)\b/i.test(note),
  );
  if (invalidActionNote && metrics.validRepCount === 0) {
    issues.push(`${label} evidence does not show the required action.`);
  }
  if (metrics.fullDurationCovered !== true) issues.push(`${label} video does not cover the required duration.`);
  if (metrics.fullBodyVisible !== true) issues.push(`${label} full body is not visible enough.`);
  if (metrics.livenessPhraseVisible !== true) issues.push(`${label} liveness phrase is missing or not visible.`);
  if (metrics.continuousAttemptLikely !== true) issues.push(`${label} continuous attempt is unclear.`);
  if (metrics.videoTooShort === true) issues.push(`${label} video is too short.`);
  if (metrics.suspectedEditingOrLoop === true) issues.push(`${label} video appears edited, static, or looped.`);
  if (metrics.reasonForManualReview) issues.push(`${label}: ${metrics.reasonForManualReview}`);
  if (metrics.unclearReason) issues.push(`${label}: ${metrics.unclearReason}`);
  for (const flag of metrics.antiCheatFlags ?? []) {
    issues.push(`${label} anti-cheat flag: ${flag}`);
  }
  return issues;
}

function numericRepCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function repCountWinnerIssues(
  result: JudgmentResult,
  options: JudgmentPolicyOptions,
): string[] {
  if (!options.requiresRepCountWinner) return [];
  if (!result.videoMetrics) return ["Rep-count challenge requires structured video metrics."];
  const countA = numericRepCount(result.videoMetrics.participantA?.validRepCount);
  const countB = numericRepCount(result.videoMetrics.participantB?.validRepCount);
  const issues: string[] = [];

  if (countA === null || countB === null) {
    issues.push("Valid rep counts are required for both participants before settlement.");
    return issues;
  }
  if (countA === countB) {
    issues.push(`Valid rep counts are tied at ${countA}; no winner can auto-settle from rep count.`);
    return issues;
  }

  const participantAId = options.participantAId ?? null;
  const participantBId = options.participantBId ?? null;
  if (result.winnerId && participantAId && result.winnerId === participantAId && countA <= countB) {
    issues.push(`Participant A was selected as winner, but video metrics show ${countA} valid reps versus Participant B's ${countB}.`);
  } else if (result.winnerId && participantBId && result.winnerId === participantBId && countB <= countA) {
    issues.push(`Participant B was selected as winner, but video metrics show ${countB} valid reps versus Participant A's ${countA}.`);
  } else if (result.winnerId && participantAId && participantBId && ![participantAId, participantBId].includes(result.winnerId)) {
    issues.push("Winner cannot be mapped to Participant A or Participant B.");
  } else if (result.winnerId && (!participantAId || !participantBId)) {
    issues.push("Participant identity mapping is required before rep-count settlement.");
  }

  return issues;
}

export function blockingIssuesForJudgment(
  result: JudgmentResult,
  options: JudgmentPolicyOptions = {},
): string[] {
  const quality = evidenceQuality(result);
  const rec = recommendation(result);
  const issues: string[] = [...(result.blockingIssues ?? [])];
  const isVisionJudgment = options.requiresVision || result.source === "vision_llm";

  if (!result.winnerId) issues.push("Winner is missing or the result is tied.");
  if (!Number.isFinite(result.confidence)) {
    issues.push("Confidence score is missing or invalid.");
  } else if (result.confidence < 0.85) {
    issues.push(`Confidence ${Math.round(result.confidence * 100)}% is below the 85% settlement threshold.`);
  }
  if (quality !== "good") issues.push(`Evidence quality is ${quality}, not good.`);
  if (rec !== "settle_winner") issues.push(`Recommendation is ${rec}, not settle_winner.`);

  if (isVisionJudgment) {
    if (result.source !== "vision_llm") issues.push("Vision-capable judge source was not used.");
    if (!result.videoMetrics) {
      issues.push("Structured video metrics are missing.");
    } else {
      issues.push(...participantBlockingIssues("Participant A", result.videoMetrics.participantA));
      issues.push(...participantBlockingIssues("Participant B", result.videoMetrics.participantB));
      issues.push(...repCountWinnerIssues(result, options));
    }
  }

  return uniqueIssues(issues);
}

export function evaluateAutoSettleEligibility(
  result: JudgmentResult,
  options: JudgmentPolicyOptions = {},
): AutoSettlePolicyResult {
  const blockingIssues = blockingIssuesForJudgment(result, options);
  return {
    eligible: blockingIssues.length === 0,
    reason: blockingIssues[0] ? issueSlug(blockingIssues[0]) : null,
    blockingIssues,
  };
}

export function statusForJudgmentResult(
  result: JudgmentResult,
  options: JudgmentPolicyOptions = {},
): VerdictStatus {
  const quality = evidenceQuality(result);
  const rec = recommendation(result);

  if (!result.winnerId || result.confidence < 0.6 || quality === "invalid" || rec === "invalid_evidence" || rec === "tie_or_no_winner") {
    return ChallengeStatus.ai_inconclusive;
  }
  if (result.confidence < 0.85 || quality !== "good" || rec === "needs_review") {
    return ChallengeStatus.manual_review_required;
  }
  if (!evaluateAutoSettleEligibility(result, options).eligible) {
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
    protocolGates?: ProtocolJudgmentGateResult;
  },
): string {
  const effectiveRecommendation = recommendationFromBlockingIssues(
    recommendation(result),
    params.autoSettlePolicy.blockingIssues,
  );
  const effectiveEvidenceQuality = evidenceQualityFromBlockingIssues(
    evidenceQuality(result),
    effectiveRecommendation,
    params.autoSettlePolicy.blockingIssues,
  );
  return JSON.stringify({
    source: result.source ?? "llm",
    model: params.model,
    evidenceQuality: effectiveEvidenceQuality,
    recommendation: effectiveRecommendation,
    settlementRecommendation: effectiveRecommendation,
    confidence: result.confidence,
    blockingIssues: params.autoSettlePolicy.blockingIssues,
    videoMetrics: result.videoMetrics ?? null,
    providerCall: result.providerCall ?? null,
    judgingMethod: result.videoMetrics?.judgingMethod ?? result.source ?? "llm",
    autoSettleEligible: params.autoSettlePolicy.eligible,
    autoSettleBlockReason: params.autoSettlePolicy.reason,
    status: params.status,
    protocolCompliance: params.protocolGates?.protocolCompliance ?? null,
    identityResult: params.protocolGates?.identityResult ?? null,
    evidenceResult: params.protocolGates?.evidenceResult ?? null,
    settlementEligibility: params.protocolGates?.settlementEligibility ?? null,
  });
}

export function evidenceQualityForJudgment(result: JudgmentResult) {
  return evidenceQuality(result);
}

export function settlementRecommendationForJudgment(result: JudgmentResult) {
  return recommendation(result);
}

export function recommendationForJudgment(result: JudgmentResult) {
  return recommendation(result);
}

export function effectiveJudgmentVerdictFields(
  result: JudgmentResult,
  autoSettlePolicy: AutoSettlePolicyResult,
): { evidenceQuality: EvidenceQuality; recommendation: VerdictRecommendation } {
  const effectiveRecommendation = recommendationFromBlockingIssues(
    recommendation(result),
    autoSettlePolicy.blockingIssues,
  );
  return {
    evidenceQuality: evidenceQualityFromBlockingIssues(
      evidenceQuality(result),
      effectiveRecommendation,
      autoSettlePolicy.blockingIssues,
    ),
    recommendation: effectiveRecommendation,
  };
}
