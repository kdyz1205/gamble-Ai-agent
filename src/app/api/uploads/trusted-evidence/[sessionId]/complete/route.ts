import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { isEvidenceWindowStatus } from "@/lib/challenge-state-machine";
import { validateUploadSession } from "@/lib/media/upload-session-policy";
import {
  TRUSTED_MEDIA_LIMITS,
  TrustedUploadError,
  trustedEvidenceUploadsEnabled,
  trustedStorageConfigured,
  verifyTrustedEvidenceObject,
} from "@/lib/media/trusted-evidence-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Finalize a *private upload session*, not a challenge Evidence submission.
 * This never triggers AI judging or credits settlement.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!trustedEvidenceUploadsEnabled()) {
    return Response.json({ error: "trusted_uploads_disabled" }, { status: 404 });
  }
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (!trustedStorageConfigured()) {
    return Response.json({ error: "trusted_storage_unconfigured" }, { status: 503 });
  }
  const { sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return Response.json({ error: "invalid_upload_session_id" }, { status: 400 });
  }
  const row = await prisma.trustedEvidenceUpload.findFirst({
    where: { id: sessionId, userId: user.userId },
    include: { challenge: { select: { status: true } } },
  });
  if (!row) return Response.json({ error: "upload_session_not_found" }, { status: 404 });
  if (row.status === "verified") {
    // Idempotent response for completed retries; checksum was saved by the server.
    return Response.json({
      uploadSessionId: row.id,
      status: "verified",
      sha256: row.sha256,
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (row.status !== "issued") {
    return Response.json({ error: "upload_session_not_issued" }, { status: 409 });
  }
  if (!isEvidenceWindowStatus(row.challenge.status)) {
    return Response.json({ error: "evidence_window_closed" }, { status: 409 });
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return Response.json({ error: "upload_session_expired" }, { status: 409 });
  }

  try {
    // HEAD guards the size before downloading; streaming GET verifies bytes
    // and file signature. ETag and client metadata are NOT proof of integrity.
    const receipt = await verifyTrustedEvidenceObject({
      key: row.objectKey,
      contentType: row.contentType,
      expectedSizeBytes: row.expectedSizeBytes,
    });
    const gate = validateUploadSession({
      challengeId: row.challengeId,
      authenticatedUserId: user.userId,
      nowMs: Date.now(),
      allowedContentTypes: Object.keys(TRUSTED_MEDIA_LIMITS),
      session: {
        id: row.id,
        challengeId: row.challengeId,
        userId: row.userId,
        objectKey: row.objectKey,
        expectedSha256: null, // fingerprint originates only from this trusted GET
        maxSizeBytes: TRUSTED_MEDIA_LIMITS[row.contentType],
        expiresAtMs: row.expiresAt.getTime(),
        state: "issued",
      },
      object: receipt,
    });
    if (!gate.valid) {
      console.warn("[trusted-upload] completed upload failed admission", gate.reasons);
      return Response.json({ error: "trusted_upload_validation_failed", reasons: gate.reasons }, { status: 409 });
    }

    // Atomic compare-and-set; concurrent retries cannot mark a different file
    // as verified after a terminal status change or expiration.
    const updated = await prisma.trustedEvidenceUpload.updateMany({
      where: { id: row.id, userId: user.userId, status: "issued", expiresAt: { gt: new Date() } },
      data: {
        status: "verified",
        sha256: receipt.sha256,
        observedSizeBytes: receipt.sizeBytes,
        verifiedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      const latest = await prisma.trustedEvidenceUpload.findUnique({
        where: { id: row.id },
        select: { status: true, sha256: true },
      });
      if (latest?.status !== "verified" || latest.sha256 !== receipt.sha256) {
        return Response.json({ error: "upload_session_state_changed" }, { status: 409 });
      }
    }
    return Response.json({
      uploadSessionId: row.id,
      status: "verified",
      sha256: receipt.sha256,
      sizeBytes: receipt.sizeBytes,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof TrustedUploadError) {
      return Response.json({ error: err.reason }, { status: err.status });
    }
    console.error("[trusted-upload] complete failed", err);
    return Response.json({ error: "trusted_upload_verification_failed" }, { status: 502 });
  }
}
