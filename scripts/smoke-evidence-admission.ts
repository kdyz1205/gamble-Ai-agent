import assert from "node:assert/strict";
import { test } from "node:test";
import { assessEvidenceAdmission, type EvidenceAdmissionInput } from "../src/lib/media/evidence-admission.ts";

const valid: EvidenceAdmissionInput = {
  participantAuthorized: true,
  uploadSessionMatches: true,
  objectVerified: true,
  sha256Matches: true,
  mimeVerified: true,
  withinSizeLimit: true,
  durationVerified: true,
  recordingSessionRequired: true,
  recordingSessionVerified: true,
  visualIntegrityReviewed: true,
};

test("trusted and verified evidence can proceed to judging", () => {
  assert.equal(assessEvidenceAdmission(valid).status, "ready_for_judge");
});
test("client-supplied upload without verified object must not pass", () => {
  const result = assessEvidenceAdmission({ ...valid, objectVerified: false });
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.blockingReasons, ["object_not_verified"]);
});
test("unbound recording session must not pass", () => {
  assert.equal(assessEvidenceAdmission({ ...valid, recordingSessionVerified: false }).status, "invalid");
});
test("visual integrity uncertainty routes to review not automatic verdict", () => {
  const result = assessEvidenceAdmission({ ...valid, visualIntegrityReviewed: false });
  assert.equal(result.status, "needs_review");
});
test("non-recording modes do not require recording session", () => {
  assert.equal(assessEvidenceAdmission({ ...valid, recordingSessionRequired: false, recordingSessionVerified: false }).status, "ready_for_judge");
});
test("digest mismatch blocks AI and settlement", () => {
  assert.equal(assessEvidenceAdmission({ ...valid, sha256Matches: false }).status, "invalid");
});
