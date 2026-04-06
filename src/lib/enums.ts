/**
 * String enums for SQLite compatibility.
 * SQLite doesn't support native enums, so we use string constants.
 */

export const ChallengeStatus = {
  draft: "draft",
  open: "open",
  matched: "matched",
  live: "live",
  judging: "judging",
  pending_settlement: "pending_settlement",
  settled: "settled",
  cancelled: "cancelled",
  disputed: "disputed",
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
