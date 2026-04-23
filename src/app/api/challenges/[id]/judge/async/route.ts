import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, getAiModel, unauthorized, noCredits, type TierId } from "@/lib/auth";
import { getCredits, TIER_MULTIPLIER } from "@/lib/credits";
import { runJudgeJob } from "@/lib/judge-async";
import { isEvidenceUrlAllowed } from "@/lib/media/evidence-url";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/challenges/[id]/judge/async
 * Body: { tier?, providerId?, model?, webhookUrl? }
 *
 * Returns 202 immediately; work continues via `after()` (ffmpeg + vision + recommendation).
 * Poll GET /api/judge-jobs/[jobId] or receive optional HTTPS webhook.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let tierId: TierId = 1;
  let providerId: string | undefined;
  let model: string | undefined;
  let webhookUrl: string | undefined;
  try {
    const body = await req.json();
    if ([1, 2, 3].includes(body?.tier)) tierId = body.tier as TierId;
    if (typeof body?.providerId === "string") providerId = body.providerId;
    if (typeof body?.model === "string") model = body.model;
    if (typeof body?.webhookUrl === "string") webhookUrl = body.webhookUrl.trim() || undefined;
  } catch {
    /* defaults */
  }

  if (webhookUrl && !isEvidenceUrlAllowed(webhookUrl)) {
    return Response.json({ error: "webhookUrl must be a safe public https URL" }, { status: 400 });
  }

  const cost = TIER_MULTIPLIER[tierId];
  const balance = await getCredits(user.userId);
  if (balance < cost) return noCredits(cost, balance, getAiModel(tierId).displayName);

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { creatorId: true, status: true, title: true },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only the creator can trigger judgment" }, { status: 403 });
  }
  if (challenge.status !== "judging") {
    return Response.json(
      {
        error:
          "AI verdict is unlocked after every player submits evidence. When all sides are in, status becomes Judging.",
      },
      { status: 400 },
    );
  }

  const inflight = await prisma.judgeJob.findFirst({
    where: { challengeId: id, status: { in: ["pending", "processing"] } },
    select: { id: true },
  });
  if (inflight) {
    return Response.json(
      {
        error: "A verdict job is already running for this challenge",
        jobId: inflight.id,
        pollUrl: `/api/judge-jobs/${inflight.id}`,
      },
      { status: 409 },
    );
  }

  const job = await prisma.judgeJob.create({
    data: {
      challengeId: id,
      requestedByUserId: user.userId,
      tierId,
      providerId: providerId ?? null,
      model: model ?? null,
      webhookUrl: webhookUrl ?? null,
      status: "pending",
    },
  });

  after(() => runJudgeJob(job.id));

  const origin = req.headers.get("x-forwarded-host")
    ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}`
    : "";
  const pollUrl = `${origin}/api/judge-jobs/${job.id}`;

  return Response.json(
    {
      status: "processing",
      jobId: job.id,
      pollUrl: `/api/judge-jobs/${job.id}`,
      pollUrlAbsolute: origin ? pollUrl : undefined,
      message:
        "AI recommendation runs in the background (video frames + vision). Poll pollUrl or use webhookUrl; creator confirmation settles credits.",
    },
    { status: 202 },
  );
}
