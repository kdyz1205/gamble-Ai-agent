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

const PARTICIPANT_MODES: ProtocolSpecV2["participantMode"][] = ["solo", "head_to_head", "small_group", "team_vs_team", "mass_crowd", "public_market"];
const OUTCOME_TYPES: ProtocolSpecV2["outcomeType"][] = ["speed", "count", "completion", "threshold", "yes_no", "ranking", "quality_score", "prediction", "location_checkin", "survival_duration", "custom"];
const EVIDENCE_MODES: ProtocolSpecV2["evidenceProtocol"]["mode"][] = ["same_camera_video", "separate_video", "live_host_video", "photo", "screenshot", "gps", "receipt", "public_oracle", "platform_metric", "witness", "manual_review"];
const IDENTITY_MODES: ProtocolSpecV2["identityProtocol"]["mode"][] = ["account_only", "liveness_phrase", "left_right_assignment", "qr_participant_card", "host_checkin", "group_lobby_ticket", "manual_identity_review"];
const LOCATION_MODES: ProtocolSpecV2["locationProtocol"]["mode"][] = ["none", "nearby_discovery", "same_place_required", "walk_to_join", "geo_fenced_zone", "live_route", "mass_local_event"];
const LOCATION_PRIVACY: ProtocolSpecV2["locationProtocol"]["locationPrivacy"][] = ["hidden", "approximate", "precise_until_challenge_ends", "precise_live_only"];
const SETTLEMENT_MODES: ProtocolSpecV2["settlementProtocol"]["mode"][] = ["auto_oracle", "auto_ai_text", "auto_ai_vision", "leaderboard", "host_confirmed", "peer_confirmed", "manual_review", "blocked"];
const RISK_LEVELS: ProtocolSpecV2["riskPolicy"]["riskLevel"][] = ["safe", "medium", "high", "blocked"];
const COST_TIERS: ProtocolSpecV2["aiBudgetPolicy"]["estimatedCostTier"][] = ["low", "medium", "high"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringValue(value: unknown, fallback = "") {
  return nonEmptyString(value) ?? fallback;
}

function stringArrayValue(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    const out = value.map((item) => String(item).trim()).filter(Boolean);
    return out.length ? out : fallback;
  }
  const text = nonEmptyString(value);
  return text ? [text] : fallback;
}

function pickField(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function numberValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|required|1)$/i.test(value.trim())) return true;
    if (/^(false|no|optional|0)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function normalizedEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  aliases: Record<string, T>,
  fallback?: T,
): T | null {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback ?? null;
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if ((allowed as readonly string[]).includes(normalized)) return normalized as T;
  return aliases[normalized] ?? fallback ?? null;
}

function normalizeBindings(value: unknown): ProtocolSpecV2["identityProtocol"]["participantBindings"] {
  const raw = Array.isArray(value) ? value : [];
  const bindings = raw.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const role = normalizedEnum(
      pickField(record, "role", "participantRole", "participant_role"),
      ["creator", "opponent", "participant", "host"] as const,
      {
        player_a: "creator",
        participant_a: "creator",
        side_a: "creator",
        player_b: "opponent",
        participant_b: "opponent",
        side_b: "opponent",
        challenger: "creator",
        challenged: "opponent",
        subject: "participant",
      },
    );
    if (!role) return [];
    return [{
      role,
      label: stringValue(pickField(record, "label", "displayName", "display_name", "name"), role === "creator" ? "Creator" : role === "opponent" ? "Opponent" : "Participant"),
      expectedPosition: normalizedEnum(
        pickField(record, "expectedPosition", "expected_position", "position"),
        ["left", "right", "center", "any"] as const,
        { none: "any", either: "any", unknown: "any" },
        "any",
      ) ?? "any",
      ...(nonEmptyString(pickField(record, "requiredPhrase", "required_phrase", "livenessPhrase", "liveness_phrase")) ? { requiredPhrase: nonEmptyString(pickField(record, "requiredPhrase", "required_phrase", "livenessPhrase", "liveness_phrase")) ?? undefined } : {}),
      requiredQrOrCode: booleanValue(pickField(record, "requiredQrOrCode", "required_qr_or_code", "qrRequired", "qr_required"), false),
    }];
  });
  if (!bindings.some((binding) => binding.role === "creator")) {
    bindings.unshift({ role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false });
  }
  return bindings;
}

function unwrapProtocolRecord(input: unknown): Record<string, unknown> | null {
  const root = asRecord(input);
  if (!root) return null;
  const wrapperKeys = [
    "protocol",
    "protocolSpec",
    "protocolSpecV2",
    "ProtocolSpecV2",
    "challengeProtocol",
    "compiledProtocol",
    "spec",
  ];
  for (const key of wrapperKeys) {
    const wrapped = asRecord(root[key]);
    if (wrapped) {
      return {
        ...wrapped,
        rawPrompt: wrapped.rawPrompt ?? root.rawPrompt,
        language: wrapped.language ?? root.language,
      };
    }
  }
  return root;
}

function normalizeProtocolCandidate(input: unknown): ProtocolSpecV2 | null {
  const candidate = unwrapProtocolRecord(input);
  if (!candidate) return null;

  const title = nonEmptyString(pickField(candidate, "title", "challengeTitle", "challenge_title"));
  const summary = nonEmptyString(pickField(candidate, "userFacingSummary", "user_facing_summary", "summary", "description", "objective"));
  if (!title || !summary) return null;

  const evidence = asRecord(pickField(candidate, "evidenceProtocol", "evidence_protocol", "evidence"));
  const identity = asRecord(pickField(candidate, "identityProtocol", "identity_protocol", "identity"));
  const location = asRecord(pickField(candidate, "locationProtocol", "location_protocol", "location"));
  const timing = asRecord(pickField(candidate, "timingProtocol", "timing_protocol", "timing"));
  const settlement = asRecord(pickField(candidate, "settlementProtocol", "settlement_protocol", "settlement"));
  const risk = asRecord(pickField(candidate, "riskPolicy", "risk_policy", "risk"));
  const budget = asRecord(pickField(candidate, "aiBudgetPolicy", "ai_budget_policy", "budget", "aiBudget"));
  if (!evidence || !identity || !location || !timing || !settlement || !risk || !budget) return null;

  const evidenceMode = normalizedEnum(pickField(evidence, "mode", "evidenceMode", "evidence_mode"), EVIDENCE_MODES, {
    video: "separate_video",
    videos: "separate_video",
    video_upload: "separate_video",
    uploaded_media: "separate_video",
    camera: "separate_video",
    camera_video: "separate_video",
    uploaded_video: "separate_video",
    separate: "separate_video",
    one_phone: "same_camera_video",
    shared_video: "same_camera_video",
    same_camera: "same_camera_video",
    same_device: "same_camera_video",
    live_video: "live_host_video",
    image: "photo",
    images: "photo",
    picture: "photo",
    photos: "photo",
    text: "witness",
    self_report: "witness",
    oracle: "public_oracle",
    public_data: "public_oracle",
    data_source: "public_oracle",
    app_metric: "platform_metric",
  });
  const identityMode = normalizedEnum(pickField(identity, "mode", "identityMode", "identity_mode"), IDENTITY_MODES, {
    none: "account_only",
    not_required: "account_only",
    no_identity: "account_only",
    account: "account_only",
    account_identity: "account_only",
    liveness: "liveness_phrase",
    liveness_code: "liveness_phrase",
    phrase: "liveness_phrase",
    left_right: "left_right_assignment",
    same_camera: "left_right_assignment",
    qr: "qr_participant_card",
    qr_code: "qr_participant_card",
    manual: "manual_identity_review",
  });
  const locationMode = normalizedEnum(pickField(location, "mode", "locationMode", "location_mode"), LOCATION_MODES, {
    no_location: "none",
    not_required: "none",
    nearby: "nearby_discovery",
    walk_by: "walk_to_join",
    walkby: "walk_to_join",
    same_place: "same_place_required",
    geofence: "geo_fenced_zone",
    mass_event: "mass_local_event",
  });
  const settlementMode = normalizedEnum(pickField(settlement, "mode", "settlementMode", "settlement_mode"), SETTLEMENT_MODES, {
    oracle: "auto_oracle",
    public_oracle: "auto_oracle",
    data_oracle: "auto_oracle",
    ai_text: "auto_ai_text",
    text_ai: "auto_ai_text",
    ai_vision: "auto_ai_vision",
    vision_ai: "auto_ai_vision",
    auto_ai: "auto_ai_vision",
    vision: "auto_ai_vision",
    ai_referee: "auto_ai_vision",
    ai_judge: "auto_ai_vision",
    manual: "manual_review",
    human_review: "manual_review",
    blocked_by_policy: "blocked",
  });
  if (!evidenceMode || !identityMode || !locationMode || !settlementMode) return null;

  return {
    version: "2.0",
    title,
    userFacingSummary: summary,
    rawPrompt: stringValue(pickField(candidate, "rawPrompt", "raw_prompt")),
    language: normalizedEnum(pickField(candidate, "language", "lang"), ["en", "zh", "auto"] as const, { chinese: "zh", english: "en" }, "auto") ?? "auto",
    participantMode: normalizedEnum(pickField(candidate, "participantMode", "participant_mode", "mode"), PARTICIPANT_MODES, {
      one_person: "solo",
      single_person: "solo",
      self_challenge: "solo",
      self: "solo",
      single: "solo",
      pet: "solo",
      two_player: "head_to_head",
      two_person: "head_to_head",
      one_vs_one: "head_to_head",
      "1v1": "head_to_head",
      group: "small_group",
      teams: "team_vs_team",
      crowd: "mass_crowd",
      event: "mass_crowd",
      market: "public_market",
      prediction_market: "public_market",
    }, "head_to_head") ?? "head_to_head",
    outcomeType: normalizedEnum(pickField(candidate, "outcomeType", "outcome_type"), OUTCOME_TYPES, {
      fastest: "speed",
      race: "speed",
      time: "speed",
      timed: "speed",
      reps: "count",
      rep_count: "count",
      number: "count",
      pass_fail: "completion",
      task_completion: "completion",
      boolean: "yes_no",
      true_false: "yes_no",
      leaderboard: "ranking",
      subjective: "quality_score",
      price_prediction: "prediction",
      checkin: "location_checkin",
      check_in: "location_checkin",
      duration: "survival_duration",
    }, "custom") ?? "custom",
    evidenceProtocol: {
      mode: evidenceMode,
      requiredEvidence: stringArrayValue(pickField(evidence, "requiredEvidence", "required_evidence"), ["Submit evidence that directly proves the challenge outcome."]),
      captureInstructions: stringArrayValue(pickField(evidence, "captureInstructions", "capture_instructions"), ["Capture the full attempt clearly and continuously."]),
      invalidEvidenceRules: stringArrayValue(pickField(evidence, "invalidEvidenceRules", "invalid_evidence_rules"), ["Edited, unclear, reused, unsafe, or non-consensual evidence is invalid."]),
      requiredMetadata: stringArrayValue(pickField(evidence, "requiredMetadata", "required_metadata"), ["created_at"]),
    },
    identityProtocol: {
      mode: identityMode,
      required: booleanValue(pickField(identity, "required", "isRequired", "is_required"), evidenceMode.includes("video") || evidenceMode === "photo"),
      participantBindings: normalizeBindings(pickField(identity, "participantBindings", "participant_bindings", "bindings")),
      autoSettlementRequiresIdentityConfidence: numberValue(pickField(identity, "autoSettlementRequiresIdentityConfidence", "auto_settlement_requires_identity_confidence", "identityConfidenceThreshold", "identity_confidence_threshold"), 0.85),
    },
    locationProtocol: {
      mode: locationMode,
      ...(pickField(location, "joinRadiusMeters", "join_radius_meters") !== undefined ? { joinRadiusMeters: numberValue(pickField(location, "joinRadiusMeters", "join_radius_meters"), 500) } : {}),
      ...(pickField(location, "challengeRadiusMeters", "challenge_radius_meters") !== undefined ? { challengeRadiusMeters: numberValue(pickField(location, "challengeRadiusMeters", "challenge_radius_meters"), 500) } : {}),
      requiresLiveLocation: booleanValue(pickField(location, "requiresLiveLocation", "requires_live_location"), locationMode !== "none"),
      requiresCoPresence: booleanValue(pickField(location, "requiresCoPresence", "requires_co_presence"), locationMode === "same_place_required"),
      locationPrivacy: normalizedEnum(pickField(location, "locationPrivacy", "location_privacy"), LOCATION_PRIVACY, {
        private: "hidden",
        approximate_public: "approximate",
        precise_live: "precise_live_only",
        precise_until_end: "precise_until_challenge_ends",
      }, locationMode === "none" ? "hidden" : "approximate") ?? "hidden",
    },
    timingProtocol: {
      startCondition: stringValue(pickField(timing, "startCondition", "start_condition"), "Challenge starts after all required participants accept."),
      endCondition: stringValue(pickField(timing, "endCondition", "end_condition"), "Challenge ends when the protocol objective is completed or the deadline expires."),
      deadline: stringValue(pickField(timing, "deadline", "timeLimit", "time_limit"), "48 hours"),
      tieBreaker: stringValue(pickField(timing, "tieBreaker", "tie_breaker"), pickField(settlement, "winCondition", "win_condition") ? String(pickField(settlement, "winCondition", "win_condition")) : "Manual review decides ties."),
      allowedAttempts: stringValue(pickField(timing, "allowedAttempts", "allowed_attempts"), "One official attempt unless the protocol says otherwise."),
    },
    settlementProtocol: {
      mode: settlementMode,
      winCondition: stringValue(pickField(settlement, "winCondition", "win_condition"), summary),
      judgeInstructions: stringArrayValue(pickField(settlement, "judgeInstructions", "judge_instructions", "judgingInstructions", "judging_instructions"), ["Compare submitted evidence against the win condition."]),
      autoSettleConfidenceThreshold: numberValue(pickField(settlement, "autoSettleConfidenceThreshold", "auto_settle_confidence_threshold", "confidenceThreshold", "confidence_threshold"), 0.85),
      manualReviewTriggers: stringArrayValue(pickField(settlement, "manualReviewTriggers", "manual_review_triggers"), ["Confidence below threshold or evidence/identity is unclear."]),
    },
    riskPolicy: {
      riskLevel: normalizedEnum(pickField(risk, "riskLevel", "risk_level"), RISK_LEVELS, { low: "safe", moderate: "medium", unsafe: "high", disallowed: "blocked" }, "safe") ?? "safe",
      allowed: booleanValue(pickField(risk, "allowed", "isAllowed", "is_allowed"), true),
      warnings: stringArrayValue(pickField(risk, "warnings", "warning"), []),
      restrictions: stringArrayValue(pickField(risk, "restrictions", "restriction"), []),
      ...(nonEmptyString(pickField(risk, "safeAlternative", "safe_alternative")) ? { safeAlternative: nonEmptyString(pickField(risk, "safeAlternative", "safe_alternative")) ?? undefined } : {}),
      ...(nonEmptyString(pickField(risk, "blockedReason", "blocked_reason")) ? { blockedReason: nonEmptyString(pickField(risk, "blockedReason", "blocked_reason")) ?? undefined } : {}),
    },
    aiBudgetPolicy: {
      compileMaxTokens: numberValue(pickField(budget, "compileMaxTokens", "compile_max_tokens"), 1800),
      judgeMaxTokens: numberValue(pickField(budget, "judgeMaxTokens", "judge_max_tokens"), evidenceMode.includes("video") ? 2200 : 1200),
      maxVisionFrames: numberValue(pickField(budget, "maxVisionFrames", "max_vision_frames"), evidenceMode.includes("video") || evidenceMode === "photo" ? 12 : 0),
      allowEscalation: booleanValue(pickField(budget, "allowEscalation", "allow_escalation"), false),
      estimatedCostTier: normalizedEnum(pickField(budget, "estimatedCostTier", "estimated_cost_tier"), COST_TIERS, { cheap: "low", light: "low", normal: "medium", expensive: "high" }, "low") ?? "low",
      ...(pickField(budget, "requireHumanReviewAboveStake", "require_human_review_above_stake") !== undefined ? { requireHumanReviewAboveStake: numberValue(pickField(budget, "requireHumanReviewAboveStake", "require_human_review_above_stake"), 20) } : {}),
    },
  };
}

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
      deadline: "48 hours",
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

function normalizedProtocolIssues(input: unknown): string[] {
  const normalized = normalizeProtocolCandidate(input);
  if (!normalized) return ["Could not normalize candidate into ProtocolSpecV2 shape"];
  const candidate = normalized as Partial<ProtocolSpecV2>;
  const issues: string[] = [];
  if (candidate.version !== "2.0") issues.push("version must be 2.0");
  if (typeof candidate.title !== "string" || !candidate.title.trim()) issues.push("title is required");
  if (typeof candidate.userFacingSummary !== "string" || !candidate.userFacingSummary.trim()) issues.push("userFacingSummary is required");
  if (typeof candidate.rawPrompt !== "string") issues.push("rawPrompt must be a string");
  if (candidate.language !== "en" && candidate.language !== "zh" && candidate.language !== "auto") issues.push("language is invalid");
  if (!candidate.participantMode || !PARTICIPANT_MODES.includes(candidate.participantMode)) issues.push("participantMode is invalid");
  if (!candidate.outcomeType || !OUTCOME_TYPES.includes(candidate.outcomeType)) issues.push("outcomeType is invalid");

  const evidence = candidate.evidenceProtocol;
  if (!evidence || !EVIDENCE_MODES.includes(evidence.mode)) issues.push("evidenceProtocol.mode is invalid");
  if (!evidence || !Array.isArray(evidence.requiredEvidence) || !Array.isArray(evidence.captureInstructions) || !Array.isArray(evidence.invalidEvidenceRules) || !Array.isArray(evidence.requiredMetadata)) issues.push("evidenceProtocol arrays are required");

  const identity = candidate.identityProtocol;
  if (!identity || !IDENTITY_MODES.includes(identity.mode)) issues.push("identityProtocol.mode is invalid");
  if (!identity || typeof identity.required !== "boolean") issues.push("identityProtocol.required must be boolean");
  if (!identity || !Array.isArray(identity.participantBindings)) issues.push("identityProtocol.participantBindings must be an array");
  if (!identity || typeof identity.autoSettlementRequiresIdentityConfidence !== "number" || !Number.isFinite(identity.autoSettlementRequiresIdentityConfidence)) issues.push("identityProtocol.autoSettlementRequiresIdentityConfidence must be numeric");

  const location = candidate.locationProtocol;
  if (!location || !LOCATION_MODES.includes(location.mode) || !LOCATION_PRIVACY.includes(location.locationPrivacy)) issues.push("locationProtocol is invalid");

  const timing = candidate.timingProtocol;
  if (!timing || typeof timing.startCondition !== "string" || typeof timing.endCondition !== "string" || typeof timing.deadline !== "string" || typeof timing.allowedAttempts !== "string") issues.push("timingProtocol strings are required");

  const settlement = candidate.settlementProtocol;
  if (!settlement || !SETTLEMENT_MODES.includes(settlement.mode)) issues.push("settlementProtocol.mode is invalid");
  if (!settlement || typeof settlement.winCondition !== "string" || !Array.isArray(settlement.judgeInstructions) || !Array.isArray(settlement.manualReviewTriggers)) issues.push("settlementProtocol fields are required");
  if (!settlement || typeof settlement.autoSettleConfidenceThreshold !== "number" || !Number.isFinite(settlement.autoSettleConfidenceThreshold)) issues.push("settlementProtocol.autoSettleConfidenceThreshold must be numeric");

  const risk = candidate.riskPolicy;
  if (!risk || !RISK_LEVELS.includes(risk.riskLevel) || typeof risk.allowed !== "boolean" || !Array.isArray(risk.warnings) || !Array.isArray(risk.restrictions)) issues.push("riskPolicy is invalid");

  const budget = candidate.aiBudgetPolicy;
  if (!budget || typeof budget.compileMaxTokens !== "number" || typeof budget.judgeMaxTokens !== "number" || typeof budget.maxVisionFrames !== "number" || typeof budget.allowEscalation !== "boolean" || !COST_TIERS.includes(budget.estimatedCostTier)) issues.push("aiBudgetPolicy is invalid");

  return issues;
}

export function protocolSpecV2ValidationIssues(input: unknown): string[] {
  return normalizedProtocolIssues(input);
}

export function parseProtocolSpecV2(input: unknown): ProtocolSpecV2 | null {
  if (normalizedProtocolIssues(input).length) return null;
  const normalized = normalizeProtocolCandidate(input);
  if (!normalized) return null;
  const candidate = normalized as Partial<ProtocolSpecV2>;

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
    disputeWindow: "24 hours after verdict",
    isPublic: ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(protocol.locationProtocol.mode) || protocol.participantMode === "mass_crowd",
    visibility: ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(protocol.locationProtocol.mode) ? "public" : "invite_only",
  };
}

export function challengeSpecFromProtocol(protocol: ProtocolSpecV2): ChallengeSpec {
  const creator = protocol.identityProtocol.participantBindings.find((item) => item.role === "creator");
  const opponent = protocol.identityProtocol.participantBindings.find((item) => item.role === "opponent");
  const inviteMode: ChallengeSpec["invite_mode"] =
    protocol.locationProtocol.mode === "nearby_discovery" || protocol.locationProtocol.mode === "walk_to_join"
      ? "nearby"
      : protocol.evidenceProtocol.mode === "same_camera_video"
        ? "same_device"
        : "invite_link";
  const participationMode: ChallengeSpec["participation_mode"] =
    protocol.evidenceProtocol.mode === "same_camera_video"
      ? "same_camera"
      : protocol.locationProtocol.requiresCoPresence
        ? "in_person"
        : "remote_async";
  const publicOrPrivate: ChallengeSpec["public_or_private"] =
    ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(protocol.locationProtocol.mode) ||
    protocol.participantMode === "mass_crowd" ||
    protocol.participantMode === "public_market"
      ? "public"
      : "private";

  return {
    challenge_title: protocol.title,
    challenge_type: protocol.outcomeType,
    participants: protocol.participantMode === "solo"
      ? [{ role: "creator", label: creator?.label || "Creator", user_id: null }]
      : [
          { role: "creator", label: creator?.label || "Creator", user_id: null },
          { role: "opponent", label: opponent?.label || "Opponent", user_id: null },
        ],
    stake_amount: 0,
    currency_or_points: "credits",
    public_or_private: publicOrPrivate,
    invite_mode: inviteMode,
    participation_mode: participationMode,
    objective: protocol.userFacingSummary,
    winning_condition: protocol.settlementProtocol.winCondition,
    required_evidence: protocol.evidenceProtocol.requiredEvidence.join(" "),
    video_capture_instructions: protocol.evidenceProtocol.captureInstructions.join(" "),
    start_condition: protocol.timingProtocol.startCondition,
    end_condition: protocol.timingProtocol.endCondition,
    timing_method: protocol.timingProtocol.deadline,
    valid_repetition_definition: protocol.settlementProtocol.judgeInstructions.find((item) => /valid/i.test(item)) || protocol.settlementProtocol.winCondition,
    scoring_method: protocol.timingProtocol.tieBreaker || protocol.settlementProtocol.winCondition,
    allowed_attempts: protocol.timingProtocol.allowedAttempts,
    anti_cheat_rules: protocol.evidenceProtocol.invalidEvidenceRules,
    ai_judging_method: protocol.settlementProtocol.judgeInstructions.join(" "),
    dispute_window: "24 hours after verdict",
    fallback_manual_review: protocol.settlementProtocol.manualReviewTriggers.join(" "),
    payout_rule: protocol.settlementProtocol.mode === "blocked"
      ? "No payout. This challenge cannot settle while blocked."
      : "Winner receives internal credits only after protocol, identity, evidence, outcome, and confidence gates pass.",
    safety_warning: [
      ...protocol.riskPolicy.warnings,
      ...protocol.riskPolicy.restrictions,
      protocol.riskPolicy.blockedReason,
    ].filter(Boolean).join(" ") || "Only attempt safe, legal, voluntary challenges.",
    legal_compliance_flag: protocol.riskPolicy.allowed && protocol.riskPolicy.riskLevel !== "high"
      ? "internal_points_only"
      : "requires_legal_review",
    mode_options: [
      { label: "Invite link", value: "invite_link", description: "Send a join link to a known opponent." },
      { label: "Nearby", value: "nearby", description: "Allow nearby users to discover and join." },
      { label: "Same camera", value: "same_camera", description: "Record both participants on one device with identity binding." },
    ],
  };
}
