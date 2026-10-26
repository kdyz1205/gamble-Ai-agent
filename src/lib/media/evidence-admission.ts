/**
 * Conservative server-side admission gate for uploaded challenge evidence.
 * NEVER accept the observations below from client JSON; populate them from the
 * authenticated upload token, object-store HEAD, trusted media probing and DB.
 * This module is intentionally not wired into legacy settlement until the
 * server-authoritative upload session is deployed.
 */
export type EvidenceAdmissionInput = {
  participantAuthorized: boolean;
  uploadSessionMatches: boolean;
  objectVerified: boolean;
  sha256Matches: boolean;
  mimeVerified: boolean;
  withinSizeLimit: boolean;
  durationVerified: boolean;
  recordingSessionRequired: boolean;
  recordingSessionVerified: boolean;
  visualIntegrityReviewed: boolean;
};

export type EvidenceAdmissionDecision = {
  status: "invalid" | "needs_review" | "ready_for_judge";
  blockingReasons: string[];
  reviewReasons: string[];
};

export function assessEvidenceAdmission(input: EvidenceAdmissionInput): EvidenceAdmissionDecision {
  const blockingReasons: string[] = [];
  const reviewReasons: string[] = [];
  if (!input.participantAuthorized) blockingReasons.push("participant_not_authorized");
  if (!input.uploadSessionMatches) blockingReasons.push("upload_session_mismatch");
  if (!input.objectVerified) blockingReasons.push("object_not_verified");
  if (!input.sha256Matches) blockingReasons.push("digest_mismatch");
  if (!input.mimeVerified) blockingReasons.push("media_type_unverified");
  if (!input.withinSizeLimit) blockingReasons.push("file_size_out_of_bounds");
  if (!input.durationVerified) blockingReasons.push("duration_unverified");
  if (input.recordingSessionRequired && !input.recordingSessionVerified) {
    blockingReasons.push("recording_session_unverified");
  }
  if (!input.visualIntegrityReviewed) reviewReasons.push("visual_integrity_review_required");
  return {
    status: blockingReasons.length ? "invalid" : reviewReasons.length ? "needs_review" : "ready_for_judge",
    blockingReasons,
    reviewReasons,
  };
}
