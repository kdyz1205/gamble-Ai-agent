// @ts-nocheck
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_KEY_LEN = 512;

export function isS3PresignConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_REGION &&
      process.env.S3_EVIDENCE_BUCKET,
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload.bin";
}

/**
 * Presigned PUT so the mobile app uploads directly to S3/OSS-compatible bucket.
 * After upload, store `publicUrl` (or your CDN URL) as evidence `url`.
 */
export async function presignEvidencePut(params: {
  challengeId: string;
  userId: string;
  contentType: string;
  filename?: string;
  expiresSeconds?: number;
}): Promise<{ uploadUrl: string; key: string; publicUrl: string; expiresIn: number }> {
  if (!isS3PresignConfigured()) {
    throw new Error("S3 presign env not configured (AWS_* + S3_EVIDENCE_BUCKET + S3_PUBLIC_BASE_URL)");
  }

  const bucket = process.env.S3_EVIDENCE_BUCKET!;
  const region = process.env.AWS_REGION!;
  const publicBase = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!publicBase) {
    throw new Error("S3_PUBLIC_BASE_URL is required (HTTPS CDN or bucket URL for clients to reference)");
  }

  const ext = params.filename?.includes(".") ? params.filename.slice(params.filename.lastIndexOf(".")) : "";
  const safe = sanitizeFilename(params.filename || "evidence" + ext);
  const key = `evidence/${params.challengeId}/${params.userId}/${Date.now()}-${safe}`.slice(0, MAX_KEY_LEN);

  const client = new S3Client({ region });
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: params.contentType || "application/octet-stream",
  });

  const expiresIn = Math.min(params.expiresSeconds ?? 900, 3600);
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn });
  const publicUrl = `${publicBase}/${key}`;

  return { uploadUrl, key, publicUrl, expiresIn };
}
