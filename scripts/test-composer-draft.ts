import assert from "node:assert/strict";
import { draftForComposer } from "../src/lib/composer-draft";
import { buildDeterministicAgentResponse, normalizeDraftState } from "../src/lib/agent/draft-policy";
import { tryLocalAgentResponse } from "../src/lib/agent/local-routing";
import { emptyDraftState } from "../src/lib/agent/types";

const controls = { stake: "50", opponentMode: "Invite only", proofWindow: "24 hours" };
const first = buildDeterministicAgentResponse("badminton first to 3 points\n\nChallenge settings: stake 50 credits; opponent Invite only; proof window 24 hours.", emptyDraftState());
let draft = normalizeDraftState({ ...emptyDraftState(), ...first.draftPatch });
assert.equal(draft.readyToPublish, true);
assert.equal(draft.stake, 50);
for (const [message, expected] of [
  ["make it free", { stake: 0, stakeType: "none" }],
  ["change proof window to 1 minute", { timeWindow: "1 minute" }],
  ["change opponent to open match", { participants: "you + 1 open opponent" }],
] as const) {
  const response = tryLocalAgentResponse(message, draft);
  assert(response);
  draft = normalizeDraftState({ ...draft, ...response.draftPatch });
  const outgoing = draftForComposer(draft, controls);
  for (const [field, value] of Object.entries(expected)) assert.equal(outgoing[field as keyof typeof outgoing], value);
  assert.equal(outgoing.stake, 0, "Stale 50-credit controls must never undo the agreed free entry");
  assert.equal(outgoing.readyToPublish, true);
}
assert.equal(draftForComposer(draft, controls).timeWindow, "1 minute");
assert.equal(draftForComposer(draft, controls).participants, "you + 1 open opponent");
assert.equal(draftForComposer({ ...draft, stake: 7, stakeType: "credits", timeWindow: "72 hours" }, { ...controls, stake: "0" }).stake, 7,
  "An explicit updated draft also wins in the opposite ordering");
for (const stake of ["", "-1", "NaN", "Infinity"]) {
  const outgoing = draftForComposer(emptyDraftState(), { ...controls, stake });
  assert.equal(outgoing.stake, null);
  assert.equal(outgoing.readyToPublish, false);
}
const partial = buildDeterministicAgentResponse("我和朋友打羽毛球，5个球定胜负\n\nChallenge settings: stake 0 credits; opponent Invite only; proof window 24 hours.", emptyDraftState());
const incomplete = normalizeDraftState({ ...emptyDraftState(), ...partial.draftPatch });
assert.equal(partial.agentAction, "ask_followup");
assert(incomplete.proposition, "This is the nonempty-summary case that previously hid the question");
assert(partial.userVisibleReply);
assert.equal(draftForComposer(incomplete, controls).readyToPublish, false);
console.log("PASS actual deterministic draft + conversational edits retain free stake, custom deadline and participant settings across stale controls");
console.log("PASS opposite edit ordering and invalid initial controls cannot silently change agreed stakes or forge readiness");
console.log("PASS ambiguous scoring with a nonempty proposition remains an explicit follow-up, never publishable");
