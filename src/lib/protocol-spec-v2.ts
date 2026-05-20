import type { ChallengeSpec } from "@/lib/challenge-spec";

export type ProtocolSpecV2 = {
  version: "2.0";
  title: string;
  userFacingSummary: string;
  rawPrompt: string;
  language: "en" | "zh" | "auto";
  participantMode: "solo" | "head_to_head" | "small_group" | "team_vs_team" | "mass_crowd" | "public_market";
  outcomeType: "speed" | "count" | "completion" | "threshold" | "yes_no" | "ranking" | "quality_score" | "prediction" | "location_checkin" | "survival_duration" | "custom";
  evidenceProtocol: {
    mode: "same_camera_video" | "separate_video" | "live_host_video" | "photo" | "screenshot" | "gps" | "receipt" | "public_oracle" | "platform_metric" | "witness" | "manual_review";
    requiredEvidence: string[];
    captureInstructions: string[];
    invalidEvidenceRules: string[];
    requiredMetadata: string[];
  };
  identityProtocol: {
    mode: "account_only" | "liveness_phrase" | "left_right_assignment" | "qr_participant_card" | "host_checkin" | "group_lobby_ticket" | "manual_identity_review";
    required: boolean;
    participantBindings: Array<{
      role: "creator" | "opponent" | "participant" | "host";
      label: string;
      expectedPosition?: "left" | "right" | "center" | "any";
      requiredPhrase?: string;
      requiredQrOrCode?: boolean;
    }>;
    autoSettlementRequiresIdentityConfidence: number;
  };
  locationProtocol: {
    mode: "none" | "nearby_discovery" | "same_place_required" | "walk_to_join" | "geo_fenced_zone" | "live_route" | "mass_local_event";
    joinRadiusMeters?: number;
    challengeRadiusMeters?: number;
    requiresLiveLocation?: boolean;
    requiresCoPresence?: boolean;
    locationPrivacy: "hidden" | "approximate" | "precise_until_challenge_ends" | "precise_live_only";
  };
  timingProtocol: {
    startCondition: string;
    endCondition: string;
    deadline: string;
    tieBreaker?: string;
    allowedAttempts: string;
  };
  settlementProtocol: {
    mode: "auto_oracle" | "auto_ai_text" | "auto_ai_vision" | "leaderboard" | "host_confirmed" | "peer_confirmed" | "manual_review" | "blocked";
    winCondition: string;
    judgeInstructions: string[];
    autoSettleConfidenceThreshold: number;
    manualReviewTriggers: string[];
  };
  riskPolicy: {
    riskLevel: "safe" | "medium" | "high" | "blocked";
    allowed: boolean;
    warnings: string[];
    restrictions: string[];
    safeAlternative?: string;
    blockedReason?: string;
  };
  aiBudgetPolicy: {
    compileMaxTokens: number;
    judgeMaxTokens: number;
    maxVisionFrames: number;
    allowEscalation: boolean;
    estimatedCostTier: "low" | "medium" | "high";
    requireHumanReviewAboveStake?: number;
  };
};

export type ProtocolPreviewV2 = {
  title: string;
  summary: string;
  badges: string[];
  warnings: string[];
  requiredSteps: string[];
};

function detectLanguage(input: string): ProtocolSpecV2["language"] {
  if (/[\u3400-\u9fff]/.test(input)) return "zh";
  if (/[A-Za-z]/.test(input)) return "en";
  return "auto";
}

function splitText(value: string | string[] | undefined, fallback: string): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value || fallback).trim();
  return text
    .split(/\n+|(?:^|\s)(?:\d+\.|[-*])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function outcomeFromSpec(spec: ChallengeSpec): ProtocolSpecV2["outcomeType"] {
  const text = [
    spec.challenge_title,
    spec.objective,
    spec.winning_condition,
    spec.scoring_method,
  ].join(" ").toLowerCase();
  if (/fast|speed|time|quick|race/.test(text)) return "speed";
  if (/count|rep|push[-\s]?up|more|most/.test(text)) return "count";
  if (/where|location|gps|check[-\s]?in/.test(text)) return "location_checkin";
  if (/predict|will |yes|no/.test(text)) return "prediction";
  if (/rank|leaderboard|top/.test(text)) return "ranking";
  return "completion";
}

function evidenceModeFromSpec(spec: ChallengeSpec): ProtocolSpecV2["evidenceProtocol"]["mode"] {
  const text = [spec.participation_mode, spec.invite_mode, spec.required_evidence].join(" ").toLowerCase();
  if (/same[_ -]?camera|same_device|one phone|shared/.test(text)) return "same_camera_video";
  if (/gps|location/.test(text)) return "gps";
  if (/photo|picture/.test(text)) return "photo";
  if (/screenshot/.test(text)) return "screenshot";
  if (/oracle|public/.test(text)) return "public_oracle";
  if (/video|camera|record/.test(text)) return "separate_video";
  return "manual_review";
}

function participantModeFromSpec(spec: ChallengeSpec): ProtocolSpecV2["participantMode"] {
  const count = Array.isArray(spec.participants) ? spec.participants.length : 2;
  if (count <= 1) return "solo";
  if (count === 2) return "head_to_head";
  if (count > 20) return "mass_crowd";
  return "small_group";
}

function settlementModeForEvidence(
  evidenceMode: ProtocolSpecV2["evidenceProtocol"]["mode"],
  legalFlag: ChallengeSpec["legal_compliance_flag"],
): ProtocolSpecV2["settlementProtocol"]["mode"] {
  if (legalFlag === "requires_legal_review") return "manual_review";
  if (evidenceMode === "same_camera_video" || evidenceMode === "separate_video" || evidenceMode === "photo") {
    return "auto_ai_vision";
  }
  if (evidenceMode === "public_oracle" || evidenceMode === "platform_metric" || evidenceMode === "gps") {
    return "auto_oracle";
  }
  return "manual_review";
}

export function protocolSpecFromChallengeSpec(
  spec: ChallengeSpec,
  rawPrompt: string,
  options?: { language?: ProtocolSpecV2["language"] },
): ProtocolSpecV2 {
  const evidenceMode = evidenceModeFromSpec(spec);
  const sameCamera = evidenceMode === "same_camera_video";
  const videoLike = evidenceMode === "same_camera_video" || evidenceMode === "separate_video" || evidenceMode === "photo";
  const nearby = spec.invite_mode === "nearby";
  const legalReview = spec.legal_compliance_flag === "requires_legal_review";
  const identityBindings = [
    {
      role: "creator" as const,
      label: spec.participants?.[0]?.label || "Creator",
      expectedPosition: sameCamera ? "left" as const : "any" as const,
      requiredQrOrCode: videoLike,
    },
    {
      role: "opponent" as const,
      label: spec.participants?.[1]?.label || "Opponent",
      expectedPosition: sameCamera ? "right" as const : "any" as const,
      requiredQrOrCode: videoLike,
    },
  ];

  return {
    version: "2.0",
    title: spec.challenge_title,
    userFacingSummary: spec.objective,
    rawPrompt,
    language: options?.language ?? detectLanguage(rawPrompt),
    participantMode: participantModeFromSpec(spec),
    outcomeType: outcomeFromSpec(spec),
    evidenceProtocol: {
      mode: evidenceMode,
      requiredEvidence: splitText(spec.required_evidence, "Submit evidence required by the challenge."),
      captureInstructions: splitText(spec.video_capture_instructions, "Capture the full attempt continuously."),
      invalidEvidenceRules: [
        ...splitText(spec.anti_cheat_rules, "No edited or unclear evidence."),
        "Evidence that does not satisfy identity, timing, or visibility requirements cannot auto-settle.",
      ],
      requiredMetadata: videoLike
        ? ["created_at", "duration", "file_hash", "device_timestamp"]
        : ["created_at"],
    },
    identityProtocol: {
      mode: sameCamera ? "left_right_assignment" : videoLike ? "liveness_phrase" : "account_only",
      required: videoLike,
      participantBindings: identityBindings,
      autoSettlementRequiresIdentityConfidence: 0.85,
    },
    locationProtocol: {
      mode: nearby ? "nearby_discovery" : "none",
      joinRadiusMeters: nearby ? 500 : undefined,
      challengeRadiusMeters: nearby ? 500 : undefined,
      requiresLiveLocation: nearby,
      requiresCoPresence: spec.participation_mode === "in_person" || sameCamera,
      locationPrivacy: nearby ? "approximate" : "hidden",
    },
    timingProtocol: {
      startCondition: spec.start_condition,
      endCondition: spec.end_condition,
      deadline: spec.dispute_window || "24 hours",
      tieBreaker: spec.scoring_method,
      allowedAttempts: spec.allowed_attempts,
    },
    settlementProtocol: {
      mode: settlementModeForEvidence(evidenceMode, spec.legal_compliance_flag),
      winCondition: spec.winning_condition,
      judgeInstructions: [
        spec.ai_judging_method,
        `Scoring method: ${spec.scoring_method}`,
        `Valid attempt definition: ${spec.valid_repetition_definition}`,
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: [
        spec.fallback_manual_review,
        "Identity confidence below threshold.",
        "Evidence quality is unclear, insufficient, invalid, edited, or too short.",
      ],
    },
    riskPolicy: {
      riskLevel: legalReview ? "medium" : "safe",
      allowed: true,
      warnings: splitText(spec.safety_warning, "Only attempt safe, legal, voluntary challenges."),
      restrictions: legalReview ? ["Manual legal or safety review required before settlement."] : [],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 1800,
      judgeMaxTokens: videoLike ? 2200 : 1200,
      maxVisionFrames: videoLike ? 18 : 0,
      allowEscalation: false,
      estimatedCostTier: videoLike ? "medium" : "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

export function parseProtocolSpecV2(input: unknown): ProtocolSpecV2 | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Partial<ProtocolSpecV2>;
  if (candidate.version !== "2.0") return null;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) return null;
  if (typeof candidate.rawPrompt !== "string") return null;
  if (!candidate.evidenceProtocol || !candidate.identityProtocol || !candidate.settlementProtocol || !candidate.riskPolicy) {
    return null;
  }
  return candidate as ProtocolSpecV2;
}

export function protocolPreview(protocol: ProtocolSpecV2): ProtocolPreviewV2 {
  return {
    title: protocol.title,
    summary: protocol.userFacingSummary,
    badges: [
      protocol.participantMode,
      protocol.outcomeType,
      protocol.evidenceProtocol.mode,
      protocol.identityProtocol.mode,
      protocol.locationProtocol.mode,
      protocol.settlementProtocol.mode,
    ],
    warnings: protocol.riskPolicy.warnings,
    requiredSteps: [
      "Confirm protocol",
      protocol.identityProtocol.required ? "Bind participant identity" : "Use account identity",
      `Submit evidence: ${protocol.evidenceProtocol.mode}`,
      `Judge by: ${protocol.settlementProtocol.mode}`,
      `Auto-settle threshold: ${Math.round(protocol.settlementProtocol.autoSettleConfidenceThreshold * 100)}%`,
    ],
  };
}

export function protocolToLegacyChallengeFields(protocol: ProtocolSpecV2) {
  return {
    title: protocol.title,
    description: protocol.userFacingSummary,
    proposition: protocol.userFacingSummary,
    type: protocol.outcomeType === "prediction" ? "Prediction" : protocol.outcomeType === "location_checkin" ? "Location" : "Challenge",
    rules: [
      `Summary: ${protocol.userFacingSummary}`,
      `Evidence mode: ${protocol.evidenceProtocol.mode}`,
      `Evidence: ${protocol.evidenceProtocol.requiredEvidence.join(" ")}`,
      `Capture: ${protocol.evidenceProtocol.captureInstructions.join(" ")}`,
      `Identity: ${protocol.identityProtocol.mode}. Required: ${protocol.identityProtocol.required ? "yes" : "no"}.`,
      `Start: ${protocol.timingProtocol.startCondition}`,
      `End: ${protocol.timingProtocol.endCondition}`,
      `Win condition: ${protocol.settlementProtocol.winCondition}`,
      ...protocol.settlementProtocol.judgeInstructions.map((instruction) => `AI judging: ${instruction}`),
      `Manual review: ${protocol.settlementProtocol.manualReviewTriggers.join(" ")}`,
      `Safety: ${protocol.riskPolicy.warnings.join(" ")}`,
    ].join("\n"),
    evidenceType: protocol.evidenceProtocol.mode,
    settlementMode: protocol.settlementProtocol.mode,
    fallbackRule: protocol.settlementProtocol.manualReviewTriggers.join(" "),
    disputeWindow: protocol.timingProtocol.deadline,
    isPublic: ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(protocol.locationProtocol.mode) || protocol.participantMode === "mass_crowd",
    visibility: ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(protocol.locationProtocol.mode) ? "public" : "invite_only",
  };
}
