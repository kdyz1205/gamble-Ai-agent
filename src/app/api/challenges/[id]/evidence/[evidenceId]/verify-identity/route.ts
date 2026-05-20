import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { verifyEvidenceAgainstProtocol } from "@/lib/protocol-evidence-verification";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id, evidenceId } = await params;
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      challenge: {
        select: {
          id: true,
          creatorId: true,
          participants: {
            select: {
              userId: true,
              role: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!evidence || evidence.challengeId !== id) {
    return Response.json({ error: "Evidence not found" }, { status: 404 });
  }

  const isParticipant = evidence.challenge.participants.some((participant) => participant.userId === user.userId);
  const canVerify =
    evidence.userId === user.userId ||
    evidence.challenge.creatorId === user.userId ||
    isParticipant;
  if (!canVerify) {
    return Response.json({ error: "Only challenge participants can verify evidence" }, { status: 403 });
  }

  try {
    const result = await verifyEvidenceAgainstProtocol(evidenceId);
    return Response.json(result);
  } catch (err) {
    console.error(`[verify-identity ${id}/${evidenceId}] uncaught:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Evidence verification failed" },
      { status: 500 },
    );
  }
}

