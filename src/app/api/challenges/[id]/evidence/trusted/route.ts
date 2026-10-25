import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { AuditActions } from "@/lib/audit-log";
import { QUIZ_RULE_VERSION } from "@/lib/quiz/quiz-bank";
import {
  trustedEvidenceUploadsEnabled,
  trustedStorageConfigured,
  verifyTrustedEvidenceObject,
  TrustedUploadError,
} from "@/lib/media/trusted-evidence-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

class BindingError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

const idValid = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

/**
 * Bind one independently verified, private upload to one authenticated,
 * accepted participant's Quest evidence. This transaction is the ONLY route
 * that turns a TrustedEvidenceUpload into a playable Evidence record.
 * No object URL or provisional AI/XP/credit award is returned or persisted.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!trustedEvidenceUploadsEnabled()) {
    return Response.json({ error: "trusted_uploads_disabled" }, { status: 404 });
  }
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (!trustedStorageConfigured()) {
    return Response.json({ error: "trusted_storage_unconfigured" }, { status: 503 });
  }
  const { id: challengeId } = await params;
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return Response.json({ error: "invalid_binding_request" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => !["uploadSessionId", "description"].includes(key)) ||
      !idValid(body.uploadSessionId) ||
      (body.description !== undefined &&
        (typeof body.description !== "string" || body.description.length > 2000))) {
    return Response.json({ error: "invalid_binding_request" }, { status: 400 });
  }
  const uploadSessionId = body.uploadSessionId;
  const description = typeof body.description === "string" ? body.description.trim() : "";

  try {
    // Rechecking the object *before* the DB lock keeps slow network work out
    // of the short serializable state change.
    const upload = await prisma.trustedEvidenceUpload.findFirst({
      where: { id: uploadSessionId, userId: user.userId, challengeId },
    });
    if (!upload) throw new BindingError("upload_session_not_found", 404);
    if (upload.status === "consumed") {
      const already = upload.evidenceId ? await prisma.evidence.findUnique({
        where: { id: upload.evidenceId },
      }) : null;
      if (already?.challengeId === challengeId && already.userId === user.userId) {
        return Response.json({ evidence: { ...already, trustedUploadId: upload.id }, reused: true }, {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      throw new BindingError("consumed_upload_without_matching_evidence", 409);
    }
    if (upload.status !== "verified" || !/^[a-f0-9]{64}$/i.test(upload.sha256 ?? "") ||
        upload.observedSizeBytes !== upload.expectedSizeBytes) {
      throw new BindingError("upload_not_verified", 409);
    }
    if (upload.expiresAt.getTime() <= Date.now()) {
      throw new BindingError("upload_session_expired", 409);
    }
    let receipt;
    try {
      receipt = await verifyTrustedEvidenceObject({
        key: upload.objectKey,
        contentType: upload.contentType,
        expectedSizeBytes: upload.expectedSizeBytes,
      });
    } catch (err) {
      if (err instanceof TrustedUploadError) throw new BindingError(err.reason, 409);
      throw err;
    }
    if (receipt.sha256 !== upload.sha256 || receipt.sizeBytes !== upload.observedSizeBytes) {
      throw new BindingError("upload_digest_changed", 409);
    }

    const evidence = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Challenge" WHERE "id" = ${challengeId} FOR UPDATE`;
      const challenge = await tx.challenge.findUnique({
        where: { id: challengeId },
        include: {
          participants: {
            where: {
              status: "accepted",
              role: { in: ["creator", "opponent"] },
            },
          },
        },
      });
      if (!challenge) throw new BindingError("challenge_not_found", 404);
      if (challenge.arbiter === QUIZ_RULE_VERSION ||
          !["live", "matched"].includes(challenge.status)) {
        throw new BindingError("challenge_not_accepting_proof", 409);
      }
      if (challenge.deadline && challenge.deadline.getTime() <= Date.now()) {
        throw new BindingError("proof_deadline_expired", 409);
      }
      if (!["video", "photo"].includes(challenge.evidenceType)) {
        throw new BindingError("challenge_media_type_mismatch", 400);
      }
      const expectedType = challenge.evidenceType === "video" ? "video/" : "image/";
      if (!upload.contentType.startsWith(expectedType)) {
        throw new BindingError("media_type_mismatch", 400);
      }
      const eligible = challenge.participants;
      if (!eligible.some(player => player.userId === user.userId)) {
        throw new BindingError("participant_not_accepted", 403);
      }
      const existing = await tx.evidence.findUnique({
        where: { challengeId_userId: { challengeId, userId: user.userId } },
      });
      if (existing) throw new BindingError("evidence_already_submitted", 409);
      const proof = await tx.evidence.create({
        data: {
          challengeId,
          userId: user.userId,
          type: challenge.evidenceType,
          url: null,
          description,
          metadata: JSON.stringify({
            source: "verified_private_object_v1",
            sha256: receipt.sha256,
            sizeBytes: receipt.sizeBytes,
            contentType: receipt.contentType,
          }),
        },
      });
      // Both writes are in the same Quest-locked transaction. If the
      // upload was consumed concurrently, the Evidence insert rolls back.
      const locked = await tx.trustedEvidenceUpload.updateMany({
        where: {
          id: upload.id,
          userId: user.userId,
          challengeId,
          evidenceId: null,
          status: "verified",
          sha256: receipt.sha256,
          expiresAt: { gt: new Date() },
        },
        data: { status: "consumed", evidenceId: proof.id, consumedAt: new Date() },
      });
      if (locked.count !== 1) throw new BindingError("upload_session_state_changed", 409);
      await tx.activityEvent.create({ data: {
        type: "evidence_submitted",
        userId: user.userId,
        challengeId,
        message: user.username + " submitted verified private media evidence",
      } });
      await tx.auditLog.create({ data: {
        action: AuditActions.EVIDENCE_SUBMITTED,
        actorUserId: user.userId,
        challengeId,
        payload: JSON.stringify({
          evidenceId: proof.id,
          uploadSessionId: upload.id,
          source: "verified_private_object_v1",
          sha256: receipt.sha256,
        }),
      } });
      const ids = new Set((await tx.evidence.findMany({
        where: { challengeId },
        select: { userId: true },
      })).map(row => row.userId));
      if (eligible.length === 2 &&
          eligible.some(p => p.role === "creator" && p.userId === challenge.creatorId) &&
          eligible.some(p => p.role === "opponent") &&
          eligible.every(p => ids.has(p.userId))) {
        await tx.challenge.update({
          where: { id: challengeId }, data: { status: "judging" },
        });
        await tx.auditLog.create({ data: {
          action: AuditActions.CHALLENGE_STATUS,
          actorUserId: user.userId,
          challengeId,
          payload: JSON.stringify({
            previousStatus: challenge.status,
            newStatus: "judging",
            reason: "both_private_media_proofs_consumed",
          }),
        } });
      }
      return proof;
    }, { maxWait: 15_000, timeout: 30_000 });

    return Response.json({
      evidence: { ...evidence, trustedUploadId: upload.id },
      reused: false,
    }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof BindingError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    console.error("[trusted-evidence] proof binding failed", {
      kind: err instanceof Error ? err.name : "UnknownError",
    });
    return Response.json({ error: "private_proof_binding_failed" }, { status: 502 });
  }
}
