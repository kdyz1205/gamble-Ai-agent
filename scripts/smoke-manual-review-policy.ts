import assert from "node:assert/strict";
import {
  evaluateManualResolutionPolicy,
  isManualResolutionStatus,
  MANUAL_RESOLUTION_STATUSES,
} from "../src/lib/manual-review-policy";
import { ChallengeStatus } from "../src/lib/enums";

const participants = [
  { userId: "creator", status: "accepted" },
  { userId: "opponent", status: "accepted" },
];

assert.ok(MANUAL_RESOLUTION_STATUSES.includes(ChallengeStatus.manual_review_required));
assert.equal(isManualResolutionStatus(ChallengeStatus.disputed), true);
assert.equal(isManualResolutionStatus(ChallengeStatus.evidence_window_open), false);

const validWinner = evaluateManualResolutionPolicy({
  status: ChallengeStatus.manual_review_required,
  creatorId: "creator",
  actorUserId: "creator",
  outcome: "winner",
  winnerId: "opponent",
  stake: 1,
  participants,
  existingSettlementRows: 0,
});
assert.equal(validWinner.allowed, true);
assert.equal(validWinner.winnerId, "opponent");
assert.deepEqual(validWinner.acceptedParticipantIds, ["creator", "opponent"]);

const invalidWinner = evaluateManualResolutionPolicy({
  status: ChallengeStatus.manual_review_required,
  creatorId: "creator",
  actorUserId: "creator",
  outcome: "winner",
  winnerId: "stranger",
  stake: 1,
  participants,
  existingSettlementRows: 0,
});
assert.equal(invalidWinner.allowed, false);
assert.equal(invalidWinner.status, 400);

const nonCreator = evaluateManualResolutionPolicy({
  status: ChallengeStatus.manual_review_required,
  creatorId: "creator",
  actorUserId: "opponent",
  outcome: "refund",
  winnerId: null,
  stake: 1,
  participants,
  existingSettlementRows: 0,
});
assert.equal(nonCreator.allowed, false);
assert.equal(nonCreator.status, 403);

const terminal = evaluateManualResolutionPolicy({
  status: ChallengeStatus.settled,
  creatorId: "creator",
  actorUserId: "creator",
  outcome: "refund",
  winnerId: null,
  stake: 1,
  participants,
  existingSettlementRows: 0,
});
assert.equal(terminal.allowed, false);
assert.equal(terminal.status, 409);

const stakedVoid = evaluateManualResolutionPolicy({
  status: ChallengeStatus.disputed,
  creatorId: "creator",
  actorUserId: "creator",
  outcome: "void",
  winnerId: null,
  stake: 1,
  participants,
  existingSettlementRows: 0,
});
assert.equal(stakedVoid.allowed, false);
assert.equal(stakedVoid.status, 400);

const duplicateSettlement = evaluateManualResolutionPolicy({
  status: ChallengeStatus.disputed,
  creatorId: "creator",
  actorUserId: "creator",
  outcome: "refund",
  winnerId: null,
  stake: 1,
  participants,
  existingSettlementRows: 1,
});
assert.equal(duplicateSettlement.allowed, false);
assert.equal(duplicateSettlement.status, 409);

console.log(JSON.stringify({
  ok: true,
  manualStatuses: MANUAL_RESOLUTION_STATUSES,
  validWinner,
  rejected: {
    invalidWinner: invalidWinner.error,
    nonCreator: nonCreator.error,
    terminal: terminal.error,
    stakedVoid: stakedVoid.error,
    duplicateSettlement: duplicateSettlement.error,
  },
}, null, 2));
