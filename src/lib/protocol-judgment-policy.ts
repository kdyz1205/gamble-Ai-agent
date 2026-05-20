import type { JudgmentResult, VideoJudgmentParticipantMetrics } from "@/lib/ai-engine";
import type { AutoSettlePolicyResult } from "@/lib/judgment-policy";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

type ParticipantLike = {
  userId: string;
  role: string;
  status?: string;
};

type ParticipantBindingLike = {
  userId: string;
  role: string;
  expectedPosition: string | null;
  livenessCode: string | null;
  qrTokenHash: string | null;
  bindingStatus: string;
  identityConfidence: number | null;
};

type EvidenceLike = {
  userId: string;
  type: string;
  url: string | null;
  description: string | null;
};

type EvidenceCheckLike = {
  userId: string;
  decision: string;
  identityConfidence: number | null;
  evidenceConfidence: number | null;
  blockingIssues: string | null;
};

export type ProtocolGateStatus = {
  passed: boolean;
  blockingIssues: string[];
};

export type ProtocolIdentityResult = ProtocolGateStatus & {
  confidence: number;
  bindings: Array<{
    userId: string;
    role: string;
    expectedPosition: string | null;
    bindingStatus: string | null;
    confidence: number | null;
    blockingIssues: string[];
  }>;
};

export type ProtocolEvidenceResult = ProtocolGateStatus & {
  confidence: number;
};

export type ProtocolSettlementEligibility = ProtocolGateStatus & {
  eligible: boolean;
  reason: string | null;
  manualReviewRequired: boolean;
};

export type ProtocolJudgmentGateResult = {
  protocolCompliance: ProtocolGateStatus;
  identityResult: ProtocolIdentityResult;
  evidenceResult: ProtocolEvidenceResult;
  settlementEligibility: ProtocolSettlementEligibility;
  blockingIssues: string[];
};

export type ProtocolJudgmentGateInput = {
  protocol: ProtocolSpecV2 | null;
  participants: ParticipantLike[];
  participantBindings: ParticipantBindingLike[];
  evidence: EvidenceLike[];
  evidenceChecks: EvidenceCheckLike[];
  result?: JudgmentResult | null;
};

const AUTO_SETTLEMENT_MODES = new Set(["auto_ai_vision", "auto_ai_text", "auto_oracle"]);
const ACCEPTED_EVIDENCE_CHECK_DECISIONS = new Set(["passed", "valid", "verified", "accepted"]);
const INVALID_EVIDENCE_CHECK_DECISIONS = new Set(["failed", "invalid", "rejected", "blocked"]);

function uniqueIssues(issues: string[]) {
  return [...new Set(issues.filter((issue) => issue.trim()).map((issue) => issue.trim()))];
}

function issueSlug(issue: string) {
  return issue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function parsedBlockingIssues(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    // Fall through to text parsing.
  }
  return value
    .split(/\n+|;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function acceptedParticipants(participants: ParticipantLike[]) {
  return participants.filter((participant) =>
    participant.status ? participant.status === "accepted" : participant.role !== "spectator",
  );
}

function participantForRole(participants: ParticipantLike[], role: string) {
  if (role === "participant") return participants.find((participant) => participant.role !== "spectator") ?? null;
  return participants.find((participant) => participant.role === role) ?? null;
}

function metricsForRole(result: JudgmentResult | null | undefined, role: string): VideoJudgmentParticipantMetrics | undefined {
  if (role === "creator") return result?.videoMetrics?.participantA;
  if (role === "opponent") return result?.videoMetrics?.participantB;
  return undefined;
}

function numericConfidence(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function minConfidence(values: Array<number | null | undefined>, fallback: number) {
  const finite = values
    .map((value) => numericConfidence(value))
    .filter((value): value is number => value !== null);
  return finite.length ? Math.min(...finite) : fallback;
}

function protocolCompliance(protocol: ProtocolSpecV2 | null, participants: ParticipantLike[]): ProtocolGateStatus {
  const issues: string[] = [];
  if (!protocol) {
    issues.push("ProtocolSpecV2 is missing; no protocol means no automatic settlement.");
    return { passed: false, blockingIssues: issues };
  }
  if (!protocol.riskPolicy.allowed) {
    issues.push(protocol.riskPolicy.blockedReason || "Protocol risk policy does not allow this challenge.");
  }
  const accepted = acceptedParticipants(participants);
  if (protocol.participantMode === "head_to_head") {
    if (!accepted.some((participant) => participant.role === "creator")) issues.push("Creator participant is missing.");
    if (!accepted.some((participant) => participant.role === "opponent")) issues.push("Opponent participant is missing.");
  }
  return { passed: issues.length === 0, blockingIssues: uniqueIssues(issues) };
}

function identityResult(
  protocol: ProtocolSpecV2 | null,
  participants: ParticipantLike[],
  participantBindings: ParticipantBindingLike[],
  result: JudgmentResult | null | undefined,
): ProtocolIdentityResult {
  const bindingRows: ProtocolIdentityResult["bindings"] = [];
  const issues: string[] = [];
  if (!protocol) {
    return { passed: false, confidence: 0, bindings: [], blockingIssues: ["Identity cannot be verified without ProtocolSpecV2."] };
  }
  if (!protocol.identityProtocol.required) {
    return { passed: true, confidence: 1, bindings: [], blockingIssues: [] };
  }

  const threshold = protocol.identityProtocol.autoSettlementRequiresIdentityConfidence || 0.85;
  for (const required of protocol.identityProtocol.participantBindings) {
    const participant = participantForRole(participants, required.role);
    const rowIssues: string[] = [];
    if (!participant) {
      rowIssues.push(`${required.role} participant is missing.`);
      bindingRows.push({
        userId: "",
        role: required.role,
        expectedPosition: required.expectedPosition ?? null,
        bindingStatus: null,
        confidence: null,
        blockingIssues: rowIssues,
      });
      issues.push(...rowIssues);
      continue;
    }

    const binding = participantBindings.find((item) => item.userId === participant.userId);
    if (!binding) {
      rowIssues.push(`${required.role} identity binding is missing.`);
    } else {
      const expected = required.expectedPosition ?? null;
      if (expected && expected !== "any" && binding.expectedPosition !== expected) {
        rowIssues.push(`${required.role} expected position is ${expected}, but binding has ${binding.expectedPosition ?? "none"}.`);
      }
      if ((required.requiredQrOrCode || protocol.identityProtocol.mode !== "account_only") && !binding.livenessCode && !binding.qrTokenHash) {
        rowIssues.push(`${required.role} has no liveness code or participant ticket.`);
      }
    }

    const metrics = metricsForRole(result, required.role);
    const verifiedByBinding =
      binding?.bindingStatus === "verified" ||
      (numericConfidence(binding?.identityConfidence) ?? 0) >= threshold;
    const verifiedByVision =
      Boolean(metrics) &&
      metrics?.livenessPhraseVisible === true &&
      metrics?.fullBodyVisible !== false;

    if (!verifiedByBinding && !verifiedByVision) {
      rowIssues.push(`${required.role} identity is not verified above ${Math.round(threshold * 100)}%.`);
    }

    const confidence = verifiedByBinding
      ? numericConfidence(binding?.identityConfidence) ?? 1
      : verifiedByVision
        ? Math.max(threshold, 0.85)
        : numericConfidence(binding?.identityConfidence);
    bindingRows.push({
      userId: participant.userId,
      role: required.role,
      expectedPosition: binding?.expectedPosition ?? required.expectedPosition ?? null,
      bindingStatus: binding?.bindingStatus ?? null,
      confidence,
      blockingIssues: uniqueIssues(rowIssues),
    });
    issues.push(...rowIssues);
  }

  return {
    passed: issues.length === 0,
    confidence: issues.length === 0 ? minConfidence(bindingRows.map((row) => row.confidence), threshold) : minConfidence(bindingRows.map((row) => row.confidence), 0),
    bindings: bindingRows,
    blockingIssues: uniqueIssues(issues),
  };
}

function videoEvidenceIssues(metrics: VideoJudgmentParticipantMetrics | undefined, label: string): string[] {
  if (!metrics) return [`${label} structured video metrics are missing.`];
  const issues: string[] = [];
  if (metrics.fullDurationCovered !== true) issues.push(`${label} video does not cover the required duration.`);
  if (metrics.fullBodyVisible !== true) issues.push(`${label} full body is not visible enough.`);
  if (metrics.continuousAttemptLikely !== true) issues.push(`${label} continuous attempt is unclear.`);
  if (metrics.videoTooShort === true) issues.push(`${label} video is too short.`);
  if (metrics.suspectedEditingOrLoop === true) issues.push(`${label} video appears edited, static, or looped.`);
  if (metrics.reasonForManualReview) issues.push(`${label}: ${metrics.reasonForManualReview}`);
  if (metrics.unclearReason) issues.push(`${label}: ${metrics.unclearReason}`);
  for (const flag of metrics.antiCheatFlags ?? []) issues.push(`${label} anti-cheat flag: ${flag}`);
  return issues;
}

function evidenceResult(
  protocol: ProtocolSpecV2 | null,
  participants: ParticipantLike[],
  evidence: EvidenceLike[],
  evidenceChecks: EvidenceCheckLike[],
  result: JudgmentResult | null | undefined,
): ProtocolEvidenceResult {
  const issues: string[] = [];
  if (!protocol) {
    return { passed: false, confidence: 0, blockingIssues: ["Evidence cannot be verified without ProtocolSpecV2."] };
  }

  const requiredParticipants = acceptedParticipants(participants).filter((participant) => participant.role !== "spectator");
  for (const participant of requiredParticipants) {
    const submitted = evidence.find((item) => item.userId === participant.userId);
    if (!submitted) {
      issues.push(`${participant.role} evidence is missing.`);
      continue;
    }
    const decision = evidenceChecks.find((check) => check.userId === participant.userId)?.decision;
    if (decision && INVALID_EVIDENCE_CHECK_DECISIONS.has(decision)) {
      issues.push(`${participant.role} evidence check decision is ${decision}.`);
    }
  }

  for (const check of evidenceChecks) {
    issues.push(...parsedBlockingIssues(check.blockingIssues).map((issue) => `Evidence check: ${issue}`));
  }

  const mode = protocol.evidenceProtocol.mode;
  const videoLike = mode === "same_camera_video" || mode === "separate_video" || mode === "live_host_video" || mode === "photo";
  if (videoLike) {
    if (result?.source !== "vision_llm") issues.push("Protocol requires visual evidence, but a vision judge did not produce the verdict.");
    issues.push(...videoEvidenceIssues(result?.videoMetrics?.participantA, "Participant A"));
    issues.push(...videoEvidenceIssues(result?.videoMetrics?.participantB, "Participant B"));
  }

  if (result?.evidenceQuality && result.evidenceQuality !== "good") {
    issues.push(`Judge evidence quality is ${result.evidenceQuality}, not good.`);
  }

  const acceptedConfidence = evidenceChecks
    .filter((check) => ACCEPTED_EVIDENCE_CHECK_DECISIONS.has(check.decision))
    .map((check) => check.evidenceConfidence);
  const confidence = issues.length === 0
    ? minConfidence([result?.confidence, ...acceptedConfidence], result?.confidence ?? 1)
    : minConfidence([result?.confidence, ...acceptedConfidence], 0);
  return { passed: issues.length === 0, confidence, blockingIssues: uniqueIssues(issues) };
}

function settlementEligibility(
  protocol: ProtocolSpecV2 | null,
  protocolResult: ProtocolGateStatus,
  identity: ProtocolIdentityResult,
  evidence: ProtocolEvidenceResult,
): ProtocolSettlementEligibility {
  const issues = [
    ...protocolResult.blockingIssues,
    ...identity.blockingIssues,
    ...evidence.blockingIssues,
  ];
  if (protocol && !AUTO_SETTLEMENT_MODES.has(protocol.settlementProtocol.mode)) {
    issues.push(`Protocol settlement mode is ${protocol.settlementProtocol.mode}, not an automatic settlement mode.`);
  }
  const blockingIssues = uniqueIssues(issues);
  return {
    passed: blockingIssues.length === 0,
    eligible: blockingIssues.length === 0,
    reason: blockingIssues[0] ? issueSlug(blockingIssues[0]) : null,
    manualReviewRequired: blockingIssues.length > 0,
    blockingIssues,
  };
}

export function evaluateProtocolJudgmentGates(input: ProtocolJudgmentGateInput): ProtocolJudgmentGateResult {
  const compliance = protocolCompliance(input.protocol, input.participants);
  const identity = identityResult(input.protocol, input.participants, input.participantBindings, input.result);
  const evidence = evidenceResult(input.protocol, input.participants, input.evidence, input.evidenceChecks, input.result);
  const settlement = settlementEligibility(input.protocol, compliance, identity, evidence);
  return {
    protocolCompliance: compliance,
    identityResult: identity,
    evidenceResult: evidence,
    settlementEligibility: settlement,
    blockingIssues: settlement.blockingIssues,
  };
}

export function combineAutoSettlePolicyWithProtocolGates(
  base: AutoSettlePolicyResult,
  gates: ProtocolJudgmentGateResult,
): AutoSettlePolicyResult {
  const blockingIssues = uniqueIssues([...base.blockingIssues, ...gates.blockingIssues]);
  return {
    eligible: base.eligible && gates.settlementEligibility.eligible && blockingIssues.length === 0,
    reason: blockingIssues[0] ? issueSlug(blockingIssues[0]) : null,
    blockingIssues,
  };
}

