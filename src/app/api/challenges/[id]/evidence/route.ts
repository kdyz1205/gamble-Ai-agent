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
  try {
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
      return Response.json({ error: `Challenge is not active (status=${challenge.status})` }, { status: 400 });
    }

    const isParticipant = challenge.participants.some((p: { userId: string }) => p.userId === user.userId);
    if (!isParticipant) {
      return Response.json({ error: "You are not a participant in this challenge" }, { status: 403 });
    }

    // Upsert — one Evidence row per (challengeId, userId), matching the new
    // @@unique([challengeId, userId]) constraint. If the user re-submits we
    // replace the old evidence instead of stacking N rows and confusing the
    // judge's `.find(e => e.userId === creator)` which picks the first match.
    // Also clears prepared frames so the background pre-extract starts fresh.
    const evidence = await prisma.evidence.upsert({
      where: {
        challengeId_userId: { challengeId: id, userId: user.userId },
      },
      create: {
        challengeId: id,
        userId: user.userId,
        type,
        url: url ?? null,
        description: description ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
      update: {
        type,
        url: url ?? null,
        description: description ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        preparedFrames: null,
        preparedAt: null,
        preparedDurationSec: null,
        preparedMode: null,
        prepareError: null,
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

    // Atomic transition: only the request that actually fills the last seat
    // flips the status. Two in-flight submissions racing can both read
    // allEvidenceUsers.length >= N and try to set status=judging; that's
    // benign here but makes a noisy activity feed. updateMany with a status
    // guard ensures exactly one transition lands.
    const activeParticipants = challenge.participants.filter((p: { status: string }) => p.status === "accepted");
    const allEvidenceUsers = await prisma.evidence.findMany({
      where: { challengeId: id },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (allEvidenceUsers.length >= activeParticipants.length) {
      await prisma.challenge.updateMany({
        where: { id, status: { in: ["live", "matched"] } },
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
  } catch (err) {
    console.error(`[evidence POST ${id}] uncaught:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Evidence submission failed" },
      { status: 500 },
    );
  }
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
