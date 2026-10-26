/**
 * Private, server-authoritative direct-to-object-storage evidence upload.
 * Requires a dedicated PRIVATE bucket, separate from the legacy public URL
 * storage. S3-compatible with R2 when S3_TRUSTED_EVIDENCE_ENDPOINT is set.
 *
 * Object ETag is never treated as a SHA-256 checksum. A successful completion
 * computes SHA-256 from the actual object bytes streamed with a bounded cap.
 */
import { createHash } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const TRUSTED_UPLOAD_TTL_SECONDS = 900;
export const TRUSTED_MEDIA_LIMITS: Readonly<Record<string, number>> = {
  "video/mp4": 100 * 1024 * 1024,
  "video/quicktime": 100 * 1024 * 1024,
  "video/webm": 100 * 1024 * 1024,
  "image/jpeg": 20 * 1024 * 1024,
  "image/png": 20 * 1024 * 1024,
  "image/webp": 20 * 1024 * 1024,
};

export class TrustedUploadError extends Error {
  constructor(public readonly reason: string, public readonly status = 400) {
    super(reason);
    this.name = "TrustedUploadError";
  }
}

export function trustedEvidenceUploadsEnabled(): boolean {
  return process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS === "true";
}

export function trustedStorageConfigured(): boolean {
  const bucket = process.env.S3_TRUSTED_EVIDENCE_BUCKET?.trim();
  return Boolean(
    bucket &&
    bucket !== process.env.S3_EVIDENCE_BUCKET &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION,
  );
}

function getBucket(): string {
  if (!trustedStorageConfigured()) {
    throw new TrustedUploadError("trusted_storage_unconfigured", 503);
  }
  return process.env.S3_TRUSTED_EVIDENCE_BUCKET!;
}

function s3(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION!,
    endpoint: process.env.S3_TRUSTED_EVIDENCE_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_TRUSTED_EVIDENCE_FORCE_PATH_STYLE === "true",
    // AWS SDK v3 defaults can add automatic CRC32 headers incompatible with
    // S3-compatible endpoints. Our integrity check is a full stream hash.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

/** Signed conditional PUT prevents re-upload / replacement before URL expiry. */
export async function signTrustedEvidencePut(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; headers: Record<string, string> }> {
  if (!(contentType in TRUSTED_MEDIA_LIMITS)) throw new TrustedUploadError("unsupported_media_type");
  const client = s3();
  try {
    const command = new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
      IfNoneMatch: "*",
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: TRUSTED_UPLOAD_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "if-none-match"]),
    });
    return {
      uploadUrl,
      headers: { "Content-Type": contentType, "If-None-Match": "*" },
    };
  } finally {
    client.destroy();
  }
}

/** Light-weight magic-byte check. The declared media type alone is untrusted. */
export function matchesTrustedMediaSignature(mime: string, first: Uint8Array): boolean {
  const b = Buffer.from(first);
  if (mime === "image/jpeg") return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  if (mime === "video/webm") return b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === "video/mp4" || mime === "video/quicktime") {
    if (b.length < 12 || b.toString("ascii", 4, 8) !== "ftyp") return false;
    const brand = b.toString("ascii", 8, 12);
    return mime === "video/quicktime" ? brand === "qt  " : brand !== "qt  ";
  }
  return false;
}

/**
 * Only an authenticated, consumed, server-bound upload may supply this
 * in-memory read handle. It cannot come from user request JSON.
 * The decoder reads from the private bucket via AWS credentials, never through
 * a public object URL or S3/R2 signed GET URL.
 */
export type TrustedEvidenceSource = {
  key: string;
  contentType: string;
  expectedSizeBytes: number;
  sha256: string;
};

/** Stream authenticated private object bytes to one restricted temp file.
 * Full SHA-256, length and MIME magic are re-validated IN THE SAME stream
 * that feeds FFmpeg. No full video is held in process RAM.
 */
export async function stageTrustedEvidenceObject(
  source: TrustedEvidenceSource,
  destination: string,
): Promise<TrustedUploadReceipt> {
  const max = TRUSTED_MEDIA_LIMITS[source.contentType];
  if (!source.key.startsWith("trusted-evidence/") ||
      source.key.includes("..") || source.key.includes("\\") ||
      source.key.length > 512 ||
      !max || !Number.isSafeInteger(source.expectedSizeBytes) ||
      source.expectedSizeBytes <= 0 || source.expectedSizeBytes > max ||
      !/^[a-f0-9]{64}$/i.test(source.sha256)) {
    throw new TrustedUploadError("invalid_private_read_source", 409);
  }
  const client = s3();
  let file: Awaited<ReturnType<typeof open>> | null = null;
  let complete = false;
  try {
    const head = await client.send(new HeadObjectCommand({
      Bucket: getBucket(), Key: source.key,
    }));
    if (head.ContentType !== source.contentType ||
        head.ContentLength !== source.expectedSizeBytes) {
      throw new TrustedUploadError("private_object_metadata_mismatch", 409);
    }
    const body = await client.send(new GetObjectCommand({
      Bucket: getBucket(), Key: source.key,
      ...(head.ETag ? { IfMatch: head.ETag } : {}),
    }));
    if (!body.Body) throw new TrustedUploadError("private_object_unreadable", 409);
    file = await open(destination, "wx", 0o600);
    const digest = createHash("sha256");
    let length = 0;
    let signature = Buffer.alloc(0);
    for await (const bytes of body.Body as AsyncIterable<Uint8Array>) {
      const part = Buffer.from(bytes);
      length += part.length;
      if (length > source.expectedSizeBytes || length > max) {
        throw new TrustedUploadError("private_object_oversize", 409);
      }
      digest.update(part);
      if (signature.length < 32) {
        signature = Buffer.concat([
          signature, part.subarray(0, 32 - signature.length),
        ]);
      }
      let written = 0;
      const start = length - part.length;
      while (written < part.length) {
        const result = await file.write(
          part, written, part.length - written, start + written,
        );
        if (result.bytesWritten <= 0) {
          throw new TrustedUploadError("private_disk_write_failed", 503);
        }
        written += result.bytesWritten;
      }
    }
    if (length !== source.expectedSizeBytes ||
        digest.digest("hex").toLowerCase() !== source.sha256.toLowerCase() ||
        !matchesTrustedMediaSignature(source.contentType, signature)) {
      throw new TrustedUploadError("private_object_digest_mismatch", 409);
    }
    complete = true;
    return {
      key: source.key,
      contentType: source.contentType,
      sizeBytes: length,
      sha256: source.sha256.toLowerCase(),
    };
  } finally {
    await file?.close();
    if (!complete && file) await unlink(destination).catch(() => {});
    client.destroy();
  }
}

export type TrustedUploadReceipt = {
  key: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

export async function verifyTrustedEvidenceObject(input: {
  key: string;
  contentType: string;
  expectedSizeBytes: number;
}): Promise<TrustedUploadReceipt> {
  const limit = TRUSTED_MEDIA_LIMITS[input.contentType];
  if (!limit || !Number.isSafeInteger(input.expectedSizeBytes) ||
      input.expectedSizeBytes <= 0 || input.expectedSizeBytes > limit) {
    throw new TrustedUploadError("invalid_upload_limits");
  }
  const client = s3();
  try {
    let head;
    try {
      head = await client.send(new HeadObjectCommand({ Bucket: getBucket(), Key: input.key }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) throw new TrustedUploadError("uploaded_object_not_found", 409);
      throw err;
    }
    const announcedLength = head.ContentLength;
    if (head.ContentType !== input.contentType ||
        !Number.isSafeInteger(announcedLength) ||
        announcedLength !== input.expectedSizeBytes) {
      throw new TrustedUploadError("uploaded_object_metadata_mismatch", 409);
    }

    // Conditional GET detects unexpected object changes between HEAD and GET.
    const out = await client.send(new GetObjectCommand({
      Bucket: getBucket(),
      Key: input.key,
      ...(head.ETag ? { IfMatch: head.ETag } : {}),
    }));
    if (!out.Body) throw new TrustedUploadError("uploaded_object_empty", 409);
    const hash = createHash("sha256");
    let size = 0;
    let signature = Buffer.alloc(0);
    for await (const bytes of out.Body as AsyncIterable<Uint8Array>) {
      const part = Buffer.from(bytes);
      size += part.byteLength;
      if (size > limit || size > input.expectedSizeBytes) {
        throw new TrustedUploadError("uploaded_object_oversize", 409);
      }
      hash.update(part);
      if (signature.length < 32) {
        signature = Buffer.concat([signature, part.subarray(0, 32 - signature.length)]);
      }
    }
    if (size !== input.expectedSizeBytes) throw new TrustedUploadError("uploaded_object_size_changed", 409);
    if (!matchesTrustedMediaSignature(input.contentType, signature)) {
      throw new TrustedUploadError("uploaded_object_signature_mismatch", 409);
    }
    return {
      key: input.key,
      contentType: input.contentType,
      sizeBytes: size,
      sha256: hash.digest("hex"),
    };
  } finally {
    client.destroy();
  }
}
