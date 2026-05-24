import prisma from "@/lib/db";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";

type VerificationDecision = "passed" | "needs_review" | "invalid";

type JsonRecord = Record<string, unknown>;
type ParticipantBindingInput = {
  bindingStatus: string;
  expectedPosition: string | null;
  livenessCode: string | null;
  identityConfidence: number | null;
} | null;

export type ProtocolEvidenceVerificationResult = {
  challengeId: string;
  evidenceId: string;
  userId: string;
  decision: VerificationDecision;
  identityCheck: {
    passed: boolean;
    confidence: number;
    mode: string | null;
    bindingStatus: string | null;
    livenessDetected: boolean;
    expectedPosition: string | null;
    blockingIssues: string[];
  };
  evidenceCheck: {
    passed: boolean;
    confidence: number;
    mode: string | null;
    type: string;
    blockingIssues: string[];
  };
  blockingIssues: string[];
};

export type ProtocolEvidencePayloadVerificationInput = {
  protocol: ProtocolSpecV2 | null;
  binding: ParticipantBindingInput;
  challengeLivenessPrompt: string | null;
  type: string;
  url: string | null;
  description: string | null;
  metadata: JsonRecord;
};

function parseJsonObject(value: string | null | undefined): JsonRecord {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function parseProtocol(raw: string | null | undefined): ProtocolSpecV2 | null {
  if (!raw) return null;
  try {
    return parseProtocolSpecV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function haystack(description: string | null, metadata: JsonRecord) {
  return [
    description,
    stringValue(metadata.livenessCode),
    stringValue(metadata.livenessPhrase),
    stringValue(metadata.challengeLivenessPhrase),
    stringValue(metadata.phrase),
    stringValue(metadata.identityCode),
    ...stringArrayValue(metadata.detectedLivenessCodes),
    ...stringArrayValue(metadata.detectedLivenessPhrases),
    ...stringArrayValue(metadata.visibleCodes),
    ...stringArrayValue(metadata.spokenPhrases),
  ].filter(Boolean).join("\n").toLowerCase();
}

function includesPhrase(source: string, phrase: string | null | undefined) {
  return Boolean(phrase && source.includes(phrase.trim().toLowerCase()));
}

function uniqueIssues(issues: string[]) {
  return [...new Set(issues.filter((issue) => issue.trim()).map((issue) => issue.trim()))];
}

function isVideoMode(mode: ProtocolSpecV2["evidenceProtocol"]["mode"] | null) {
  return mode === "same_camera_video" || mode === "separate_video" || mode === "live_host_video";
}

function evidenceModeAcceptsType(mode: ProtocolSpecV2["evidenceProtocol"]["mode"] | null, type: string) {
  const normalized = type.toLowerCase();
  if (!mode) return false;
  if (isVideoMode(mode)) return normalized === "video";
  if (mode === "photo") return normalized === "photo" || normalized === "image";
  if (mode === "screenshot") return normalized === "screenshot" || normalized === "image" || normalized === "photo";
  if (mode === "gps") return normalized === "gps" || normalized === "location";
  if (mode === "receipt") return normalized === "receipt" || normalized === "photo" || normalized === "image";
  if (mode === "platform_metric" || mode === "public_oracle" || mode === "witness" || mode === "manual_review") return true;
  return false;
}

function observedPositionFromMetadata(metadata: JsonRecord): string | null {
  const value =
    stringValue(metadata.observedPosition) ??
    stringValue(metadata.participantPosition) ??
    stringValue(metadata.position);
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "left" || normalized === "right" || normalized === "center" || normalized === "any") return normalized;
  return null;
}

function evaluateIdentity(input: {
  protocol: ProtocolSpecV2 | null;
  binding: ParticipantBindingInput;
  challengeLivenessPrompt: string | null;
  description: string | null;
  metadata: JsonRecord;
}) {
  const protocol = input.protocol;
  if (!protocol) {
    return {
      passed: false,
      confidence: 0,
      mode: null,
      bindingStatus: input.binding?.bindingStatus ?? null,
      livenessDetected: false,
      expectedPosition: input.binding?.expectedPosition ?? null,
      blockingIssues: ["ProtocolSpecV2 is missing; identity cannot be verified."],
    };
  }

  if (!protocol.identityProtocol.required) {
    return {
      passed: true,
      confidence: 1,
      mode: protocol.identityProtocol.mode,
      bindingStatus: input.binding?.bindingStatus ?? "verified",
      livenessDetected: false,
      expectedPosition: input.binding?.expectedPosition ?? null,
      blockingIssues: [],
    };
  }

  const issues: string[] = [];
  if (!input.binding) issues.push("Participant identity binding is missing.");
  const source = haystack(input.description, input.metadata);
  const bindingCodeDetected = includesPhrase(source, input.binding?.livenessCode);
  const challengePromptDetected = includesPhrase(source, input.challengeLivenessPrompt);
  const metadataLivenessProvided = Boolean(
    stringValue(input.metadata.livenessCode) ||
    stringValue(input.metadata.livenessPhrase) ||
    stringValue(input.metadata.challengeLivenessPhrase) ||
    stringValue(input.metadata.identityCode)
  );
  const exactLivenessDetected = bindingCodeDetected || challengePromptDetected;
  const livenessDetected = exactLivenessDetected || metadataLivenessProvided;

  if (!exactLivenessDetected) {
    if (metadataLivenessProvided) {
      issues.push("Visual verification required: metadata mentions liveness, but the exact assigned liveness code was not confirmed.");
    } else {
      issues.push("Visual verification required: exact liveness code was not confirmed in evidence metadata/description.");
    }
  }

  const expectedPosition = input.binding?.expectedPosition ?? null;
  const observedPosition = observedPositionFromMetadata(input.metadata);
  const positionRequired =
    protocol.evidenceProtocol.mode === "same_camera_video" ||
    protocol.identityProtocol.mode === "left_right_assignment";
  if (positionRequired && expectedPosition && expectedPosition !== "any") {
    if (!observedPosition) {
      issues.push(`Visual verification required: observed position was not provided; expected ${expectedPosition}.`);
    } else if (observedPosition !== expectedPosition) {
      issues.push(`Observed position ${observedPosition} does not match expected ${expectedPosition}.`);
    }
  }

  const threshold = protocol.identityProtocol.autoSettlementRequiresIdentityConfidence || 0.85;
  const storedConfidence = input.binding?.identityConfidence ?? null;
  const confidence = input.binding?.bindingStatus === "verified"
    ? storedConfidence ?? 1
    : bindingCodeDetected
      ? 0.95
      : challengePromptDetected
        ? threshold
        : metadataLivenessProvided
          ? 0.5
          : 0;

  if (confidence < threshold) {
    issues.push(`Identity confidence ${Math.round(confidence * 100)}% is below ${Math.round(threshold * 100)}%.`);
  }

  return {
    passed: issues.length === 0,
    confidence,
    mode: protocol.identityProtocol.mode,
    bindingStatus: issues.length === 0 ? "verified" : input.binding?.bindingStatus ?? "pending",
    livenessDetected,
    expectedPosition: input.binding?.expectedPosition ?? null,
    blockingIssues: uniqueIssues(issues),
  };
}

function evaluateEvidence(input: {
  protocol: ProtocolSpecV2 | null;
  type: string;
  url: string | null;
  description: string | null;
  metadata: JsonRecord;
}) {
  const protocol = input.protocol;
  const issues: string[] = [];
  if (!protocol) {
    return {
      passed: false,
      confidence: 0,
      mode: null,
      type: input.type,
      blockingIssues: ["ProtocolSpecV2 is missing; evidence cannot be verified."],
    };
  }

  const mode = protocol.evidenceProtocol.mode;
  if (!evidenceModeAcceptsType(mode, input.type)) {
    issues.push(`Evidence type ${input.type} does not satisfy protocol mode ${mode}.`);
  }

  if ((isVideoMode(mode) || mode === "photo" || mode === "screenshot" || mode === "receipt") && !input.url) {
    issues.push(`Evidence mode ${mode} requires a media URL.`);
  }

  if (mode === "gps") {
    const lat = numberValue(input.metadata.lat ?? input.metadata.latitude);
    const lng = numberValue(input.metadata.lng ?? input.metadata.longitude);
    if (lat === null || lng === null) issues.push("GPS evidence requires latitude and longitude metadata.");
  }

  const sizeBytes = numberValue(input.metadata.fileSizeBytes ?? input.metadata.sizeBytes ?? input.metadata.uploadedFileSizeBytes);
  if (sizeBytes !== null && sizeBytes <= 0) issues.push("Uploaded evidence file size is zero.");
  if (input.metadata.videoTooShort === true) issues.push("Evidence metadata marks the video as too short.");
  if (input.metadata.suspectedEditingOrLoop === true) issues.push("Evidence metadata flags editing, static frames, or looping.");
  if (input.metadata.fullBodyVisible === false) issues.push("Evidence metadata marks full body as not visible.");
  if (input.metadata.continuousAttemptLikely === false) issues.push("Evidence metadata marks the attempt as discontinuous.");

  const confidence = issues.length === 0 ? 1 : 0;
  return {
    passed: issues.length === 0,
    confidence,
    mode,
    type: input.type,
    blockingIssues: uniqueIssues(issues),
  };
}

function decisionFor(identityPassed: boolean, evidencePassed: boolean, blockingIssues: string[]): VerificationDecision {
  if (identityPassed && evidencePassed) return "passed";
  if (blockingIssues.some((issue) => /missing ProtocolSpecV2|requires a media URL|does not satisfy protocol mode|file size is zero/i.test(issue))) {
    return "invalid";
  }
  return "needs_review";
}

export function evaluateProtocolEvidencePayload(
  input: ProtocolEvidencePayloadVerificationInput,
): Omit<ProtocolEvidenceVerificationResult, "challengeId" | "evidenceId" | "userId"> {
  const identityCheck = evaluateIdentity({
    protocol: input.protocol,
    binding: input.binding,
    challengeLivenessPrompt: input.challengeLivenessPrompt,
    description: input.description,
    metadata: input.metadata,
  });
  const evidenceCheck = evaluateEvidence({
    protocol: input.protocol,
    type: input.type,
    url: input.url,
    description: input.description,
    metadata: input.metadata,
  });
  const blockingIssues = uniqueIssues([
    ...identityCheck.blockingIssues,
    ...evidenceCheck.blockingIssues,
  ]);
  const decision = decisionFor(identityCheck.passed, evidenceCheck.passed, blockingIssues);
  return {
    decision,
    identityCheck,
    evidenceCheck,
    blockingIssues,
  };
}

export async function verifyEvidenceAgainstProtocol(evidenceId: string): Promise<ProtocolEvidenceVerificationResult> {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      challenge: {
        include: {
          protocol: true,
          participants: true,
          participantBindings: true,
        },
      },
    },
  });

  if (!evidence) {
    throw new Error("Evidence not found");
  }

  const protocol = parseProtocol(evidence.challenge.protocol?.specJson);
  const metadata = parseJsonObject(evidence.metadata);
  const binding = evidence.challenge.participantBindings.find((item) => item.userId === evidence.userId) ?? null;
  const participant = evidence.challenge.participants.find((item) => item.userId === evidence.userId) ?? null;
  const evaluated = evaluateProtocolEvidencePayload({
    protocol,
    binding,
    challengeLivenessPrompt: evidence.challenge.livenessPrompt,
    type: evidence.type,
    url: evidence.url,
    description: evidence.description,
    metadata,
  });
  const { identityCheck, evidenceCheck, blockingIssues, decision } = evaluated;

  await prisma.evidenceCheck.upsert({
    where: { evidenceId },
    create: {
      evidenceId,
      challengeId: evidence.challengeId,
      userId: evidence.userId,
      protocolVersion: protocol?.version ?? evidence.challenge.protocolVersion ?? "2.0",
      identityCheckJson: JSON.stringify(identityCheck),
      evidenceCheckJson: JSON.stringify(evidenceCheck),
      identityConfidence: identityCheck.confidence,
      evidenceConfidence: evidenceCheck.confidence,
      decision,
      blockingIssues: blockingIssues.length ? JSON.stringify(blockingIssues) : null,
    },
    update: {
      protocolVersion: protocol?.version ?? evidence.challenge.protocolVersion ?? "2.0",
      identityCheckJson: JSON.stringify(identityCheck),
      evidenceCheckJson: JSON.stringify(evidenceCheck),
      identityConfidence: identityCheck.confidence,
      evidenceConfidence: evidenceCheck.confidence,
      decision,
      blockingIssues: blockingIssues.length ? JSON.stringify(blockingIssues) : null,
    },
  });

  if (binding) {
    await prisma.participantBinding.update({
      where: { id: binding.id },
      data: {
        bindingStatus: identityCheck.passed ? "verified" : "pending",
        identityConfidence: identityCheck.confidence,
        identityCheckJson: JSON.stringify(identityCheck),
        verifiedAt: identityCheck.passed ? new Date() : null,
        participantId: binding.participantId ?? participant?.id ?? null,
      },
    });
  }

  console.log(
    `[evidence-verify] challenge=${evidence.challengeId} evidence=${evidenceId} user=${evidence.userId} decision=${decision} identity=${identityCheck.confidence} evidence=${evidenceCheck.confidence} issues=${blockingIssues.length}`,
  );

  return {
    challengeId: evidence.challengeId,
    evidenceId,
    userId: evidence.userId,
    decision,
    identityCheck,
    evidenceCheck,
    blockingIssues,
  };
}
