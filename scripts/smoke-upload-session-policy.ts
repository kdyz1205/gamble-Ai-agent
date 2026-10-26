import assert from "node:assert/strict";
import { test } from "node:test";
import { validateUploadSession, type UploadSessionContext } from "../src/lib/media/upload-session-policy";

const digest = "a".repeat(64);
const valid: UploadSessionContext = {
  challengeId: "challenge-1",
  authenticatedUserId: "alice",
  nowMs: 1000,
  allowedContentTypes: ["video/mp4", "video/quicktime"],
  session: {
    id: "upload-1", challengeId: "challenge-1", userId: "alice",
    objectKey: "uploads/challenge-1/alice/unique.mp4", expectedSha256: digest,
    maxSizeBytes: 100_000_000, expiresAtMs: 2000, state: "issued",
  },
  object: {
    key: "uploads/challenge-1/alice/unique.mp4", sizeBytes: 1024,
    sha256: digest, contentType: "video/mp4",
  },
};

test("trusted upload matching session is acceptable", () => {
  assert.deepEqual(validateUploadSession(valid), { valid: true, reasons: [] });
});
test("a video from another user is rejected", () => {
  assert.ok(validateUploadSession({ ...valid, authenticatedUserId: "bob" }).reasons.includes("wrong_user"));
});
test("cross-challenge uploads are rejected", () => {
  assert.ok(validateUploadSession({ ...valid, challengeId: "challenge-2" }).reasons.includes("wrong_challenge"));
});
test("expired upload session is rejected", () => {
  assert.ok(validateUploadSession({ ...valid, nowMs: 2000 }).reasons.includes("expired_session"));
});
test("consumed upload session cannot be replayed", () => {
  assert.ok(validateUploadSession({ ...valid, session: { ...valid.session, state: "consumed" } }).reasons.includes("session_not_issued"));
});
test("missing stored object is rejected", () => {
  assert.ok(validateUploadSession({ ...valid, object: null }).reasons.includes("object_missing"));
});
test("object key substitution is rejected", () => {
  assert.ok(validateUploadSession({ ...valid, object: { ...valid.object!, key: "uploads/elsewhere/video.mp4" } }).reasons.includes("wrong_object_key"));
});
test("oversized object is rejected", () => {
  assert.ok(validateUploadSession({ ...valid, object: { ...valid.object!, sizeBytes: 100_000_001 } }).reasons.includes("invalid_object_size"));
});
test("client-declared checksum cannot override stored checksum", () => {
  assert.ok(validateUploadSession({ ...valid, object: { ...valid.object!, sha256: "b".repeat(64) } }).reasons.includes("checksum_mismatch"));
});
test("missing independently verified checksum is rejected", () => {
  assert.ok(validateUploadSession({ ...valid, object: { ...valid.object!, sha256: null } }).reasons.includes("checksum_mismatch"));
});
test("unsupported file type is rejected", () => {
  assert.ok(validateUploadSession({ ...valid, object: { ...valid.object!, contentType: "text/html" } }).reasons.includes("unsupported_media_type"));
});
