import assert from "node:assert/strict";
import { judgeChallenge } from "../src/lib/ai-engine";

async function main() {
  const params = { title: "Timed friend quest", type: "General", rules: "The higher verified count wins.",
    evidencePolicy: "video", participantAId: "A", participantBId: "B", providerId: "openai", model: "gpt-4o-mini" };
  const previous = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "false";
  try {
    for (const evidenceA of [
      { type: "text", description: "I won", url: null },
      { type: "video", description: "I won", url: " " },
      { type: "photo", description: "I won", url: "https://example.invalid/proof.jpg" },
    ]) {
      const result = await judgeChallenge({ ...params, evidenceA, evidenceB: null });
      assert.equal(result.winnerId, null);
      assert(result.confidence < 0.85);
      assert.match(result.reasoning, /requirements/);
    }
    const emptyText = await judgeChallenge({ ...params, evidencePolicy: "text",
      evidenceA: { type: "text", description: " " }, evidenceB: null });
    assert.equal(emptyText.winnerId, null);
    const validText = await judgeChallenge({ ...params, evidencePolicy: "text",
      evidenceA: { type: "text", description: "My submitted answer is 56." }, evidenceB: null });
    assert.equal(validText.winnerId, "A");
    const noProof = await judgeChallenge({ ...params, evidenceA: null, evidenceB: null });
    assert.equal(noProof.winnerId, null);
    assert.match(noProof.reasoning, /after both participants accept/);
    assert.doesNotMatch(noProof.reasoning, /credits refunded/);
    console.log("PASS invalid media type/missing URL/empty text cannot win by deadline rule; valid agreed text remains accepted");
    console.log("PASS no-proof recommendation does not claim an unconfirmed refund; all six cases run with AI disabled");
  } finally {
    if (previous === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = previous;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
