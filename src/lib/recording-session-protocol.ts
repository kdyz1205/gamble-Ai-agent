import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export type RecordingMode = "same_camera_video" | "separate_video" | "live_host_video";

export type RecordingParticipantBinding = {
  userId: string;
  displayName: string;
  expectedPosition?: string | null;
  livenessCode?: string | null;
  qrToken?: string | null;
  role?: string | null;
  bindingStatus?: string | null;
};

export function isRecordingMode(value: unknown): value is RecordingMode {
  return value === "same_camera_video" || value === "separate_video" || value === "live_host_video";
}

export function recordingModeForProtocol(protocol: ProtocolSpecV2, requestedMode: unknown): RecordingMode | null {
  if (isRecordingMode(requestedMode)) return requestedMode;
  return isRecordingMode(protocol.evidenceProtocol.mode) ? protocol.evidenceProtocol.mode : null;
}

export function buildPreRollInstructions(protocol: ProtocolSpecV2, mode: RecordingMode): string[] {
  const base = [
    ...protocol.evidenceProtocol.captureInstructions,
    ...protocol.evidenceProtocol.requiredEvidence.map((item) => `Required evidence: ${item}`),
  ];
  if (mode === "same_camera_video") {
    return [
      "Creator stands left. Opponent stands right.",
      "Each participant says or shows their own liveness code.",
      "Keep both full bodies visible before, during, and after the attempt.",
      "Start after the countdown and do not cut the recording.",
      ...base,
    ];
  }
  if (mode === "live_host_video") {
    return [
      "Host shows every participant before starting.",
      "Each participant says or shows their own liveness code.",
      "Keep the active attempt visible and continuous.",
      "Start after the countdown and do not cut the recording.",
      ...base,
    ];
  }
  return [
    "Show your face and participant identity before starting.",
    "Say or show your liveness code if one is assigned.",
    "Keep the full attempt visible and continuous.",
    ...base,
  ];
}

export function buildRecordingSessionProtocolJson(input: {
  protocol: ProtocolSpecV2;
  mode: RecordingMode;
  participantBindings: RecordingParticipantBinding[];
  startedByUserId: string;
}) {
  return JSON.stringify({
    protocol: input.protocol,
    mode: input.mode,
    participantBindings: input.participantBindings,
    startedByUserId: input.startedByUserId,
  });
}
