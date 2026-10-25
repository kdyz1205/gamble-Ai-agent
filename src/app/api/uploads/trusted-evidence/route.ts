import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { authorizeEvidenceUpload, EVIDENCE_UPLOAD_MAX_BYTES, EvidenceUploadPolicyError } from "@/lib/evidence-upload-policy";
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
  // Recording provenance is NOT currently supported by this schema.
  // Refuse any client claim that a signed recording session was verified.
  if (Object.keys(body).some(key => !["challengeId", "contentType", "fileSizeBytes"].includes(key))) {
    return Response.json({ error: "unsupported_upload_field" }, { status: 400 });
  }
  const maxBytes = TRUSTED_MEDIA_LIMITS[contentType];
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(challengeId) ||
      !maxBytes || !Number.isSafeInteger(fileSizeBytes) ||
      (fileSizeBytes as number) <= 0 || (fileSizeBytes as number) > Math.min(maxBytes, EVIDENCE_UPLOAD_MAX_BYTES)) {
    return Response.json({ error: "invalid_media_request" }, { status: 400 });
  }

  let validUntil: number;
  try {
    const policy = await authorizeEvidenceUpload({
      userId: user.userId, challengeId, contentType,
    });
    validUntil = policy.validUntil;
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId }, select: { evidenceType: true },
    });
    if (!challenge || !["photo","video"].includes(challenge.evidenceType) ||
        (challenge.evidenceType === "video" && !contentType.startsWith("video/")) ||
        (challenge.evidenceType === "photo" && !contentType.startsWith("image/"))) {
      return Response.json({ error: "trusted_upload_requires_media_quest" }, { status: 409 });
    }
  } catch (err) {
    if (err instanceof EvidenceUploadPolicyError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
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
  const expiresAt = new Date(Math.min(now.getTime() + TRUSTED_UPLOAD_TTL_SECONDS * 1000, validUntil));
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
