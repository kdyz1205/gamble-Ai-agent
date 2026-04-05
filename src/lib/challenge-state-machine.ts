import { ChallengeStatus } from "@/generated/prisma/enums";

/**
 * Allowed challenge status transitions (server-side). Same-status "transition" is always allowed (no-op).
 */
const EDGES: Record<ChallengeStatus, ReadonlySet<ChallengeStatus>> = {
  [ChallengeStatus.draft]: new Set([ChallengeStatus.open, ChallengeStatus.cancelled]),
  [ChallengeStatus.open]: new Set([
    ChallengeStatus.live,
    ChallengeStatus.matched,
    ChallengeStatus.judging,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.matched]: new Set([
    ChallengeStatus.live,
    ChallengeStatus.judging,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.live]: new Set([
    ChallengeStatus.judging,
    ChallengeStatus.cancelled,
    ChallengeStatus.disputed,
  ]),
  [ChallengeStatus.judging]: new Set([
    ChallengeStatus.pending_settlement,
    ChallengeStatus.settled,
    ChallengeStatus.disputed,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.pending_settlement]: new Set([
    ChallengeStatus.settled,
    ChallengeStatus.disputed,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.settled]: new Set([]),
  [ChallengeStatus.cancelled]: new Set([]),
  [ChallengeStatus.disputed]: new Set([ChallengeStatus.judging, ChallengeStatus.settled, ChallengeStatus.cancelled]),
};

export function validateChallengeTransition(
  from: ChallengeStatus,
  to: ChallengeStatus,
): boolean {
  if (from === to) return true;
  return EDGES[from]?.has(to) ?? false;
}

/** Throws if transition is illegal (excluding no-op). */
export function assertChallengeTransition(
  from: ChallengeStatus,
  to: ChallengeStatus,
): void {
  if (from === to) return;
  if (!validateChallengeTransition(from, to)) {
    throw new Error(`Invalid challenge transition: ${from} → ${to}`);
  }
}
