import { ChallengeStatus, type ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";
import { isTerminalStatus } from "@/lib/challenge-state-machine";

export type ManualOutcome = "winner" | "refund" | "void";

export const MANUAL_RESOLUTION_STATUSES: readonly ChallengeStatusValue[] = [
  ChallengeStatus.manual_review_required,
  ChallengeStatus.disputed,
  ChallengeStatus.ai_inconclusive,
  ChallengeStatus.dispute_window_open,
];

export type ManualReviewParticipant = {
  userId: string;
  status: string;
};

export type ManualResolutionPolicyInput = {
  status: string;
  creatorId: string;
  actorUserId: string;
  outcome: ManualOutcome | null;
  winnerId: string | null;
  stake: number;
  participants: ManualReviewParticipant[];
  existingSettlementRows: number;
};

export type ManualResolutionPolicyResult = {
  allowed: boolean;
  error?: string;
  status?: number;
  winnerId: string | null;
  acceptedParticipantIds: string[];
};

export function isManualResolutionStatus(status: string): status is ChallengeStatusValue {
  return (MANUAL_RESOLUTION_STATUSES as readonly string[]).includes(status);
}

export function evaluateManualResolutionPolicy(input: ManualResolutionPolicyInput): ManualResolutionPolicyResult {
  const acceptedParticipantIds = input.participants
    .filter((participant) => participant.status === "accepted")
    .map((participant) => participant.userId);

  if (!input.outcome) {
    return { allowed: false, error: "outcome must be winner, refund, or void", status: 400, winnerId: null, acceptedParticipantIds };
  }
  if (input.creatorId !== input.actorUserId) {
    return { allowed: false, error: "Only the creator can resolve manual review in this MVP", status: 403, winnerId: null, acceptedParticipantIds };
  }
  if (isTerminalStatus(input.status)) {
    return { allowed: false, error: `Challenge is already terminal (status=${input.status})`, status: 409, winnerId: null, acceptedParticipantIds };
  }
  if (!isManualResolutionStatus(input.status)) {
    return {
      allowed: false,
      error: `Manual resolution requires manual-review/disputed status (status=${input.status})`,
      status: 409,
      winnerId: null,
      acceptedParticipantIds,
    };
  }
  if (acceptedParticipantIds.length === 0) {
    return { allowed: false, error: "No accepted participants to resolve", status: 409, winnerId: null, acceptedParticipantIds };
  }
  if (input.outcome === "winner" && (!input.winnerId || !acceptedParticipantIds.includes(input.winnerId))) {
    return { allowed: false, error: "winnerId must be an accepted participant", status: 400, winnerId: null, acceptedParticipantIds };
  }
  if (input.outcome === "void" && input.stake > 0) {
    return {
      allowed: false,
      error: "Staked challenges cannot be voided without refunding locked credits",
      status: 400,
      winnerId: null,
      acceptedParticipantIds,
    };
  }
  if (input.existingSettlementRows > 0) {
    return {
      allowed: false,
      error: "Settlement rows already exist for this challenge; refusing duplicate manual settlement",
      status: 409,
      winnerId: null,
      acceptedParticipantIds,
    };
  }

  return {
    allowed: true,
    winnerId: input.outcome === "winner" ? input.winnerId : null,
    acceptedParticipantIds,
  };
}
