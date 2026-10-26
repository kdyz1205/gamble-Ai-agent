import assert from "node:assert/strict";
import { describeEvidenceForJudge } from "../src/lib/media/judge-evidence-summary";
import {
  mediaSourceNote,
  redactVideoTransportError,
  prepareParticipantVisuals,
} from "../src/lib/media/prepare-evidence-visuals";

/**
 * These bearer tokens must NEVER enter LLM text, UI verdict or log-like
 * diagnostic notes. This test uses a forbidden loopback HTTPS host so no
 * request leaves the process.
 */
const secret = "VERY_SECRET_S3_BEARER_SIGNATURE_DO_NOT_EXPOSE";
const signed = "https://127.0.0.1/evidence.mp4?X-Amz-Signature=" + secret +
  "&X-Amz-Credential=PRIVATE_ACCESS_KEY";

assert.equal(
  mediaSourceNote(signed, true),
  "source=server-verified private object",
  "Model-facing metadata must describe media without exposing URL",
);
assert.equal(
  redactVideoTransportError(new Error("Request failed for " + signed), true),
  "Server-verified private media was not readable.",
  "Even low-level fetch/ffmpeg failures may contain signed URL secrets",
);

async function main() {
const privateSummary = describeEvidenceForJudge("A", {
  type: "video", description: "Real private proof", url: signed, privateMedia: true,
});
assert.ok(privateSummary.includes("server-verified private object"));
assert.ok(!privateSummary.includes(secret), "LLM evidence summary leaked private bearer token");
assert.ok(!privateSummary.includes("X-Amz-"));
const publicSummary = describeEvidenceForJudge("B", {
  type: "video", description: "Legacy URL proof",
  url: "https://example.com/public.mp4", privateMedia: false,
});
assert.ok(publicSummary.includes("https://example.com/public.mp4"),
  "Legacy public source rendering should remain compatible");

const redacted = await prepareParticipantVisuals("Player A", {
  type: "video",
  description: "Synthetic proof metadata test",
  url: signed,
  privateMedia: true,
});
const text = redacted.preambleLines.join("\n");
assert.ok(text.includes("server-verified private object"));
assert.ok(!text.includes(secret));
assert.ok(!text.includes("X-Amz-"));
assert.ok(!text.includes("PRIVATE_ACCESS_KEY"));
assert.ok(!text.includes(signed));
assert.equal(redacted.visuals.length, 0);

const publicNotes = mediaSourceNote("https://example.com/video.mp4", false);
assert.equal(publicNotes, "url=https://example.com/video.mp4",
  "Legacy public proof path must remain unaffected");

console.log("PASS private media: signed GET credential never appears in model-facing notes or failure text");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
