import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { expireOverdueReviewCases } from "@/lib/verdict-review";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  return !!process.env.DIAG_TOKEN && req.headers.get("x-diag-token") === process.env.DIAG_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const challengeId = req.nextUrl.searchParams.get("challengeId");

  const counts = {
    verdictResponses: await prisma.verdictResponse.count(),
    pendingReviews: await prisma.reviewCase.count({ where: { status: "pending" } }),
    processingReviews: await prisma.reviewCase.count({ where: { status: "processing" } }),
    resolvedReviews: await prisma.reviewCase.count({ where: { status: "resolved" } }),
    expiredReviews: await prisma.reviewCase.count({ where: { status: "expired" } }),
    reviewers: await prisma.user.count({ where: { isReviewer: true } }),
  };
  if (!challengeId) return Response.json({ counts });

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      participants: {
        include: { user: { select: { id: true, email: true, username: true, credits: true, totalCreditsWon: true, totalCreditsLost: true } } },
      },
      judgments: { orderBy: { createdAt: "asc" } },
      verdictResponses: { orderBy: { createdAt: "asc" } },
      reviewCase: true,
      creditTxs: { orderBy: { createdAt: "asc" } },
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!challenge) return Response.json({ error: "challenge not found", counts }, { status: 404 });

  const settlementMarkers = challenge.creditTxs.filter((row) => row.idempotencyKey === `settlement:${challenge.id}`);
  return Response.json({
    counts,
    challenge: {
      id: challenge.id,
      title: challenge.title,
      status: challenge.status,
      stake: challenge.stake,
      participants: challenge.participants.map((participant) => ({
        role: participant.role,
        status: participant.status,
        ...participant.user,
      })),
      judgments: challenge.judgments.map((judgment) => ({
        id: judgment.id,
        method: judgment.method,
        status: judgment.status,
        winnerId: judgment.winnerId,
        confidence: judgment.confidence,
        reasoning: judgment.reasoning,
      })),
      verdictResponses: challenge.verdictResponses,
      reviewCase: challenge.reviewCase,
      creditTxs: challenge.creditTxs.map((row) => ({
        id: row.id,
        userId: row.userId,
        type: row.type,
        amount: row.amount,
        balanceAfter: row.balanceAfter,
        idempotencyKey: row.idempotencyKey,
      })),
      settlementMarkerCount: settlementMarkers.length,
      auditLogs: challenge.auditLogs.map((row) => ({ action: row.action, actorUserId: row.actorUserId, payload: row.payload, createdAt: row.createdAt })),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json() as { action?: unknown; email?: unknown; reviewId?: unknown };

  if (body.action === "promote_reviewer" && typeof body.email === "string") {
    const user = await prisma.user.update({
      where: { email: body.email },
      data: { isReviewer: true },
      select: { id: true, email: true, username: true, isReviewer: true },
    });
    return Response.json({ user });
  }

  if (body.action === "expire_review" && typeof body.reviewId === "string") {
    await prisma.reviewCase.update({
      where: { id: body.reviewId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const outcomes = await expireOverdueReviewCases();
    return Response.json({ outcomes });
  }

  return Response.json({ error: "action must be promote_reviewer or expire_review" }, { status: 400 });
}
