/**
 * Pure validation of an upload session against authenticated server context.
 * The session record and observed object metadata MUST come from trusted
 * database/object-store lookups, never fields of the evidence POST request.
 */
export type UploadSessionRecord = {
  id: string;
  challengeId: string;
  userId: string;
  objectKey: string;
  expectedSha256: string;
  maxSizeBytes: number;
  expiresAtMs: number;
  state: "issued" | "consumed" | "revoked";
};

export type VerifiedUploadObject = {
  key: string;
  sizeBytes: number;
  sha256: string | null;
  contentType: string;
};

export type UploadSessionContext = {
  challengeId: string;
  authenticatedUserId: string;
  nowMs: number;
  allowedContentTypes: readonly string[];
  session: UploadSessionRecord;
  object: VerifiedUploadObject | null;
};

export type UploadSessionResult = {
  valid: boolean;
  reasons: string[];
};

const sha256 = /^[a-f0-9]{64}$/i;

export function validateUploadSession(input: UploadSessionContext): UploadSessionResult {
  const { session, object } = input;
  const reasons: string[] = [];
  if (session.challengeId !== input.challengeId) reasons.push("wrong_challenge");
  if (session.userId !== input.authenticatedUserId) reasons.push("wrong_user");
  if (session.state !== "issued") reasons.push("session_not_issued");
  if (!Number.isSafeInteger(input.nowMs) || !Number.isSafeInteger(session.expiresAtMs) || input.nowMs >= session.expiresAtMs) {
    reasons.push("expired_session");
  }
  if (!session.objectKey || session.objectKey.includes("..") || session.objectKey.startsWith("/")) reasons.push("invalid_object_key");
  if (!Number.isSafeInteger(session.maxSizeBytes) || session.maxSizeBytes <= 0) reasons.push("invalid_size_limit");
  if (!sha256.test(session.expectedSha256)) reasons.push("invalid_expected_checksum");
  if (!object) {
    reasons.push("object_missing");
  } else {
    if (session.objectKey !== object.key) reasons.push("wrong_object_key");
    if (!Number.isSafeInteger(object.sizeBytes) || object.sizeBytes <= 0 ||
      object.sizeBytes > session.maxSizeBytes) reasons.push("invalid_object_size");
    if (!input.allowedContentTypes.includes(object.contentType)) reasons.push("unsupported_media_type");
    if (!object.sha256 || !sha256.test(object.sha256) ||
      object.sha256.toLowerCase() !== session.expectedSha256.toLowerCase()) reasons.push("checksum_mismatch");
  }
  return { valid: reasons.length === 0, reasons };
}
