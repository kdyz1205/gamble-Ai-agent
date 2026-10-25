import { isEvidenceUrlAllowed } from "./evidence-url";
import {
  trustedEvidenceUploadsEnabled,
  trustedStorageConfigured,
  verifyTrustedEvidenceObject,
  signTrustedEvidenceRead,
} from "./trusted-evidence-storage";

/** DB-linked evidence only. Never accept trusted flags, object keys or digests
 * from request JSON. Signed GET URLs are transient in-memory secrets.
 */
export type TrustedJudgeEvidence = {
  challengeId: string;
  userId: string;
  type: string;
  url: string | null;
  trustedUploadId: string | null;
  trustedUpload?: {
    id: string;
    challengeId: string;
    userId: string;
    objectKey: string;
    contentType: string;
    expectedSizeBytes: number;
    observedSizeBytes: number | null;
    sha256: string | null;
    status: string;
  } | null;
};

export type JudgeMediaResolution = {
  url: string | null;
  privateMedia: boolean;
};

export async function resolveJudgeEvidenceMedia(evidence: TrustedJudgeEvidence): Promise<JudgeMediaResolution> {
  const isMedia = evidence.type === "photo" || evidence.type === "video";
  if (!evidence.trustedUploadId) {
    // An operator can require trusted bytes before admitting media into AI
    // review; default OFF until private bucket deployment is independently QA'd.
    if (isMedia && process.env.TRUSTED_EVIDENCE_REQUIRED_FOR_MEDIA === "true") {
      throw new Error("Legacy media cannot be used while trusted-only evidence is required");
    }
    return { url: evidence.url, privateMedia: false };
  }

  const stored = evidence.trustedUpload;
  if (!stored || stored.id !== evidence.trustedUploadId ||
      stored.challengeId !== evidence.challengeId ||
      stored.userId !== evidence.userId || stored.status !== "consumed" ||
      !isMedia || !/^[a-f0-9]{64}$/i.test(stored.sha256 ?? "") ||
      stored.observedSizeBytes !== stored.expectedSizeBytes ||
      !(evidence.type === "video" ? stored.contentType.startsWith("video/") :
        stored.contentType.startsWith("image/"))) {
    throw new Error("Private proof receipt is missing, inconsistent or not consumed");
  }
  if (!trustedEvidenceUploadsEnabled() || !trustedStorageConfigured()) {
    throw new Error("Private evidence verification is not available");
  }

  // Recalculate the bytes at *judge time*, not just when they were uploaded.
  // This catches an object overwritten through out-of-band credentials.
  const observed = await verifyTrustedEvidenceObject({
    key: stored.objectKey,
    contentType: stored.contentType,
    expectedSizeBytes: stored.expectedSizeBytes,
  });
  if (observed.sha256 !== stored.sha256 || observed.sizeBytes !== stored.observedSizeBytes) {
    throw new Error("Private evidence bytes no longer match their immutable upload receipt");
  }
  const url = await signTrustedEvidenceRead(stored.objectKey);
  if (!isEvidenceUrlAllowed(url)) {
    throw new Error("Private evidence storage endpoint is not an approved public HTTPS transport");
  }
  // The URL is ONLY passed to the trusted server-side decoder. Never persist
  // it in Evidence.url, include it in model prompts, or expose it in JSON.
  return { url, privateMedia: true };
}
