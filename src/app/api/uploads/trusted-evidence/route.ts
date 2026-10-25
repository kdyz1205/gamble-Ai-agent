import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { isEvidenceWindowStatus } from "@/lib/challenge-state-machine";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import {
  TRUSTED_MEDIA_LIMITS,
  TRUSTED_UPLOAD_TTL_SECONDS,
  signTrustedEvidencePut,
  trustedEvidenceUploadsEnabled,
  trustedStorageConfigured,
} from "@/lib/media/trusted-evidence-storage";

export const runtime = "nodejs";

// Feature-gated, private upload intake. It does NOT submit Evidence or judge.
export async function POST(req: NextRequest) {
  if (!trustedEvidenceUploadsEnabled()) {
    return Response.json({ error: "trusted_uploads_disabled" }, { status: 404 });
  }
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (!trustedStorageConfigured()) {
    return Response.json({ error: "trusted_storage_unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const contentType = typeof body.contentType === "string"
    ? body.contentType.split(";")[0].trim().toLowerCase() : "";
  const fileSizeBytes = body.fileSizeBytes;
  const recordingSessionId = typeof body.recordingSessionId === "string"
    ? body.recordingSessionId.trim() : "";
  const maxBytes = TRUSTED_MEDIA_LIMITS[contentType];
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(challengeId) ||
      !maxBytes || !Number.isSafeInteger(fileSizeBytes) ||
      (fileSizeBytes as number) <= 0 || (fileSizeBytes as number) > maxBytes) {
    return Response.json({ error: "invalid_media_request" }, { status: 400 });
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: {
      status: true,
      protocol: { select: { specJson: true } },
      participants: {
        where: { userId: user.userId },
        select: { status: true },
      },
    },
  });
  if (!challenge) return Response.json({ error: "challenge_not_found" }, { status: 404 });
  if (challenge.participants[0]?.status !== "accepted") {
    return Response.json({ error: "participant_not_accepted" }, { status: 403 });
  }
  if (!isEvidenceWindowStatus(challenge.status)) {
    return Response.json({ error: "evidence_window_closed" }, { status: 409 });
  }

  // Same-camera and host video modes require a server-owned recording session.
  let requiresRecordingSession = false;
  try {
    if (challenge.protocol?.specJson) {
      const spec = parseProtocolSpecV2(JSON.parse(challenge.protocol.specJson));
      if (!spec) throw new Error("missing_protocol_spec");
      requiresRecordingSession =
        spec.evidenceProtocol.mode === "same_camera_video" ||
        spec.evidenceProtocol.mode === "live_host_video";
    }
  } catch {
    return Response.json({ error: "invalid_challenge_protocol" }, { status: 409 });
  }
  if (requiresRecordingSession && !recordingSessionId) {
    return Response.json({ error: "recording_session_required" }, { status: 400 });
  }
  if (recordingSessionId) {
    const recording = await prisma.recordingSession.findFirst({
      where: { id: recordingSessionId, challengeId, createdByUserId: user.userId },
      select: { status: true },
    });
    if (!recording || recording.status === "cancelled") {
      return Response.json({ error: "recording_session_mismatch" }, { status: 403 });
    }
  }

  // Bound outstanding upload sessions to prevent unlimited signed PUT issuance.
  const now = new Date();
  const outstanding = await prisma.trustedEvidenceUpload.count({
    where: { userId: user.userId, status: "issued", expiresAt: { gt: now } },
  });
  if (outstanding >= 5) {
    return Response.json({ error: "too_many_pending_uploads" }, { status: 429 });
  }

  const id = randomUUID();
  const key = `trusted-evidence/${challengeId}/${user.userId}/${id}`;
  const expiresAt = new Date(now.getTime() + TRUSTED_UPLOAD_TTL_SECONDS * 1000);
  try {
    // Sign before writing DB row: a failed signer cannot orphan an issued row.
    const { uploadUrl, headers } = await signTrustedEvidencePut(key, contentType);
    await prisma.trustedEvidenceUpload.create({
      data: {
        id,
        challengeId,
        userId: user.userId,
        objectKey: key,
        contentType,
        expectedSizeBytes: fileSizeBytes as number,
        recordingSessionId: recordingSessionId || null,
        expiresAt,
      },
    });
    return Response.json({
      uploadSessionId: id,
      uploadUrl,
      method: "PUT",
      headers,
      expiresAt: expiresAt.toISOString(),
      // Call /api/uploads/trusted-evidence/{uploadSessionId}/complete after PUT.
      status: "issued",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[trusted-upload] session issue failed", err);
    return Response.json({ error: "upload_session_issue_failed" }, { status: 502 });
  }
}
