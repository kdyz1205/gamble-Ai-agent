import assert from "node:assert/strict";
import {
  evaluateTrustedXpAdmission,
  TRUSTED_XP_MAX_PRIOR_PAIR_AWARDS,
  type TrustedXpClaim,
} from "../src/lib/summons/trusted-xp-admission";

const now = new Date("2026-10-25T00:00:00Z");
const claim: TrustedXpClaim = {
  challengeId: "quest-blue-red",
  creatorId: "creator-A",
  status: "settled",
  evidenceType: "video",
  players: [
    { userId: "creator-A", role: "creator", status: "accepted" },
    { userId: "opponent-B", role: "opponent", status: "accepted" },
  ],
  proofs: [
    { id: "proof-A", userId: "creator-A", type: "video" },
    { id: "proof-B", userId: "opponent-B", type: "video" },
  ],
  uploads: [
    {
      id: "upload-A", evidenceId: "proof-A", userId: "creator-A",
      challengeId: "quest-blue-red", status: "consumed",
      sha256: "a".repeat(64), contentType: "video/mp4",
      expectedSizeBytes: 4096, observedSizeBytes: 4096,
      verifiedAt: now, consumedAt: now,
    },
    {
      id: "upload-B", evidenceId: "proof-B", userId: "opponent-B",
      challengeId: "quest-blue-red", status: "consumed",
      sha256: "b".repeat(64), contentType: "video/mp4",
      expectedSizeBytes: 4096, observedSizeBytes: 4096,
      verifiedAt: now, consumedAt: now,
    },
  ],
  winningUserId: "creator-A",
  judgmentId: "judge-receipt-A",
  confidence: 0.96,
  reviewResolved: false,
  acceptedVerdictUserIds: ["creator-A", "opponent-B"],
  pastSamePairXpAwards: 0,
  reusedMediaHashesInOtherQuests: 0,
};

function blocked(label: string, update: Partial<TrustedXpClaim>, reason: string) {
  const res = evaluateTrustedXpAdmission({ ...claim, ...update });
  assert.equal(res.admittedForManualReview, false, label);
  assert.ok(res.blockers.includes(reason), label + ": " + JSON.stringify(res.blockers));
}

function main() {
  const ready = evaluateTrustedXpAdmission(claim);
  assert.equal(ready.admittedForManualReview, true);
  assert.deepEqual(ready.blockers, []);
  // This is NOT an award: only enough evidence to enter a separate review.
  assert.equal("amount" in ready, false);
  assert.equal("xp" in ready, false);

  blocked("pending Quest", { status: "disputed" }, "quest_not_settled");
  blocked("unsupported text-only proof", { evidenceType: "text" }, "unverified_proof_mode");
  blocked("no final receipt", { judgmentId: null }, "missing_final_winner_receipt");
  blocked("unverified winner", { winningUserId: "outsider" }, "missing_final_winner_receipt");
  blocked("low confidence", { confidence: 0.62 }, "low_confidence_without_resolved_review");
  blocked("missing consent", { acceptedVerdictUserIds: ["creator-A"] }, "missing_two_player_consent");
  blocked("duplicate acceptance", { acceptedVerdictUserIds: ["creator-A", "creator-A"] }, "missing_two_player_consent");
  blocked("wrong participant", { players: [{ userId: "creator-A", role: "creator", status: "accepted" }] },
    "invalid_two_player_membership");
  blocked("missing proof", { proofs: [claim.proofs[0]] }, "missing_individual_evidence");
  blocked("unbound evidence", { uploads: [claim.uploads[0]] }, "private_proof_receipt_invalid");
  blocked("wrong object owner", { uploads: [{ ...claim.uploads[0], userId: "outsider" }, claim.uploads[1]] },
    "private_proof_receipt_invalid");
  blocked("malformed sha", { uploads: [{ ...claim.uploads[0], sha256: "a".repeat(63) }, claim.uploads[1]] },
    "private_proof_receipt_invalid");
  blocked("size mismatch", { uploads: [{ ...claim.uploads[0], observedSizeBytes: 4095 }, claim.uploads[1]] },
    "private_proof_receipt_invalid");
  blocked("record not consumed", { uploads: [{ ...claim.uploads[0], status: "verified" }, claim.uploads[1]] },
    "private_proof_receipt_invalid");
  blocked("missing verifiedAt", { uploads: [{ ...claim.uploads[0], verifiedAt: null }, claim.uploads[1]] },
    "private_proof_receipt_invalid");
  blocked("cross-Quest hash replay", { reusedMediaHashesInOtherQuests: 1 }, "media_replay_across_quests");
  blocked("repeat opponent farm", { pastSamePairXpAwards: TRUSTED_XP_MAX_PRIOR_PAIR_AWARDS },
    "repeated_pair_cooldown");

  const sameCamera = {
    ...claim,
    uploads: [{ ...claim.uploads[0] }, { ...claim.uploads[1], sha256: claim.uploads[0].sha256 }],
  };
  assert.equal(evaluateTrustedXpAdmission(sameCamera).admittedForManualReview, true,
    "Shared same-camera footage within one Quest remains allowed");

  const humanResolved = { ...claim, confidence: 0.4, reviewResolved: true,
    acceptedVerdictUserIds: [] };
  assert.equal(evaluateTrustedXpAdmission(humanResolved).admittedForManualReview, true,
    "A verified, resolved manual review may replace high AI confidence and double consent");
  console.log("PASS trusted Quest XP admission: 19 anti-replay, provenance, consent, membership and abuse cases");
}
main();
