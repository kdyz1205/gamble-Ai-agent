import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { parseProtocolSpecV2, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

type RecordingMode = "same_camera_video" | "separate_video" | "live_host_video";

function parseStoredProtocol(raw: string | null | undefined): ProtocolSpecV2 | null {
  if (!raw) return null;
  try {
    return parseProtocolSpecV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

function isRecordingMode(value: unknown): value is RecordingMode {
  return value === "same_camera_video" || value === "separate_video" || value === "live_host_video";
}

function preRollInstructions(protocol: ProtocolSpecV2, mode: RecordingMode) {
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
  return [
    "Show your face and participant identity before starting.",
    "Say or show your liveness code if one is assigned.",
    "Keep the full attempt visible and continuous.",
    ...base,
  ];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      protocol: true,
      participants: { include: { user: { select: { id: true, username: true } } } },
      participantBindings: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });

  const requesterParticipant = challenge.participants.find((participant) => participant.userId === user.userId);
  if (!requesterParticipant) {
    return Response.json({ error: "Only accepted participants can start a recording session" }, { status: 403 });
  }

  const protocol = parseStoredProtocol(challenge.protocol?.specJson);
  if (!protocol) {
    return Response.json({ error: "Challenge has no ProtocolSpecV2; recording session cannot start" }, { status: 409 });
  }

  const requestedMode = isRecordingMode(body.mode) ? body.mode : protocol.evidenceProtocol.mode;
  if (!isRecordingMode(requestedMode)) {
    return Response.json({ error: `Protocol evidence mode ${protocol.evidenceProtocol.mode} is not a recording mode` }, { status: 400 });
  }

  const participantBindings = challenge.participantBindings.map((binding) => {
    const participant = challenge.participants.find((item) => item.userId === binding.userId);
    return {
      userId: binding.userId,
      displayName: binding.displayName || participant?.user.username || "Participant",
      expectedPosition: binding.expectedPosition,
      livenessCode: binding.livenessCode,
      qrToken: binding.qrTokenHash ? "issued" : null,
      role: binding.role,
      bindingStatus: binding.bindingStatus,
    };
  });

  const protocolJson = JSON.stringify({
    protocol,
    mode: requestedMode,
    participantBindings,
    startedByUserId: user.userId,
  });

  const session = await prisma.recordingSession.create({
    data: {
      challengeId: id,
      createdByUserId: user.userId,
      mode: requestedMode,
      protocolJson,
      status: "started",
    },
  });

  return Response.json({
    recordingSessionId: session.id,
    mode: requestedMode,
    preRollInstructions: preRollInstructions(protocol, requestedMode),
    startCountdown: 3,
    startCondition: protocol.timingProtocol.startCondition,
    endCondition: protocol.timingProtocol.endCondition,
    participantBindings,
  });
}
