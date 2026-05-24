import type { ChallengeSpec } from "@/lib/challenge-spec";
import { inferParticipantModeFromPrompt } from "@/lib/protocol-compiler";
import { protocolSpecFromChallengeSpec, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

type LegacyProtocolInput = {
  rawPrompt?: unknown;
  title?: unknown;
  description?: unknown;
  proposition?: unknown;
  type?: unknown;
  rules?: unknown;
  evidenceType?: unknown;
  settlementMode?: unknown;
  stake?: unknown;
  isPublic?: unknown;
  visibility?: unknown;
  discoveryLat?: unknown;
  discoveryLng?: unknown;
  deadline?: unknown;
  aiReview?: unknown;
};

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function detectLanguage(input: string): ProtocolSpecV2["language"] {
  if (/[\u3400-\u9fff]/.test(input)) return "zh";
  if (/[A-Za-z]/.test(input)) return "en";
  return "auto";
}

function evidenceModeFromLegacy(
  evidenceType: string,
  text: string,
): ProtocolSpecV2["evidenceProtocol"]["mode"] {
  const source = `${evidenceType} ${text}`.toLowerCase();
  if (/same[_ -]?camera|same[_ -]?device|same phone|one phone|single phone|shared video/.test(source)) return "same_camera_video";
  if (/live[_ -]?host|host video|live video/.test(source)) return "live_host_video";
  if (/video|camera|recording|clip/.test(source)) return "separate_video";
  if (/photo|picture|image/.test(source)) return "photo";
  if (/screenshot|screen shot/.test(source)) return "screenshot";
  if (/gps|location|check[-_ ]?in/.test(source)) return "gps";
  if (/oracle|price|weather|score|public api|coingecko|binance|polymarket|uma/.test(source)) return "public_oracle";
  if (/self[_ -]?report|text|answer|written|description|note|statement/.test(source)) return "witness";
  return "manual_review";
}

function settlementModeForLegacy(
  evidenceMode: ProtocolSpecV2["evidenceProtocol"]["mode"],
  aiReview: unknown,
): ProtocolSpecV2["settlementProtocol"]["mode"] {
  if (aiReview === false) return "peer_confirmed";
  if (evidenceMode === "same_camera_video" || evidenceMode === "separate_video" || evidenceMode === "live_host_video" || evidenceMode === "photo") {
    return "auto_ai_vision";
  }
  if (evidenceMode === "public_oracle" || evidenceMode === "gps" || evidenceMode === "platform_metric") {
    return "auto_oracle";
  }
  if (evidenceMode === "witness" || evidenceMode === "screenshot") return "auto_ai_text";
  return "manual_review";
}

function inviteModeForLegacy(input: LegacyProtocolInput, evidenceMode: ProtocolSpecV2["evidenceProtocol"]["mode"]): ChallengeSpec["invite_mode"] {
  const hasLocation =
    typeof input.discoveryLat === "number" &&
    typeof input.discoveryLng === "number" &&
    Number.isFinite(input.discoveryLat) &&
    Number.isFinite(input.discoveryLng);
  if (evidenceMode === "same_camera_video") return "same_device";
  if (hasLocation || input.visibility === "public" || input.isPublic === true) return "nearby";
  return "invite_link";
}

function participantBindingsForMode(
  protocol: ProtocolSpecV2,
  participantMode: ProtocolSpecV2["participantMode"],
  evidenceMode: ProtocolSpecV2["evidenceProtocol"]["mode"],
) {
  const videoLike = evidenceMode === "same_camera_video" || evidenceMode === "separate_video" || evidenceMode === "live_host_video" || evidenceMode === "photo";
  const base = participantMode === "solo"
    ? protocol.identityProtocol.participantBindings.filter((binding) => binding.role === "creator").slice(0, 1)
    : protocol.identityProtocol.participantBindings;
  return base.map((binding, index) => ({
    ...binding,
    expectedPosition: evidenceMode === "same_camera_video"
      ? index === 0 ? "left" as const : "right" as const
      : "any" as const,
    requiredQrOrCode: videoLike,
  }));
}

export function legacyProtocolSpecFromRequest(input: LegacyProtocolInput): ProtocolSpecV2 | null {
  const title = cleanString(input.title);
  if (!title) return null;

  const description = cleanString(input.description);
  const proposition = cleanString(input.proposition);
  const rules = cleanString(input.rules);
  const rawPrompt = [
    cleanString(input.rawPrompt),
    title,
    description,
    proposition,
    rules,
  ].filter(Boolean).join("\n").slice(0, 4000);
  const evidenceMode = evidenceModeFromLegacy(cleanString(input.evidenceType), rawPrompt);
  const inviteMode = inviteModeForLegacy(input, evidenceMode);
  const videoLike = evidenceMode === "same_camera_video" || evidenceMode === "separate_video" || evidenceMode === "live_host_video" || evidenceMode === "photo";
  const objective = description || proposition || title;
  const winCondition = proposition || rules || "The participant whose evidence best satisfies the challenge objective wins.";
  const deadline = cleanString(input.deadline) || "48 hours";

  const spec: ChallengeSpec = {
    challenge_title: title,
    challenge_type: cleanString(input.type) || "legacy_challenge",
    participants: [
      { role: "creator", label: "Creator", user_id: null },
      { role: "opponent", label: "Opponent", user_id: null },
    ],
    stake_amount: cleanNumber(input.stake),
    currency_or_points: "credits",
    public_or_private: input.isPublic === true || input.visibility === "public" ? "public" : "private",
    invite_mode: inviteMode,
    participation_mode: evidenceMode === "same_camera_video" ? "same_camera" : "remote_async",
    objective,
    winning_condition: winCondition,
    required_evidence: evidenceMode === "witness"
      ? "Written/self-report evidence describing the completed attempt or answer."
      : cleanString(input.evidenceType) || "Evidence required by the challenge.",
    video_capture_instructions: videoLike
      ? "Record one continuous attempt. Keep the required people/action visible and preserve device metadata."
      : "Submit clear evidence that directly supports the claimed result.",
    start_condition: "The attempt starts when the challenge rules say it starts or when the participant begins the attempt.",
    end_condition: "The attempt ends when the objective is completed, the deadline expires, or the rules define completion.",
    timing_method: deadline,
    valid_repetition_definition: rules || winCondition,
    scoring_method: winCondition,
    allowed_attempts: "One official attempt unless the challenge rules explicitly allow more.",
    anti_cheat_rules: [
      "Evidence must be original to this challenge.",
      "Evidence must not be edited, misleading, or reused from another attempt.",
      "If identity, timing, or evidence quality is unclear, automatic settlement is blocked.",
    ],
    ai_judging_method: "AI compares submitted evidence against the rules and returns a structured verdict with confidence and blocking issues.",
    dispute_window: "24 hours after verdict",
    fallback_manual_review: "Manual review is required when confidence is below threshold, evidence is unclear, identity is missing, or rules are ambiguous.",
    payout_rule: "Winner receives internal credits only after protocol, evidence, outcome, risk, and confidence gates pass.",
    safety_warning: "Only safe, legal, voluntary challenges are allowed.",
    legal_compliance_flag: "internal_points_only",
    mode_options: [
      { label: "Invite link", value: "invite_link", description: "Send a join link to a known opponent." },
      { label: "Nearby", value: "nearby", description: "Allow nearby users to discover and join." },
      { label: "Same camera", value: "same_camera", description: "Record both participants on one device." },
    ],
  };

  const base = protocolSpecFromChallengeSpec(spec, rawPrompt || title, { language: detectLanguage(rawPrompt || title) });
  const participantMode = inferParticipantModeFromPrompt(rawPrompt || title, base.participantMode);
  const settlementMode = settlementModeForLegacy(evidenceMode, input.aiReview);
  const identityRequired = videoLike;
  const participantBindings = participantBindingsForMode(base, participantMode, evidenceMode);

  return {
    ...base,
    participantMode,
    evidenceProtocol: {
      ...base.evidenceProtocol,
      mode: evidenceMode,
      requiredEvidence: spec.required_evidence ? [spec.required_evidence] : base.evidenceProtocol.requiredEvidence,
      captureInstructions: spec.video_capture_instructions ? [spec.video_capture_instructions] : base.evidenceProtocol.captureInstructions,
      requiredMetadata: videoLike ? ["created_at", "duration", "file_hash", "device_timestamp"] : ["created_at"],
    },
    identityProtocol: {
      ...base.identityProtocol,
      mode: identityRequired
        ? evidenceMode === "same_camera_video" ? "left_right_assignment" : "liveness_phrase"
        : "account_only",
      required: identityRequired,
      participantBindings,
      autoSettlementRequiresIdentityConfidence: 0.85,
    },
    timingProtocol: {
      ...base.timingProtocol,
      deadline,
      tieBreaker: spec.scoring_method,
    },
    settlementProtocol: {
      ...base.settlementProtocol,
      mode: settlementMode,
      winCondition,
      judgeInstructions: [
        spec.ai_judging_method,
        `Scoring method: ${spec.scoring_method}`,
        `Evidence mode: ${evidenceMode}`,
      ],
      autoSettleConfidenceThreshold: 0.85,
    },
    aiBudgetPolicy: {
      ...base.aiBudgetPolicy,
      maxVisionFrames: videoLike ? Math.max(base.aiBudgetPolicy.maxVisionFrames, 12) : 0,
      allowEscalation: true,
      estimatedCostTier: videoLike ? "medium" : "low",
    },
  };
}
