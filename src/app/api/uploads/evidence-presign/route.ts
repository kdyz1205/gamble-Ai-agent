import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { presignEvidencePut, isS3PresignConfigured } from "@/lib/s3-evidence-presign";

export const runtime = "nodejs";

/**
 * POST /api/uploads/evidence-presign
 * Body: { challengeId: string, contentType: string, filename?: string }
 *
 * Returns presigned PUT URL — client uploads bytes directly to object storage, then submits evidence.url = publicUrl.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  if (!isS3PresignConfigured()) {
    return Response.json(
      {
        error:
          "Direct upload is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_EVIDENCE_BUCKET, S3_PUBLIC_BASE_URL.",
        configured: false,
      },
      { status: 503 },
    );
  }

  let body: { challengeId?: string; contentType?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "";
  if (!challengeId || !contentType) {
    return Response.json({ error: "challengeId and contentType are required" }, { status: 400 });
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { participants: { where: { userId: user.userId } } },
  });
  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.participants.length === 0) {
    return Response.json({ error: "You are not a participant in this challenge" }, { status: 403 });
  }

  try {
    const out = await presignEvidencePut({
      challengeId,
      userId: user.userId,
      contentType,
      filename: typeof body.filename === "string" ? body.filename : undefined,
    });
    return Response.json({
      configured: true,
      uploadUrl: out.uploadUrl,
      key: out.key,
      publicUrl: out.publicUrl,
      expiresIn: out.expiresIn,
      method: "PUT",
      headers: { "Content-Type": contentType },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Presign failed" },
      { status: 500 },
    );
  }
}
