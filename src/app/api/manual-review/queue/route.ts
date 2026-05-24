import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { MANUAL_RESOLUTION_STATUSES } from "@/lib/manual-review-policy";

export const runtime = "nodejs";

function limitFromRequest(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? 25);
  if (!Number.isFinite(raw)) return 25;
  return Math.min(100, Math.max(1, Math.floor(raw)));
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const limit = limitFromRequest(req);
  const statuses = [...MANUAL_RESOLUTION_STATUSES] as string[];
  const challenges = await prisma.challenge.findMany({
    where: {
      status: { in: statuses },
      OR: [
        { creatorId: user.userId },
        { participants: { some: { userId: user.userId } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      creator: { select: { id: true, username: true, image: true } },
      participants: {
        include: { user: { select: { id: true, username: true, image: true } } },
        orderBy: { joinedAt: "asc" },
      },
      evidence: {
        select: { id: true, userId: true, type: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      judgments: {
        include: { winner: { select: { id: true, username: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { evidence: true, judgments: true, participants: true } },
    },
  });

  return Response.json({
    items: challenges.map((challenge) => {
      const latestJudgment = challenge.judgments[0] ?? null;
      return {
        challengeId: challenge.id,
        title: challenge.title,
        status: challenge.status,
        updatedAt: challenge.updatedAt,
        createdAt: challenge.createdAt,
        creator: challenge.creator,
        participants: challenge.participants.map((participant) => ({
          id: participant.id,
          userId: participant.userId,
          role: participant.role,
          status: participant.status,
          username: participant.user.username,
          image: participant.user.image,
        })),
        evidenceCount: challenge._count.evidence,
        judgmentCount: challenge._count.judgments,
        participantCount: challenge._count.participants,
        latestEvidence: challenge.evidence.slice(0, 4),
        latestJudgment: latestJudgment
          ? {
              id: latestJudgment.id,
              winnerId: latestJudgment.winnerId,
              winnerName: latestJudgment.winner?.username ?? null,
              confidence: latestJudgment.confidence,
              method: latestJudgment.method,
              aiModel: latestJudgment.aiModel,
              createdAt: latestJudgment.createdAt,
            }
          : null,
        canResolve: challenge.creatorId === user.userId,
        resolveUrl: `/api/challenges/${challenge.id}/manual-resolve`,
        disputeUrl: `/api/challenges/${challenge.id}/dispute`,
      };
    }),
    count: challenges.length,
    statuses,
  });
}
