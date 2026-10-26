/**
 * Conservative XP *admission* for real video/photo Quests.
 *
 * Server-side evidence bytes and final consent are necessary but NOT proof of
 * liveness, unique players or absence of collusion. This guard only narrows
 * what may enter a future manual-reviewed XP issuance queue. Never use this
 * result to award items, tickets or monetary value by itself.
 */
export const TRUSTED_XP_PAIR_WINDOW_DAYS = 7;
export const TRUSTED_XP_MAX_PRIOR_PAIR_AWARDS = 2;

export type TrustedXpPlayer = {
  userId: string;
  role: string;
  status: string;
};

export type TrustedXpProof = {
  id: string;
  userId: string;
  type: string;
};

export type TrustedXpUpload = {
  id: string;
  challengeId: string;
  evidenceId: string | null;
  userId: string;
  status: string;
  sha256: string | null;
  contentType: string;
  expectedSizeBytes: number;
  observedSizeBytes: number | null;
  verifiedAt: Date | null;
  consumedAt: Date | null;
};

export type TrustedXpClaim = {
  challengeId: string;
  creatorId: string;
  status: string;
  evidenceType: string;
  players: readonly TrustedXpPlayer[];
  proofs: readonly TrustedXpProof[];
  uploads: readonly TrustedXpUpload[];
  winningUserId: string | null;
  judgmentId: string | null;
  confidence: number | null;
  // A resolved manual review is an alternate trusted source of finality.
  reviewResolved: boolean;
  acceptedVerdictUserIds: readonly string[];
  pastSamePairXpAwards: number;
  reusedMediaHashesInOtherQuests: number;
};

export type TrustedXpAdmission = {
  admittedForManualReview: boolean;
  blockers: string[];
};

/**
 * Read-only policy, independent of the browser's XP UI.
 * A successful result means MAY ENTER REVIEW, not "earn XP".
 */
export function evaluateTrustedXpAdmission(c: TrustedXpClaim): TrustedXpAdmission {
  const blockers: string[] = [];
  if (c.status !== "settled") blockers.push("quest_not_settled");
  if (!["video", "photo"].includes(c.evidenceType)) blockers.push("unverified_proof_mode");

  const players = c.players.filter(p =>
    ["creator", "opponent"].includes(p.role) &&
    ["accepted", "completed"].includes(p.status));
  const ids = new Set(players.map(p => p.userId));
  if (players.length !== 2 || ids.size !== 2 ||
      players.filter(p => p.role === "creator" && p.userId === c.creatorId).length !== 1 ||
      players.filter(p => p.role === "opponent").length !== 1) {
    blockers.push("invalid_two_player_membership");
  }
  if (!c.winningUserId || !ids.has(c.winningUserId) || !c.judgmentId) {
    blockers.push("missing_final_winner_receipt");
  }
  if (!c.reviewResolved &&
      (!Number.isFinite(c.confidence) || (c.confidence ?? 0) < 0.9)) {
    blockers.push("low_confidence_without_resolved_review");
  }
  if (!c.reviewResolved &&
      (new Set(c.acceptedVerdictUserIds).size !== 2 ||
       c.acceptedVerdictUserIds.some(id => !ids.has(id)))) {
    blockers.push("missing_two_player_consent");
  }

  const usedIds = new Set<string>();
  const hashes = new Set<string>();
  const uploads = new Map<string, TrustedXpUpload>();
  for (const upload of c.uploads) {
    if (!upload.evidenceId || uploads.has(upload.evidenceId)) {
      blockers.push("conflicting_upload_bindings");
    } else {
      uploads.set(upload.evidenceId, upload);
    }
  }
  if (c.proofs.length !== 2 ||
      c.proofs.some(p => !ids.has(p.userId)) ||
      new Set(c.proofs.map(p => p.userId)).size !== 2) {
    blockers.push("missing_individual_evidence");
  }
  for (const proof of c.proofs) {
    const u = uploads.get(proof.id);
    if (!u || !u.id || u.challengeId !== c.challengeId ||
        u.userId !== proof.userId || u.status !== "consumed" ||
        !/^[a-f0-9]{64}$/i.test(u.sha256 ?? "") ||
        !Number.isSafeInteger(u.expectedSizeBytes) || u.expectedSizeBytes < 2048 ||
        u.expectedSizeBytes > 80 * 1024 * 1024 ||
        u.observedSizeBytes !== u.expectedSizeBytes ||
        !u.verifiedAt || !u.consumedAt ||
        (proof.type !== "video" && proof.type !== "photo") ||
        proof.type !== c.evidenceType ||
        (proof.type === "video" ? !u.contentType.startsWith("video/") :
          !u.contentType.startsWith("image/"))) {
      blockers.push("private_proof_receipt_invalid");
    } else {
      usedIds.add(u.id);
      hashes.add(u.sha256!.toLowerCase());
    }
  }
  if (usedIds.size !== 2 || uploads.size !== 2) {
    blockers.push("private_evidence_not_exclusively_bound");
  }
  // Same-camera games can reuse ONE clip inside the same Quest; reusing its
  // hash in a DIFFERENT Quest is a separate anti-replay violation.
  if (c.reusedMediaHashesInOtherQuests > 0 ||
      !Number.isSafeInteger(c.reusedMediaHashesInOtherQuests)) {
    blockers.push("media_replay_across_quests");
  }
  if (!Number.isSafeInteger(c.pastSamePairXpAwards) ||
      c.pastSamePairXpAwards < 0 ||
      c.pastSamePairXpAwards >= TRUSTED_XP_MAX_PRIOR_PAIR_AWARDS) {
    blockers.push("repeated_pair_cooldown");
  }
  return { admittedForManualReview: blockers.length === 0,
    blockers: [...new Set(blockers)] };
}
