import assert from "node:assert/strict";
import { parseProofDeadline } from "../src/lib/proof-deadline";
import { normalizeDraftState } from "../src/lib/agent/draft-policy";

const now = Date.parse("2026-10-20T10:00:00Z");
for (const [raw, minutes] of [
  ["2h", 120], ["within 2 hours", 120], ["2小时内", 120], ["1h30m", 90], ["1 hour 30 minutes", 90],
  ["in 0.5 hours", 30], ["1 week", 10080], ["2026-10-20T14:00:00+02:00", 120],
] as const) {
  assert.equal(parseProofDeadline(raw, now)?.getTime(), now + minutes * 60_000, raw);
}
for (const raw of ["", "now", "tomorrow evening", "by tomorrow", "0 hours", "-2h", "1h or 2h", "1h2h", "2 hours after Bob arrives", "2026-10-20T14:00:00", "2026-10-20T09:00:00Z", "2027-02-30T10:00:00Z", "999999999999999999999999 hours"]) {
  assert.equal(parseProofDeadline(raw, now), null, raw);
}
const base = { title: "Arithmetic answer quest", proposition: "Correctly compute the shared product", participants: "you + one friend", stake: 0, evidenceType: "text" as const, judgeRule: "Compute the product 7 times 8. The correct result wins; equal correct results tie." };
assert.equal(normalizeDraftState({ ...base, timeWindow: "tomorrow evening" }).readyToPublish, false);
assert.equal(normalizeDraftState({ ...base, timeWindow: "2h" }).readyToPublish, true);
console.log("Proof deadline PASS 8 explicit windows, 14 ambiguous/invalid windows, draft readiness");
