import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { generateLivenessPhrase } from "@/lib/liveness";
import { parseProtocolSpecV2, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

function parseStoredProtocol(raw: string | null | undefined): ProtocolSpecV2 | null {
  if (!raw) return null;
  try {
    return parseProtocolSpecV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function expectedPositionFor(protocol: ProtocolSpecV2, role: string) {
  const normalizedRole = role === "creator" || role === "opponent" || role === "host" ? role : "participant";
  return protocol.identityProtocol.participantBindings.find((binding) => binding.role === normalizedRole)?.expectedPosition ?? "any";
}

function instructionsFor(protocol: ProtocolSpecV2, expectedPosition: string | null, livenessCode: string | null, qrToken: string) {
  return [
    ...protocol.evidenceProtocol.captureInstructions,
    expectedPosition && expectedPosition !== "any" ? `Stand on the ${expectedPosition} side before the attempt starts.` : "Keep your face and body visible before the attempt starts.",
    livenessCode ? `Say or show this liveness code at the start: ${livenessCode}.` : "Use your signed-in account identity.",
    `Show this participant ticket if requested: ${qrToken}.`,
    "Do not cut, edit, replace, or obscure the evidence.",
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
  const requestedUserId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : user.userId;
  const requestedParticipantId = typeof body.participantId === "string" && body.participantId.trim() ? body.participantId.trim() : null;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      protocol: true,
      participants: { include: { user: { select: { id: true, username: true } } } },
    },
  });
  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });

  const requesterParticipant = challenge.participants.find((participant) => participant.userId === user.userId);
  if (!requesterParticipant && challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only participants can issue binding instructions" }, { status: 403 });
  }
  if (requestedUserId !== user.userId && challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only the creator can issue binding instructions for another participant" }, { status: 403 });
  }

  const targetParticipant = requestedParticipantId
    ? challenge.participants.find((participant) => participant.id === requestedParticipantId)
    : challenge.participants.find((participant) => participant.userId === requestedUserId);
  if (!targetParticipant) {
    return Response.json({ error: "Target participant is not in this challenge" }, { status: 404 });
  }

  const protocol = parseStoredProtocol(challenge.protocol?.specJson);
  if (!protocol) {
    return Response.json({ error: "Challenge has no ProtocolSpecV2; identity binding cannot be issued" }, { status: 409 });
  }

  const expectedPosition = expectedPositionFor(protocol, targetParticipant.role);
  const livenessCode = protocol.identityProtocol.required ? generateLivenessPhrase() : null;
  const qrToken = `GMB-${randomBytes(5).toString("hex").toUpperCase()}`;

  const binding = await prisma.participantBinding.upsert({
    where: { challengeId_userId: { challengeId: id, userId: targetParticipant.userId } },
    create: {
      challengeId: id,
      userId: targetParticipant.userId,
      participantId: targetParticipant.id,
      role: targetParticipant.role,
      displayName: targetParticipant.user.username,
      expectedPosition,
      livenessCode,
      qrTokenHash: hashToken(qrToken),
      bindingStatus: protocol.identityProtocol.required ? "pending" : "verified",
    },
    update: {
      participantId: targetParticipant.id,
      role: targetParticipant.role,
      displayName: targetParticipant.user.username,
      expectedPosition,
      livenessCode,
      qrTokenHash: hashToken(qrToken),
      bindingStatus: protocol.identityProtocol.required ? "pending" : "verified",
      identityConfidence: null,
      identityCheckJson: null,
      verifiedAt: null,
    },
  });

  return Response.json({
    bindingId: binding.id,
    expectedPosition,
    livenessCode,
    qrToken,
    instructions: instructionsFor(protocol, expectedPosition, livenessCode, qrToken),
  });
}
