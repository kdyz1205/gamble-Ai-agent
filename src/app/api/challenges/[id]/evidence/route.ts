import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { preExtractAndPersistFrames } from "@/lib/media/pre-extract-frames";

// Vision frame extraction + Blob upload can take 5-20s for a longer video.
// Allow the background `after()` task to run up to 5min (Vercel Pro/Enterprise).
export const maxDuration = 300;

/**
 * POST /api/challenges/[id]/evidence — Submit evidence for a challenge
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();
  const { type = "text", url, description, metadata } = body;

  // Verify challenge exists and user is participant
  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  if (!["live", "matched"].includes(challenge.status)) {
    return Response.json({ error: "Challenge is not active" }, { status: 400 });
  }

  const isParticipant = challenge.participants.some((p: { userId: string }) => p.userId === user.userId);
  if (!isParticipant) {
    return Response.json({ error: "You are not a participant in this challenge" }, { status: 403 });
  }

  // Create evidence
  const evidence = await prisma.evidence.create({
    data: {
      challengeId: id,
      userId: user.userId,
      type,
      url,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
    include: {
      user: { select: { id: true, username: true } },
    },
  });

  // Activity event
  await prisma.activityEvent.create({
    data: {
      type: "evidence_submitted",
      message: `${user.username} submitted ${type} evidence for "${challenge.title}"`,
      userId: user.userId,
      challengeId: id,
    },
  });

  // Check if all participants have submitted evidence
  const allEvidenceUsers = await prisma.evidence.findMany({
    where: { challengeId: id },
    select: { userId: true },
    distinct: ["userId"],
  });
  const activeParticipants = challenge.participants.filter((p: { status: string }) => p.status === "accepted");

  if (allEvidenceUsers.length >= activeParticipants.length) {
    // Move to judging
    await prisma.challenge.update({
      where: { id },
      data: { status: "judging" },
    });
  }

  // Fire-and-forget pre-extraction of vision frames so the judge call later
  // can skip ffmpeg entirely. Runs AFTER response is sent; errors are captured
  // into Evidence.prepareError (never crashes the request).
  if (url && (type === "video" || type === "photo" || type === "image")) {
    after(async () => {
      await preExtractAndPersistFrames({
        evidenceId: evidence.id,
        challengeId: id,
        userId: user.userId,
        type,
        url,
      });
    });
  }

  return Response.json({ evidence }, { status: 201 });
}

/**
 * GET /api/challenges/[id]/evidence — List evidence for a challenge
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const evidence = await prisma.evidence.findMany({
    where: { challengeId: id },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ evidence });
}
