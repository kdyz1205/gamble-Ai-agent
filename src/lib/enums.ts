/**
 * String enums for SQLite compatibility.
 * SQLite doesn't support native enums, so we use string constants.
 */

export const ChallengeStatus = {
  // Canonical creation path
  draft: "draft",
  generated_spec: "generated_spec",
  creator_confirmed: "creator_confirmed",
  waiting_for_opponent: "waiting_for_opponent",
  opponent_accepted: "opponent_accepted",
  escrow_locked: "escrow_locked",
  evidence_window_open: "evidence_window_open",
  creator_submitted: "creator_submitted",
  opponent_submitted: "opponent_submitted",
  ai_reviewing: "ai_reviewing",
  ai_verdict_ready: "ai_verdict_ready",
  dispute_window_open: "dispute_window_open",
  finalized: "finalized",
  settled: "settled",

  // Canonical failure / exception states
  opponent_declined: "opponent_declined",
  cancelled: "cancelled",
  expired: "expired",
  evidence_missing: "evidence_missing",
  evidence_invalid: "evidence_invalid",
  ai_inconclusive: "ai_inconclusive",
  manual_review_required: "manual_review_required",
  disputed: "disputed",
  refunded: "refunded",
  voided: "voided",

  // Legacy statuses kept readable so existing production rows do not break.
  open: "open",
  matched: "matched",
  live: "live",
  judging: "judging",
  pending_settlement: "pending_settlement",
  resolved: "resolved",
  void: "void",
} as const;

export type ChallengeStatus = (typeof ChallengeStatus)[keyof typeof ChallengeStatus];

export const ParticipantRole = {
  creator: "creator",
  opponent: "opponent",
  spectator: "spectator",
} as const;

export type ParticipantRole = (typeof ParticipantRole)[keyof typeof ParticipantRole];

export const ParticipantStatus = {
  pending: "pending",
  accepted: "accepted",
  declined: "declined",
  completed: "completed",
} as const;

export type ParticipantStatus = (typeof ParticipantStatus)[keyof typeof ParticipantStatus];
