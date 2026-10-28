import assert from "node:assert/strict";
import { publicActivityPresentation } from "../src/lib/public-activity-presentation";

let checks = 0;
const types = ["user_joined", "challenge_created", "quiz_created", "challenge_accepted", "evidence_submitted", "challenge_verdict_recommended", "challenge_settled", "challenge_refunded", "challenge_cancelled"];
for (const type of types) {
  const event = { type, user: { username: "qa_real_member" }, challenge: { title: "Our real Quest" }, message: "Provider secret-model-code / raw internal event text" };
  const before = JSON.stringify(event);
  const displayed = publicActivityPresentation(event);
  assert(displayed.label && displayed.message); checks++;
  assert(!displayed.label.includes("_") && !displayed.message.includes("secret-model-code")); checks++;
  assert.equal(JSON.stringify(event), before, "Presentation never rewrites event records"); checks++;
}
assert.match(publicActivityPresentation({ type: "user_joined", user: { username: "qa_real_member" } }).message, /qa_real_member joined Summoners World/); checks++;
const verdict = publicActivityPresentation({ type: "challenge_verdict_recommended", user: null, challenge: { title: "Long match" } });
assert.match(verdict.message, /recommendation/); checks++;
assert.doesNotMatch(verdict.message, /won|winner|earned|paid|confirmed result/i); checks++;
assert.match(verdict.message, /current review and result status/); checks++;
assert.deepEqual(publicActivityPresentation({ type: "unreviewed_provider_event", user: null, challenge: null }), {
  label: "Community update", message: "A public community update was recorded.",
}); checks++;
console.log(`PUBLIC_ACTIVITY_PRESENTATION_PASS ${checks} assertions: player-facing copy, no provider identifiers, no invented wins, no source mutations`);
