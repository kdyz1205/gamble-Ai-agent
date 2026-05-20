export function pushupVisionProtocol({
  stamp,
  title,
  rawPrompt = "I want to bet who can do more push-ups in 60 seconds.",
  evidenceMode = "separate_video",
  livenessPhrase = null,
}) {
  return {
    version: "2.0",
    title,
    userFacingSummary:
      "Two participants compete to complete the higher number of valid push-ups in a continuous 60-second attempt.",
    rawPrompt,
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "count",
    evidenceProtocol: {
      mode: evidenceMode,
      requiredEvidence: [
        "Continuous video evidence for each participant.",
        "The assigned liveness phrase must be visible or spoken in the video.",
        "Full body, timer context, and the full 60-second attempt must be visible.",
      ],
      captureInstructions: [
        "Keep the whole body visible from start to finish.",
        "Show or say the challenge liveness phrase before the attempt.",
        "Do not cut, crop, loop, speed up, or reuse old footage.",
      ],
      invalidEvidenceRules: [
        "Missing liveness phrase.",
        "Full body not visible.",
        "Video too short for the required attempt.",
        "Static, looped, edited, unrelated, or non-push-up footage.",
      ],
      requiredMetadata: ["livenessPhrase", "fileSizeBytes"],
    },
    identityProtocol: {
      mode: "liveness_phrase",
      required: true,
      participantBindings: [
        {
          role: "creator",
          label: "Participant A",
          expectedPosition: "any",
          requiredPhrase: livenessPhrase ?? undefined,
          requiredQrOrCode: true,
        },
        {
          role: "opponent",
          label: "Participant B",
          expectedPosition: "any",
          requiredPhrase: livenessPhrase ?? undefined,
          requiredQrOrCode: true,
        },
      ],
      autoSettlementRequiresIdentityConfidence: 0.85,
    },
    locationProtocol: {
      mode: "none",
      requiresLiveLocation: false,
      requiresCoPresence: false,
      locationPrivacy: "hidden",
    },
    timingProtocol: {
      startCondition: "Challenge starts after the opponent accepts and recording begins.",
      endCondition: "The attempt ends after 60 seconds of continuous video.",
      deadline: "2 hours",
      tieBreaker: "If valid rep counts are tied, no automatic settlement.",
      allowedAttempts: "1",
    },
    settlementProtocol: {
      mode: "auto_ai_vision",
      winCondition:
        "The participant with the higher valid push-up count in the 60-second continuous video wins.",
      judgeInstructions: [
        "Use visual frames and filmstrip motion, not direct text claims, to infer valid push-up count.",
        "A valid push-up starts at the top with arms extended, lowers the chest/body clearly, maintains a reasonable straight body line, and returns to the top.",
        "Auto-settle only when both identities, duration coverage, visibility, liveness, and evidence quality pass.",
        `This is E2E protocol fixture ${stamp}; do not use that stamp as outcome evidence.`,
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: [
        "confidence below 0.85",
        "missing or unclear liveness phrase",
        "full body not visible",
        "video too short",
        "static, looped, edited, cropped, too dark, blurry, or unrelated evidence",
        "tied or ambiguous rep count",
      ],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: ["Only attempt safe exercise within personal limits.", "Internal credits only."],
      restrictions: ["No real-money gambling.", "Stop if pain, dizziness, or unsafe surroundings appear."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 2200,
      maxVisionFrames: 18,
      allowEscalation: true,
      estimatedCostTier: "medium",
      requireHumanReviewAboveStake: 20,
    },
  };
}
