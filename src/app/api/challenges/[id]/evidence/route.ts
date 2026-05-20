import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { preExtractAndPersistFrames } from "@/lib/media/pre-extract-frames";
import { cleanupReplacedEvidenceBlobs } from "@/lib/media/blob-cleanup";
import { ChallengeStatus } from "@/lib/enums";
import { EVIDENCE_WINDOW_STATUSES, isEvidenceWindowStatus } from "@/lib/challenge-state-machine";
import { verifyEvidenceAgainstProtocol } from "@/lib/protocol-evidence-verification";
import { parseProtocolSpecV2, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

// Vision frame extraction + Blob upload can take 5-20s for a longer video.
// Allow the background `after()` task to run up to 5min (Vercel Pro/Enterprise).
export const maxDuration = 300;

function evidencePreextractEnabled() {
  return process.env.ENABLE_EVIDENCE_PREEXTRACT === "true";
}

function isPreextractableMedia(type: string, url: unknown) {
  return Boolean(url && (type === "video" || type === "photo" || type === "image"));
}

function numberFromMetadata(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function preparedFrameCount(raw: string | null | undefined) {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function parseStoredProtocol(raw: string | null | undefined): ProtocolSpecV2 | null {
  if (!raw) return null;
  try {
    return parseProtocolSpecV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

function recordingSessionRequired(protocol: ProtocolSpecV2 | null) {
  return protocol?.evidenceProtocol.mode === "same_camera_video" ||
    protocol?.evidenceProtocol.mode === "live_host_video";
}

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
    const { type = "text", url, description, metadata, recordingSessionId } = body;
    const submittedRecordingSessionId =
      typeof recordingSessionId === "string" && recordingSessionId.trim()
        ? recordingSessionId.trim()
        : null;
    const metadataRecord =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};

    // Verify challenge exists and user is participant
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: { participants: true, protocol: true },
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

    const protocol = parseStoredProtocol(challenge.protocol?.specJson);
    let recordingSessionToClose: { id: string } | null = null;
    if (recordingSessionRequired(protocol)) {
      if (!submittedRecordingSessionId) {
        return Response.json(
          { error: "This challenge requires a recording session before evidence upload." },
          { status: 400 },
        );
      }
      const recordingSession = await prisma.recordingSession.findFirst({
        where: { id: submittedRecordingSessionId, challengeId: id },
        select: { id: true, createdByUserId: true, status: true },
      });
      if (!recordingSession) {
        return Response.json({ error: "Recording session not found for this challenge." }, { status: 404 });
      }
      const sessionOwnerIsParticipant = challenge.participants.some(
        (participant: { userId: string }) => participant.userId === recordingSession.createdByUserId,
      );
      if (!sessionOwnerIsParticipant) {
        return Response.json({ error: "Recording session owner is not a challenge participant." }, { status: 403 });
      }
      if (recordingSession.status === "cancelled") {
        return Response.json({ error: "Recording session was cancelled." }, { status: 409 });
      }
      recordingSessionToClose = { id: recordingSession.id };
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
      if (submittedRecordingSessionId) {
        next.recordingSessionId = submittedRecordingSessionId;
      }
      return Object.keys(next).length > 0 ? JSON.stringify(next) : null;
    };
    const targetUserIds = sharedSameCamera
      ? [
          user.userId,
          ...activeParticipants
            .map((participant: { userId: string }) => participant.userId)
            .filter((participantUserId: string) => participantUserId !== user.userId),
        ]
      : [user.userId];
    const previousEvidenceRows = await prisma.evidence.findMany({
      where: { challengeId: id, userId: { in: targetUserIds } },
      select: { id: true, userId: true, url: true, preparedFrames: true },
    });

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
    const evidenceRows: Array<Awaited<ReturnType<typeof upsertEvidenceFor>>> = [];
    for (const targetUserId of targetUserIds) {
      evidenceRows.push(await upsertEvidenceFor(targetUserId));
    }
    const evidence = evidenceRows[0];
    for (const row of evidenceRows) {
      await prisma.evidenceCheck.upsert({
        where: { evidenceId: row.id },
        create: {
          evidenceId: row.id,
          challengeId: id,
          userId: row.userId,
          protocolVersion: challenge.protocolVersion ?? "2.0",
          decision: "pending",
        },
        update: {
          protocolVersion: challenge.protocolVersion ?? "2.0",
          identityCheckJson: null,
          evidenceCheckJson: null,
          outcomeCheckJson: null,
          identityConfidence: null,
          evidenceConfidence: null,
          outcomeConfidence: null,
          decision: "pending",
          blockingIssues: null,
        },
      });
    }
    for (const row of evidenceRows) {
      await verifyEvidenceAgainstProtocol(row.id).catch((verifyErr) => {
        console.error("[evidence] protocol verification failed", {
          challengeId: id,
          evidenceId: row.id,
          userId: row.userId,
          verifyErr,
        });
      });
    }

    if (recordingSessionToClose) {
      await prisma.recordingSession.update({
        where: { id: recordingSessionToClose.id },
        data: { status: "evidence_submitted", endedAt: new Date() },
      }).catch((sessionErr) => {
        console.error("[evidence] recording session close failed", {
          challengeId: id,
          recordingSessionId: recordingSessionToClose?.id,
          sessionErr,
        });
      });
    }

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

    const uploadedSizeBytes =
      numberFromMetadata(metadataRecord.fileSizeBytes) ??
      numberFromMetadata(metadataRecord.uploadedFileSizeBytes) ??
      numberFromMetadata(metadataRecord.sizeBytes);
    const preextractEnabled = evidencePreextractEnabled();
    const shouldPreextract = preextractEnabled && isPreextractableMedia(type, url);
    console.log(
      `[evidence] challenge=${id} rows=${evidenceRows.length} type=${type} hasUrl=${Boolean(url)} sizeBytes=${uploadedSizeBytes ?? "unknown"} sharedSameCamera=${sharedSameCamera} preextractEnabled=${preextractEnabled}`,
    );

    after(async () => {
      await cleanupReplacedEvidenceBlobs(
        id,
        previousEvidenceRows.map((row) => ({
          evidenceId: row.id,
          url: row.url,
          preparedFrames: row.preparedFrames,
          currentUrl: url ?? null,
        })),
      );

      if (!shouldPreextract) {
        console.log(
          `[pre-extract] skipped challenge=${id} rows=${evidenceRows.length} enabled=${preextractEnabled} media=${isPreextractableMedia(type, url)}`,
        );
        return;
      }

      if (sharedSameCamera) {
        const sourceRow = evidenceRows[0];
        await preExtractAndPersistFrames({
          evidenceId: sourceRow.id,
          challengeId: id,
          userId: sourceRow.userId,
          type,
          url,
        });
        const preparedSource = await prisma.evidence.findUnique({
          where: { id: sourceRow.id },
          select: {
            preparedFrames: true,
            preparedAt: true,
            preparedDurationSec: true,
            preparedMode: true,
            prepareError: true,
          },
        });
        const duplicateIds = evidenceRows.slice(1).map((row) => row.id);
        if (preparedSource && duplicateIds.length > 0) {
          await prisma.evidence.updateMany({
            where: { id: { in: duplicateIds } },
            data: {
              preparedFrames: preparedSource.preparedFrames,
              preparedAt: preparedSource.preparedAt,
              preparedDurationSec: preparedSource.preparedDurationSec,
              preparedMode: preparedSource.preparedMode,
              prepareError: preparedSource.prepareError,
            },
          });
        }
        console.log(
          `[pre-extract] sharedSameCamera reused challenge=${id} sourceEvidence=${sourceRow.id} reusedRows=${duplicateIds.length} frameBlobs=${preparedFrameCount(preparedSource?.preparedFrames)}`,
        );
        return;
      }

      for (const row of evidenceRows) {
        await preExtractAndPersistFrames({
          evidenceId: row.id,
          challengeId: id,
          userId: row.userId,
          type,
          url,
        });
      }
    });

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
