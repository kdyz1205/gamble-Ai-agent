import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { preExtractAndPersistFrames } from "@/lib/media/pre-extract-frames";
import { ChallengeStatus } from "@/lib/enums";
import { EVIDENCE_WINDOW_STATUSES, isEvidenceWindowStatus } from "@/lib/challenge-state-machine";

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
    const metadataRecord =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};

    // Verify challenge exists and user is participant
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!challenge) {
      return Response.json({ error: "Challenge not found" }, { status: 404 });
    }

    if (!isEvidenceWindowStatus(challenge.status)) {
      return Response.json({ error: `Challenge is not active (status=${challenge.status})` }, { status: 400 });
    }

    const isParticipant = challenge.participants.some((p: { userId: string }) => p.userId === user.userId);
    if (!isParticipant) {
      return Response.json({ error: "You are not a participant in this challenge" }, { status: 403 });
    }

    const activeParticipants = challenge.participants.filter((p: { status: string }) => p.status === "accepted");
    const sharedSameCamera = metadataRecord.sharedSameCamera === true;
    const evidenceDescription = sharedSameCamera
      ? [
          description ?? null,
          "Shared same-camera evidence for both accepted participants. Judge must identify both people in the same media and compare the visible result; unclear identity or finish order requires no winner.",
        ].filter(Boolean).join("\n")
      : (description ?? null);
    const metadataFor = (targetUserId: string) => {
      const next: Record<string, unknown> = { ...metadataRecord };
      if (sharedSameCamera) {
        next.sharedSameCamera = true;
        next.sharedUploadedBy = user.userId;
        next.sharedEvidenceFor = targetUserId;
        next.identityGuidance = "Creator/Participant A should be on the left and opponent/Participant B on the right when possible.";
      }
      return Object.keys(next).length > 0 ? JSON.stringify(next) : null;
    };
    const upsertEvidenceFor = (targetUserId: string) =>
      prisma.evidence.upsert({
        where: {
          challengeId_userId: { challengeId: id, userId: targetUserId },
        },
        create: {
          challengeId: id,
          userId: targetUserId,
          type,
          url: url ?? null,
          description: evidenceDescription,
          metadata: metadataFor(targetUserId),
        },
        update: {
          type,
          url: url ?? null,
          description: evidenceDescription,
          metadata: metadataFor(targetUserId),
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

    // Upsert — one Evidence row per (challengeId, userId), matching the new
    // @@unique([challengeId, userId]) constraint. If the user re-submits we
    // replace the old evidence instead of stacking N rows and confusing the
    // judge's `.find(e => e.userId === creator)` which picks the first match.
    // Also clears prepared frames so the background pre-extract starts fresh.
    const evidenceRows = [await upsertEvidenceFor(user.userId)];
    if (sharedSameCamera) {
      for (const participant of activeParticipants) {
        if (participant.userId === user.userId) continue;
        evidenceRows.push(await upsertEvidenceFor(participant.userId));
      }
    }
    const evidence = evidenceRows[0];

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
    const allEvidenceUsers = await prisma.evidence.findMany({
      where: { challengeId: id },
      select: { userId: true },
      distinct: ["userId"],
    });
    const submitted = new Set(allEvidenceUsers.map((row) => row.userId));
    const creatorSubmitted = submitted.has(challenge.creatorId);
    const opponentSubmitted = activeParticipants.some(
      (participant: { userId: string; role: string }) =>
        participant.role === "opponent" && submitted.has(participant.userId),
    );
    const nextStatus = allEvidenceUsers.length >= activeParticipants.length
      ? ChallengeStatus.ai_reviewing
      : creatorSubmitted
        ? ChallengeStatus.creator_submitted
        : opponentSubmitted
          ? ChallengeStatus.opponent_submitted
          : ChallengeStatus.evidence_window_open;

    await prisma.challenge.updateMany({
      where: { id, status: { in: [...EVIDENCE_WINDOW_STATUSES] } },
      data: { status: nextStatus },
    });

    // Fire-and-forget pre-extraction of vision frames so the judge call later
    // can skip ffmpeg entirely. Runs AFTER response is sent; errors are captured
    // into Evidence.prepareError (never crashes the request).
    if (url && (type === "video" || type === "photo" || type === "image")) {
      for (const row of evidenceRows) {
        after(async () => {
          await preExtractAndPersistFrames({
            evidenceId: row.id,
            challengeId: id,
            userId: row.userId,
            type,
            url,
          });
        });
      }
    }

    return Response.json({ evidence, sharedEvidenceCount: evidenceRows.length }, { status: 201 });
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
