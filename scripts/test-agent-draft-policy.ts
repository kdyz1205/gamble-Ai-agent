import assert from "node:assert/strict";
import {
  buildDeterministicAgentResponse,
  getDraftIssues,
  normalizeDraftState,
} from "../src/lib/agent/draft-policy";
import { emptyDraftState } from "../src/lib/agent/types";

const settings = "Challenge settings: stake 50 credits; opponent Invite only; proof window 24 hours.";

const ambiguous = buildDeterministicAgentResponse(`我和朋友打羽毛球，5个球定胜负\n\n${settings}`, emptyDraftState());
const ambiguousDraft = normalizeDraftState({ ...emptyDraftState(), ...ambiguous.draftPatch });
assert.equal(ambiguous.agentAction, "ask_followup");
assert.equal(ambiguousDraft.readyToPublish, false);
assert.ok(getDraftIssues(ambiguousDraft).includes("scoring format"));

const exact = buildDeterministicAgentResponse(`总共打5个回合\n\n${settings}`, ambiguousDraft);
const exactDraft = normalizeDraftState({ ...ambiguousDraft, ...exact.draftPatch });
assert.equal(exact.agentAction, "show_draft");
assert.equal(exactDraft.readyToPublish, true);
assert.match(exactDraft.judgeRule ?? "", /Exactly 5 rallies/);
assert.match(exactDraft.judgeRule ?? "", /scoreboard.*optional/i);
assert.match(exactDraft.judgeRule ?? "", /unclear rally.*requires review/i);
assert.equal(exactDraft.participants, "you + 1 invited friend");
assert.equal(exactDraft.stake, 50);

const firstTo = buildDeterministicAgentResponse(`我和朋友打羽毛球，先到5分赢\n\n${settings}`, emptyDraftState());
const firstToDraft = normalizeDraftState({ ...emptyDraftState(), ...firstTo.draftPatch });
assert.equal(firstToDraft.readyToPublish, true);
assert.match(firstToDraft.judgeRule ?? "", /First player to 5 points/);

const pushups = buildDeterministicAgentResponse(`我挑战朋友一分钟做最多俯卧撑\n\n${settings}`, emptyDraftState());
const pushupDraft = normalizeDraftState({ ...emptyDraftState(), ...pushups.draftPatch });
assert.equal(pushups.agentAction, "show_draft");
assert.equal(pushupDraft.readyToPublish, true);
assert.equal(pushupDraft.evidenceType, "video");

const forgedReady = normalizeDraftState({ ...emptyDraftState(), readyToPublish: true });
assert.equal(forgedReady.readyToPublish, false);
assert.ok(getDraftIssues(forgedReady).length > 0);

const unsafe = buildDeterministicAgentResponse(`谁先一口气喝完一瓶啤酒\n\n${settings}`, emptyDraftState());
assert.equal(unsafe.agentAction, "refuse_or_redirect");
assert.equal(normalizeDraftState({ ...emptyDraftState(), ...unsafe.draftPatch }).readyToPublish, false);

console.log("PASS deterministic phrase -> clarification -> complete friend quest policy");
console.log("PASS no-scoreboard five-rally and first-to-five scoring contracts");
console.log("PASS server-derived readiness and unsafe-challenge block");
