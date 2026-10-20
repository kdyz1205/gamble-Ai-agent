import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { cancelChallengeAtomic } from "@/lib/challenge-cancellation";

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

  // Settlement can commit before a crashed review finishes its final record.
  // Publishing the older recommendation then would show a different winner
  // from the credit ledger. Keep the result unavailable until recovery ends.
  const awaitingReviewCompletion = challenge.status === "settled" && challenge.reviewCase?.status === "processing";
  return Response.json({ challenge: awaitingReviewCompletion ? { ...challenge, judgments: [] } : challenge });
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
