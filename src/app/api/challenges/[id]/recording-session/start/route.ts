import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { parseProtocolSpecV2, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import {
  buildPreRollInstructions,
  buildRecordingSessionProtocolJson,
  recordingModeForProtocol,
} from "@/lib/recording-session-protocol";

function parseStoredProtocol(raw: string | null | undefined): ProtocolSpecV2 | null {
  if (!raw) return null;
  try {
    return parseProtocolSpecV2(JSON.parse(raw));
  } catch {
    return null;
  }
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

  const requestedMode = recordingModeForProtocol(protocol, body.mode);
  if (!requestedMode) {
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

  const protocolJson = buildRecordingSessionProtocolJson({
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
    preRollInstructions: buildPreRollInstructions(protocol, requestedMode),
    startCountdown: 3,
    startCondition: protocol.timingProtocol.startCondition,
    endCondition: protocol.timingProtocol.endCondition,
    participantBindings,
  });
}
