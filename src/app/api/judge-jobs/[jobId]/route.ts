import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { JUDGE_JOB_TIMEOUT_MS, reconcileJudgeJob, sweepStuckJudgeJobs } from "@/lib/judge-async";
import { getAuthUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/judge-jobs/[jobId]
 * Creator or any participant on the challenge may poll status.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { jobId } = await params;
  let job = await prisma.judgeJob.findUnique({
    where: { id: jobId },
    include: {
      challenge: { select: { id: true, creatorId: true, title: true, status: true } },
    },
  });

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  const participant = await prisma.participant.findFirst({
    where: { challengeId: job.challengeId, userId: user.userId },
  });
  const allowed =
    job.requestedByUserId === user.userId ||
    job.challenge.creatorId === user.userId ||
    !!participant;
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only after authorization: finish a committed recommendation's job receipt.
  if (job.status !== "completed" && await reconcileJudgeJob(job.id)) {
    job = await prisma.judgeJob.findUniqueOrThrow({ where: { id: jobId },
      include: { challenge: { select: { id: true, creatorId: true, title: true, status: true } } } });
  }

  // Recovery also runs when the owner polls. The daily maintenance cron alone
  // cannot give a six-minute timeout to a crashed background invocation.
  const timeoutAt = Date.now() - JUDGE_JOB_TIMEOUT_MS;
  const stale = job.status === "pending"
    ? job.createdAt.getTime() < timeoutAt
    : job.status === "processing" && (job.startedAt ?? job.updatedAt).getTime() < timeoutAt;
  if (stale) {
    const recovered = await sweepStuckJudgeJobs(job.id);
    if (recovered.swept > 0) {
      job = await prisma.judgeJob.findUniqueOrThrow({
        where: { id: jobId },
        include: { challenge: { select: { id: true, creatorId: true, title: true, status: true } } },
      });
    }
  }

  let result: unknown = null;
  if (job.resultJson) {
    try {
      result = JSON.parse(job.resultJson) as unknown;
    } catch {
      result = null;
    }
  }

  return Response.json({
    jobId: job.id,
    challengeId: job.challengeId,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.status === "completed" ? result : null,
  });
}
