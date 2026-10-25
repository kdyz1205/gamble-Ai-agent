import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";

export const runtime = "nodejs";

/**
 * Read-only discovery of an existing background judgment job.
 * Enables safe resume after mobile Safari reloads or suspends a tab.
 * Never dispatches a worker, reserves paid inference, or settles credits.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: {
      creatorId: true,
      status: true,
      participants: {
        where: {
          userId: user.userId,
          role: { in: ["creator", "opponent"] },
          status: "accepted",
        },
        select: { id: true },
      },
    },
  });
  if (!challenge) return Response.json({ error: "Quest not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId && challenge.participants.length === 0) {
    return Response.json({ error: "Only accepted Quest players may view the referee job" }, { status: 403 });
  }
  // Finalized Quest receipt owns the settled result, not a stale background job.
  if (!["judging", "disputed", "pending_settlement"].includes(challenge.status)) {
    return Response.json({ job: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const active = await prisma.judgeJob.findFirst({
    where: { challengeId: id, status: { in: ["pending", "processing"] } },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  const job = active ?? await prisma.judgeJob.findFirst({
    where: { challengeId: id },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({
    job: job ? { jobId: job.id, status: job.status } : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
