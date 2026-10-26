import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesTrustedMediaSignature,
  TRUSTED_MEDIA_LIMITS,
  trustedEvidenceUploadsEnabled,
  trustedStorageConfigured,
} from "../src/lib/media/trusted-evidence-storage";
import { validateUploadSession } from "../src/lib/media/upload-session-policy";

const ftypMp4 = Buffer.from("000000186674797069736f6d00000000", "hex");
const ftypMov = Buffer.from("00000018667479707174202000000000", "hex");
test("MP4 and QuickTime are distinguished by magic bytes", () => {
  assert.equal(matchesTrustedMediaSignature("video/mp4", ftypMp4), true);
  assert.equal(matchesTrustedMediaSignature("video/quicktime", ftypMov), true);
  assert.equal(matchesTrustedMediaSignature("video/quicktime", ftypMp4), false);
});
test("WebM and JPEG magic bytes", () => {
  assert.equal(matchesTrustedMediaSignature("video/webm", Buffer.from("1a45dfa39f428681", "hex")), true);
  assert.equal(matchesTrustedMediaSignature("image/jpeg", Buffer.from("ffd8ffe000", "hex")), true);
});
test("PNG and WebP magic bytes", () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const webp = Buffer.from("524946461000000057454250", "hex");
  assert.equal(matchesTrustedMediaSignature("image/png", png), true);
  assert.equal(matchesTrustedMediaSignature("image/webp", webp), true);
});
test("HTML and mismatched video bytes are not accepted as evidence", () => {
  const html = Buffer.from("<html>inject</html>");
  for (const mime of Object.keys(TRUSTED_MEDIA_LIMITS)) {
    assert.equal(matchesTrustedMediaSignature(mime, html), false);
  }
  assert.equal(matchesTrustedMediaSignature("video/mp4", Buffer.from("1a45dfa3", "hex")), false);
});
test("media limits enforce 100MiB video and 20MiB images", () => {
  assert.equal(TRUSTED_MEDIA_LIMITS["video/mp4"], 100 * 1024 * 1024);
  assert.equal(TRUSTED_MEDIA_LIMITS["image/jpeg"], 20 * 1024 * 1024);
  assert.equal(TRUSTED_MEDIA_LIMITS["image/svg+xml"], undefined);
});
test("server-computed SHA256 permits initial null expectation, but never missing observed digest", () => {
  const digest = "a".repeat(64);
  const session = {
    id: "up-1", challengeId: "c1", userId: "alice", objectKey: "trusted-evidence/c1/alice/up-1",
    maxSizeBytes: 1024, expiresAtMs: 2000, state: "issued" as const, expectedSha256: null,
  };
  const base = {
    authenticatedUserId: "alice", challengeId: "c1", nowMs: 1000,
    allowedContentTypes: ["video/mp4"],
    session,
    object: { key: session.objectKey, sizeBytes: 200, contentType: "video/mp4", sha256: digest },
  };
  assert.equal(validateUploadSession(base).valid, true);
  assert.ok(validateUploadSession({ ...base, object: { ...base.object, sha256: null } }).reasons.includes("checksum_mismatch"));
  assert.ok(validateUploadSession({ ...base, session: { ...session, expectedSha256: "b".repeat(64) } }).reasons.includes("checksum_mismatch"));
});
test("trusted upload feature defaults off unless explicitly enabled", () => {
  const prev = process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS;
  try {
    delete process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS;
    assert.equal(trustedEvidenceUploadsEnabled(), false);
    process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS = "false";
    assert.equal(trustedEvidenceUploadsEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS;
    else process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS = prev;
  }
});
test("private upload bucket must differ from legacy public evidence bucket", () => {
  const keys = ["AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_REGION","S3_TRUSTED_EVIDENCE_BUCKET","S3_EVIDENCE_BUCKET"] as const;
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.AWS_REGION = "auto";
    process.env.S3_TRUSTED_EVIDENCE_BUCKET = "evidence";
    process.env.S3_EVIDENCE_BUCKET = "evidence";
    assert.equal(trustedStorageConfigured(), false);
    process.env.S3_TRUSTED_EVIDENCE_BUCKET = "private-evidence";
    assert.equal(trustedStorageConfigured(), true);
  } finally {
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
});
