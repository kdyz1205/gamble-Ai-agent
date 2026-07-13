import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { recordVerdictDecision, ReviewFlowError, VerdictDecision } from "@/lib/verdict-review";

export const runtime = "nodejs";

/**
 * Backward-compatible verdict confirmation endpoint.
 *
 * Confirmation now records this participant's acceptance. Settlement occurs
 * only after every accepted participant has accepted and no review is open.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { id } = await params;

  try {
    const result = await recordVerdictDecision({
      challengeId: id,
      userId: user.userId,
      decision: VerdictDecision.accepted,
    });
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true, image: true } },
        participants: { include: { user: { select: { id: true, username: true, image: true } } } },
        evidence: { include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
        judgments: { include: { winner: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
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
    if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });

    return Response.json(
      {
        challenge,
        judgment: challenge.judgments[0] ?? null,
        settlement: "settlement" in result
          ? result.settlement
          : { success: false, error: "Waiting for all participants" },
        settled: result.settled,
        waitingForUserIds: result.waitingForUserIds,
        reviewCase: result.reviewCase,
      },
      { status: result.settled ? 200 : 202 },
    );
  } catch (error) {
    const status = error instanceof ReviewFlowError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Confirm verdict failed" }, { status });
  }
}
