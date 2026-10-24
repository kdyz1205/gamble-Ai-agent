import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import VerdictReviewControls from "../src/components/VerdictReviewControls";
import type { ChallengeData } from "../src/lib/api-client";
import EvidenceUploader from "../src/components/EvidenceUploader";
import { mediaProofKind, proofInputError, recordingExtension, recordingMimeType } from "../src/lib/evidence-client";

for (const policy of ["photo", "video", "text", "self_report"]) {
  const html = renderToStaticMarkup(createElement(EvidenceUploader, { challengeId: "contract-test", evidenceType: policy, onSubmitted: () => {} }));
  assert.equal(html.includes("Upload photo"), policy === "photo");
  assert.equal(html.includes("Take photo"), policy === "photo");
  assert.equal(html.includes("Upload video"), policy === "video");
  assert.equal(html.includes("Record video"), policy === "video");
  assert(html.includes("Describe what you did."));
}
console.log("PASS actual uploader render exposes only agreed photo/video controls and written description");
assert.equal(mediaProofKind(" PHOTO "), "photo");
assert.equal(proofInputError("photo", { fileType: "video/webm" }), "This quest requires photo proof. Choose a matching file.");
assert.equal(proofInputError("video", { fileType: "image/png" }), "This quest requires video proof. Choose a matching file.");
assert(proofInputError("photo", { description: "No file here" }));
assert.equal(proofInputError("photo", { fileType: "image/png" }), null);
assert.equal(proofInputError("video", { url: "https://proof.example/video.mp4" }), null);
for (const url of ["not-a-url", "http://proof.example/file.png", "data:image/png;base64,eA==", "https://name:secret@proof.example/a.png"]) {
  assert(proofInputError("photo", { url }), `malformed/unsafe scheme must fail: ${url}`);
}
assert(proofInputError("text", { url: "https://proof.example/a.png" }));
assert.equal(proofInputError("text", { description: "I completed my agreed check-in." }), null);
console.log("PASS mismatched/missing media, malformed links and empty written proof rejected before upload");
assert.equal(recordingMimeType(type => type === "video/mp4"), "video/mp4");
assert.equal(recordingMimeType(() => true), "video/mp4;codecs=avc1");
assert.equal(recordingMimeType(type => type === "video/webm;codecs=vp8"), "video/webm;codecs=vp8");
assert.equal(recordingMimeType(() => false), undefined);
assert.equal(recordingExtension("video/mp4;codecs=avc1"), "mp4");
assert.equal(recordingExtension("video/webm;codecs=vp9"), "webm");
console.log("PASS MP4-only/WebM capability negotiation, browser default fallback and matching file extension");

const challenge = { id: "roles", status: "disputed", judgments: [{ id: "recommendation" }], verdictResponses: [{ userId: "spectator", decision: "accepted" }],
  participants: [
    { role: "creator", status: "accepted", user: { id: "a", username: "A" } },
    { role: "opponent", status: "accepted", user: { id: "b", username: "B" } },
    { role: "spectator", status: "accepted", user: { id: "spectator", username: "Observer" } },
  ],
} as unknown as ChallengeData;
const creatorControls = renderToStaticMarkup(createElement(VerdictReviewControls, { challenge, userId: "a", onUpdated: () => {} }));
assert(creatorControls.includes("0 of 2 players"));
assert(creatorControls.includes("Accept result"));
const spectatorControls = renderToStaticMarkup(createElement(VerdictReviewControls, { challenge, userId: "spectator", onUpdated: () => {} }));
assert(!spectatorControls.includes("Accept result"));
assert(spectatorControls.includes("Only accepted players"));
console.log("PASS actual consent controls exclude accepted spectators from counts and decisions");
