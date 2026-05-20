import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getAuthUser();

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: {
      id: true,
      creatorId: true,
      isPublic: true,
      visibility: true,
      protocol: true,
      participantBindings: {
        orderBy: { createdAt: "asc" },
      },
      participants: {
        select: { userId: true },
      },
    },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  const isParticipant = Boolean(user && challenge.participants.some((participant) => participant.userId === user.userId));
  const canRead = challenge.isPublic || challenge.visibility === "public" || isParticipant || user?.userId === challenge.creatorId;
  if (!canRead) {
    return Response.json({ error: "You do not have access to this challenge protocol" }, { status: 403 });
  }

  const protocol = challenge.protocol?.specJson ? JSON.parse(challenge.protocol.specJson) : null;
  const canSeeSensitive = Boolean(user && (isParticipant || user.userId === challenge.creatorId));
  const participantBindings = challenge.participantBindings.map((binding) => ({
    id: binding.id,
    challengeId: binding.challengeId,
    userId: binding.userId,
    participantId: binding.participantId,
    role: binding.role,
    displayName: binding.displayName,
    expectedPosition: binding.expectedPosition,
    bindingStatus: binding.bindingStatus,
    identityConfidence: binding.identityConfidence,
    verifiedAt: binding.verifiedAt,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
    livenessCode: canSeeSensitive && binding.userId === user?.userId ? binding.livenessCode : null,
    qrTokenHash: null,
  }));

  return Response.json({
    challengeId: challenge.id,
    protocol,
    participantBindings,
  });
}
