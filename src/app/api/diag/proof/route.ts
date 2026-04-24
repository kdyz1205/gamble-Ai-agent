/**
 * GET /api/diag/proof?email=...
 *
 * Dumps verifiable evidence that a specific user's activity produced real
 * DB rows + real AI calls. For every challenge they created we surface:
 *   - Challenge row fields
 *   - Every CreditTx attributed to that challenge (stake, ai_parse, ai_judge,
 *     win, loss, refund) with balanceAfter
 *   - Every Judgment row with aiModel + reasoning + confidence
 *   - Evidence rows (what was submitted)
 *
 * The AI model names + reasoning strings are stored by the running judge —
 * they ARE proof that the upstream provider actually replied. Hallucinated
 * challenges would have no matching Judgment row at all.
 *
 * Gated by DIAG_TOKEN to keep it from leaking across users.
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-diag-token");
  if (!process.env.DIAG_TOKEN || token !== process.env.DIAG_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "10"), 50);
  if (!email) {
    return Response.json({ error: "email required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      credits: true,
      totalCreditsWon: true,
      totalCreditsLost: true,
      totalCreditsBought: true,
      createdAt: true,
    },
  });
  if (!user) return Response.json({ error: "no such user" }, { status: 404 });

  // Recent challenges created by this user (proof of AI parse + creation)
  const challenges = await prisma.challenge.findMany({
    where: { creatorId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      participants: {
        include: { user: { select: { id: true, username: true } } },
      },
      evidence: {
        select: {
          userId: true, type: true, url: true, description: true, createdAt: true,
          preparedMode: true, preparedDurationSec: true,
        },
      },
      judgments: {
        select: {
          id: true, method: true, aiModel: true, reasoning: true,
          confidence: true, status: true, createdAt: true, winnerId: true,
        },
        orderBy: { createdAt: "desc" },
      },
      creditTxs: {
        select: {
          id: true, type: true, amount: true, balanceAfter: true,
          description: true, createdAt: true, userId: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Also include CreditTx rows not attached to a specific challenge (topup, bonus, etc.)
  const recentTxs = await prisma.creditTx.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true, type: true, amount: true, balanceAfter: true,
      challengeId: true, description: true, createdAt: true,
    },
  });

  // Aggregate counts — quick sanity check
  const counts = {
    challengesCreated: challenges.length,
    judgmentsWithAiModel: challenges.reduce((n, c) => n + c.judgments.filter((j) => !!j.aiModel).length, 0),
    aiParseTxs: recentTxs.filter((t) => t.type === "ai_parse").length,
    aiJudgeTxs: recentTxs.filter((t) => t.type === "ai_judge").length,
    stakeTxs: recentTxs.filter((t) => t.type === "stake").length,
    winTxs: recentTxs.filter((t) => t.type === "win").length,
    lossTxs: recentTxs.filter((t) => t.type === "loss").length,
    refundTxs: recentTxs.filter((t) => t.type === "refund").length,
  };

  return Response.json({
    user,
    counts,
    challenges: challenges.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      type: c.type,
      marketType: c.marketType,
      proposition: c.proposition,
      stake: c.stake,
      aiModel: c.aiModel,
      createdAt: c.createdAt,
      // Every Judgment row's aiModel + reasoning proves the upstream provider replied.
      judgments: c.judgments.map((j) => ({
        id: j.id,
        method: j.method,
        aiModel: j.aiModel,
        status: j.status,
        winnerId: j.winnerId,
        confidence: j.confidence,
        reasoningPreview: (j.reasoning ?? "").slice(0, 300),
        createdAt: j.createdAt,
      })),
      evidence: c.evidence.map((e) => ({
        userId: e.userId,
        type: e.type,
        hasUrl: !!e.url,
        descriptionPreview: (e.description ?? "").slice(0, 120),
        preparedMode: e.preparedMode,
        preparedDurationSec: e.preparedDurationSec,
        createdAt: e.createdAt,
      })),
      creditTxs: c.creditTxs.map((t) => ({
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        userId: t.userId,
        description: t.description,
        createdAt: t.createdAt,
      })),
      participants: c.participants.map((p) => ({ userId: p.userId, username: p.user.username, role: p.role, status: p.status })),
    })),
    recentTxsAll: recentTxs,
  });
}
