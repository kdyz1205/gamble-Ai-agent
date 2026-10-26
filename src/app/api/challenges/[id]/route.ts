import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { cancelChallengeAtomic } from "@/lib/challenge-cancellation";
import { canReadQuestProof } from "@/lib/quest-proof-access";

/**
 * GET /api/challenges/[id] — Get a single challenge with full details
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, image: true } },
      participants: {
        include: { user: { select: { id: true, username: true, image: true } } },
      },
      evidence: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "desc" },
      },
      judgments: {
        // A review may have claimed a pending manual decision without settling.
        // Only committed recommendations/results belong in the player view.
        where: { status: "completed" },
        include: {
          winner: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      verdictResponses: {
        select: { userId: true, decision: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
      },
      reviewCase: {
        select: {
          id: true,
          status: true,
          resolution: true,
          resolvedWinnerId: true,
          expiresAt: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
      _count: { select: { evidence: true, participants: true } },
    },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (!await canReadQuestProof(challenge)) {
    return Response.json({ challenge: { ...challenge, evidence: [], judgments: [], verdictResponses: [], reviewCase: null,
      _count: { ...challenge._count, evidence: 0 }, proofAccess: "players_only" } }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // Settlement can commit before a crashed review finishes its final record.
  // Publishing the older recommendation then would show a different winner
  // from the credit ledger. Keep the result unavailable until recovery ends.
  const awaitingReviewCompletion = challenge.status === "settled" && challenge.reviewCase?.status === "processing";
  const linkedUploads = process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS === "true"
    ? await prisma.trustedEvidenceUpload.findMany({
      where: { challengeId: id, status: "consumed", evidenceId: {
        in: challenge.evidence.map(row => row.id),
      } },
      select: { id: true, evidenceId: true },
    })
    : [];
  const links = new Map(linkedUploads.filter(row => row.evidenceId)
    .map(row => [row.evidenceId!, row.id] as const));
  const visible = {
    ...challenge,
    evidence: challenge.evidence.map(row => ({
      ...row,
      trustedUploadId: links.get(row.id) ?? null,
    })),
    ...(awaitingReviewCompletion ? { judgments: [] } : {}),
  };
  return Response.json({ challenge: visible }, { headers: { "Cache-Control": "private, no-store" } });
}

/** DELETE retains the quest as cancelled; legacy success fields remain available. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return unauthorized();
  try {
    const result = await cancelChallengeAtomic(id, user.userId);
    return Response.json(result, { status: result.ok ? 200 : result.status });
  } catch {
    return Response.json({ error: "Quest cancellation could not complete. Please retry." }, { status: 500 });
  }
}
