/**
 * CI S3-compatible integration exercise. Run against ephemeral local MinIO,
 * never a production bucket or user content.
 *
 * Required env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
 * S3_TRUSTED_EVIDENCE_BUCKET, S3_TRUSTED_EVIDENCE_ENDPOINT,
 * S3_TRUSTED_EVIDENCE_FORCE_PATH_STYLE=true.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  signTrustedEvidencePut,
  verifyTrustedEvidenceObject,
  TrustedUploadError,
  trustedStorageConfigured,
} from "../src/lib/media/trusted-evidence-storage";

async function main() {
  assert.equal(trustedStorageConfigured(), true, "must be configured for a private, separate CI bucket");
  const bucket = process.env.S3_TRUSTED_EVIDENCE_BUCKET!;
  const client = new S3Client({
    region: process.env.AWS_REGION!,
    endpoint: process.env.S3_TRUSTED_EVIDENCE_ENDPOINT!,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const keys: string[] = [];
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    const key = `trusted-evidence/ci/ci/${randomUUID()}`;
    keys.push(key);
    const media = Buffer.concat([
      Buffer.from("000000186674797069736f6d000000000000000000000000", "hex"),
      Buffer.alloc(2048, 7),
    ]);
    const signed = await signTrustedEvidencePut(key, "video/mp4");
    assert.equal(signed.headers["If-None-Match"], "*");

    const first = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: signed.headers,
      body: new Uint8Array(media),
    });
    assert.ok(first.ok, `first signed PUT failed: ${first.status} ${await first.text()}`);

    const replay = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: signed.headers,
      body: new Uint8Array(media),
    });
    assert.ok(!replay.ok, `replay signed PUT unexpectedly allowed: ${replay.status}`);

    const receipt = await verifyTrustedEvidenceObject({
      key, contentType: "video/mp4", expectedSizeBytes: media.byteLength,
    });
    assert.equal(receipt.sha256, createHash("sha256").update(media).digest("hex"));
    assert.equal(receipt.sizeBytes, media.byteLength);

    await assert.rejects(() => verifyTrustedEvidenceObject({
      key, contentType: "video/mp4", expectedSizeBytes: media.byteLength + 1,
    }), (err: unknown) => err instanceof TrustedUploadError &&
      err.reason === "uploaded_object_metadata_mismatch");

    const badKey = `trusted-evidence/ci/ci/${randomUUID()}`;
    keys.push(badKey);
    const invalidMedia = Buffer.from("<html>This is not a real video</html>");
    const signedBad = await signTrustedEvidencePut(badKey, "video/mp4");
    const bad = await fetch(signedBad.uploadUrl, {
      method: "PUT", headers: signedBad.headers,
      body: new Uint8Array(invalidMedia),
    });
    assert.ok(bad.ok, `mismatched media setup PUT failed: ${bad.status}`);
    await assert.rejects(() => verifyTrustedEvidenceObject({
      key: badKey, contentType: "video/mp4", expectedSizeBytes: invalidMedia.byteLength,
    }), (err: unknown) => err instanceof TrustedUploadError &&
      err.reason === "uploaded_object_signature_mismatch");

    console.log("trusted S3 integration passed: conditional PUT, replay denial, GET streaming hash, size/magic rejection");
  } finally {
    for (const key of keys) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
    }
    client.destroy();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
