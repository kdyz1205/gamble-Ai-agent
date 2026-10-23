import type { AuthUser } from "@/lib/auth";
import prisma from "@/lib/db";
import { canReadQuestProof } from "@/lib/quest-proof-access";
import { isBlockedQuestViewer } from "@/lib/user-blocks";

/** Request-scoped identity is resolved by the HTTP route. This pure detail
 * loader also permits isolated anonymous tests without faking Next headers. */
export async function loadChallengeDetail(id: string, viewer: AuthUser | null) {
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
  // A direct Quest URL must not bypass the block applied to feed/discovery.
  // Existing players retain their own historical record for credit reconciliation.
  if (viewer && await isBlockedQuestViewer(viewer.userId, challenge)) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (!await canReadQuestProof(challenge, viewer)) {
    return Response.json({ challenge: { ...challenge, evidence: [], judgments: [], verdictResponses: [], reviewCase: null,
      _count: { ...challenge._count, evidence: 0 }, proofAccess: "players_only" } }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // Settlement can commit before a crashed review finishes its final record.
  // Publishing the older recommendation then would show a different winner
  // from the credit ledger. Keep the result unavailable until recovery ends.
  const awaitingReviewCompletion = challenge.status === "settled" && challenge.reviewCase?.status === "processing";
  return Response.json({ challenge: awaitingReviewCompletion ? { ...challenge, judgments: [] } : challenge }, { headers: { "Cache-Control": "private, no-store" } });
}
