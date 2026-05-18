import { ChallengeStatus } from "@/lib/enums";
import type { ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";

type Status = ChallengeStatusValue;

export const OPEN_FOR_OPPONENT_STATUSES: readonly Status[] = [
  ChallengeStatus.waiting_for_opponent,
  ChallengeStatus.open,
];

export const EVIDENCE_WINDOW_STATUSES: readonly Status[] = [
  ChallengeStatus.evidence_window_open,
  ChallengeStatus.creator_submitted,
  ChallengeStatus.opponent_submitted,
  ChallengeStatus.live,
  ChallengeStatus.matched,
];

export const AI_REVIEW_STATUSES: readonly Status[] = [
  ChallengeStatus.ai_reviewing,
  ChallengeStatus.judging,
];

export const VERDICT_READY_STATUSES: readonly Status[] = [
  ChallengeStatus.ai_verdict_ready,
  ChallengeStatus.dispute_window_open,
  ChallengeStatus.manual_review_required,
  ChallengeStatus.ai_inconclusive,
  ChallengeStatus.disputed,
  ChallengeStatus.judging,
];

export const TERMINAL_STATUSES: readonly Status[] = [
  ChallengeStatus.settled,
  ChallengeStatus.cancelled,
  ChallengeStatus.expired,
  ChallengeStatus.refunded,
  ChallengeStatus.voided,
  ChallengeStatus.resolved,
  ChallengeStatus.void,
];

/**
 * Allowed challenge status transitions (server-side). Same-status transition is
 * always allowed. The canonical path is:
 *
 * draft -> generated_spec -> creator_confirmed -> waiting_for_opponent
 * -> opponent_accepted -> escrow_locked -> evidence_window_open
 * -> creator/opponent_submitted -> ai_reviewing -> ai_verdict_ready
 * -> dispute_window_open -> finalized -> settled
 *
 * Legacy states remain in the graph so older production rows can still move
 * forward safely.
 */
const EDGES: Record<Status, ReadonlySet<Status>> = {
  [ChallengeStatus.draft]: new Set([
    ChallengeStatus.generated_spec,
    ChallengeStatus.creator_confirmed,
    ChallengeStatus.waiting_for_opponent,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.generated_spec]: new Set([
    ChallengeStatus.creator_confirmed,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.creator_confirmed]: new Set([
    ChallengeStatus.waiting_for_opponent,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.waiting_for_opponent]: new Set([
    ChallengeStatus.opponent_accepted,
    ChallengeStatus.opponent_declined,
    ChallengeStatus.cancelled,
    ChallengeStatus.expired,
  ]),
  [ChallengeStatus.opponent_accepted]: new Set([
    ChallengeStatus.escrow_locked,
    ChallengeStatus.evidence_window_open,
    ChallengeStatus.cancelled,
    ChallengeStatus.refunded,
  ]),
  [ChallengeStatus.escrow_locked]: new Set([
    ChallengeStatus.evidence_window_open,
    ChallengeStatus.cancelled,
    ChallengeStatus.refunded,
  ]),
  [ChallengeStatus.evidence_window_open]: new Set([
    ChallengeStatus.creator_submitted,
    ChallengeStatus.opponent_submitted,
    ChallengeStatus.ai_reviewing,
    ChallengeStatus.evidence_missing,
    ChallengeStatus.evidence_invalid,
    ChallengeStatus.cancelled,
    ChallengeStatus.expired,
  ]),
  [ChallengeStatus.creator_submitted]: new Set([
    ChallengeStatus.ai_reviewing,
    ChallengeStatus.opponent_submitted,
    ChallengeStatus.evidence_missing,
    ChallengeStatus.evidence_invalid,
    ChallengeStatus.cancelled,
    ChallengeStatus.expired,
  ]),
  [ChallengeStatus.opponent_submitted]: new Set([
    ChallengeStatus.ai_reviewing,
    ChallengeStatus.creator_submitted,
    ChallengeStatus.evidence_missing,
    ChallengeStatus.evidence_invalid,
    ChallengeStatus.cancelled,
    ChallengeStatus.expired,
  ]),
  [ChallengeStatus.ai_reviewing]: new Set([
    ChallengeStatus.ai_verdict_ready,
    ChallengeStatus.dispute_window_open,
    ChallengeStatus.ai_inconclusive,
    ChallengeStatus.manual_review_required,
    ChallengeStatus.evidence_invalid,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.ai_verdict_ready]: new Set([
    ChallengeStatus.dispute_window_open,
    ChallengeStatus.finalized,
    ChallengeStatus.disputed,
    ChallengeStatus.manual_review_required,
  ]),
  [ChallengeStatus.dispute_window_open]: new Set([
    ChallengeStatus.finalized,
    ChallengeStatus.disputed,
    ChallengeStatus.manual_review_required,
  ]),
  [ChallengeStatus.finalized]: new Set([
    ChallengeStatus.settled,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
    ChallengeStatus.manual_review_required,
  ]),
  [ChallengeStatus.settled]: new Set([]),
  [ChallengeStatus.opponent_declined]: new Set([
    ChallengeStatus.cancelled,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
  ]),
  [ChallengeStatus.cancelled]: new Set([ChallengeStatus.refunded, ChallengeStatus.voided]),
  [ChallengeStatus.expired]: new Set([
    ChallengeStatus.evidence_missing,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
  ]),
  [ChallengeStatus.evidence_missing]: new Set([
    ChallengeStatus.manual_review_required,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
  ]),
  [ChallengeStatus.evidence_invalid]: new Set([
    ChallengeStatus.manual_review_required,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
  ]),
  [ChallengeStatus.ai_inconclusive]: new Set([
    ChallengeStatus.manual_review_required,
    ChallengeStatus.disputed,
    ChallengeStatus.finalized,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
  ]),
  [ChallengeStatus.manual_review_required]: new Set([
    ChallengeStatus.dispute_window_open,
    ChallengeStatus.finalized,
    ChallengeStatus.disputed,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
  ]),
  [ChallengeStatus.disputed]: new Set([
    ChallengeStatus.manual_review_required,
    ChallengeStatus.dispute_window_open,
    ChallengeStatus.finalized,
    ChallengeStatus.refunded,
    ChallengeStatus.voided,
    ChallengeStatus.cancelled,
    ChallengeStatus.judging,
    ChallengeStatus.pending_settlement,
    ChallengeStatus.settled,
  ]),
  [ChallengeStatus.refunded]: new Set([]),
  [ChallengeStatus.voided]: new Set([ChallengeStatus.refunded]),

  // Legacy forward paths.
  [ChallengeStatus.open]: new Set([
    ChallengeStatus.waiting_for_opponent,
    ChallengeStatus.opponent_accepted,
    ChallengeStatus.evidence_window_open,
    ChallengeStatus.live,
    ChallengeStatus.judging,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.matched]: new Set([
    ChallengeStatus.evidence_window_open,
    ChallengeStatus.live,
    ChallengeStatus.judging,
    ChallengeStatus.ai_reviewing,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.live]: new Set([
    ChallengeStatus.evidence_window_open,
    ChallengeStatus.creator_submitted,
    ChallengeStatus.opponent_submitted,
    ChallengeStatus.judging,
    ChallengeStatus.ai_reviewing,
    ChallengeStatus.cancelled,
    ChallengeStatus.disputed,
  ]),
  [ChallengeStatus.judging]: new Set([
    ChallengeStatus.ai_reviewing,
    ChallengeStatus.ai_verdict_ready,
    ChallengeStatus.dispute_window_open,
    ChallengeStatus.manual_review_required,
    ChallengeStatus.ai_inconclusive,
    ChallengeStatus.pending_settlement,
    ChallengeStatus.finalized,
    ChallengeStatus.settled,
    ChallengeStatus.disputed,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.pending_settlement]: new Set([
    ChallengeStatus.finalized,
    ChallengeStatus.settled,
    ChallengeStatus.disputed,
    ChallengeStatus.cancelled,
  ]),
  [ChallengeStatus.resolved]: new Set([ChallengeStatus.settled]),
  [ChallengeStatus.void]: new Set([ChallengeStatus.voided, ChallengeStatus.refunded]),
};

export function validateChallengeTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return EDGES[from as Status]?.has(to as Status) ?? false;
}

export function assertChallengeTransition(from: string, to: string): void {
  if (from === to) return;
  if (!validateChallengeTransition(from, to)) {
    throw new Error(`Invalid challenge transition: ${from} -> ${to}`);
  }
}

export function isOpenForOpponentStatus(status: string): boolean {
  return (OPEN_FOR_OPPONENT_STATUSES as readonly string[]).includes(status);
}

export function isEvidenceWindowStatus(status: string): boolean {
  return (EVIDENCE_WINDOW_STATUSES as readonly string[]).includes(status);
}

export function isAiReviewStatus(status: string): boolean {
  return (AI_REVIEW_STATUSES as readonly string[]).includes(status);
}

export function isVerdictReadyStatus(status: string): boolean {
  return (VERDICT_READY_STATUSES as readonly string[]).includes(status);
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function expandChallengeStatusFilter(status?: string | null): string[] | undefined {
  if (!status) return undefined;
  switch (status) {
    case ChallengeStatus.open:
    case ChallengeStatus.waiting_for_opponent:
      return [...OPEN_FOR_OPPONENT_STATUSES];
    case ChallengeStatus.live:
    case ChallengeStatus.evidence_window_open:
      return [...EVIDENCE_WINDOW_STATUSES];
    case ChallengeStatus.judging:
    case ChallengeStatus.ai_reviewing:
      return [...AI_REVIEW_STATUSES];
    case ChallengeStatus.disputed:
    case ChallengeStatus.ai_verdict_ready:
    case ChallengeStatus.dispute_window_open:
    case ChallengeStatus.manual_review_required:
    case ChallengeStatus.ai_inconclusive:
      return [...VERDICT_READY_STATUSES];
    case ChallengeStatus.settled:
      return [ChallengeStatus.settled, ChallengeStatus.resolved];
    case ChallengeStatus.cancelled:
      return [ChallengeStatus.cancelled, ChallengeStatus.opponent_declined, ChallengeStatus.expired];
    default:
      return [status];
  }
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    [ChallengeStatus.draft]: "Draft",
    [ChallengeStatus.generated_spec]: "Spec generated",
    [ChallengeStatus.creator_confirmed]: "Creator confirmed",
    [ChallengeStatus.waiting_for_opponent]: "Waiting for opponent",
    [ChallengeStatus.opponent_accepted]: "Opponent accepted",
    [ChallengeStatus.escrow_locked]: "Escrow locked",
    [ChallengeStatus.evidence_window_open]: "Evidence window open",
    [ChallengeStatus.creator_submitted]: "Creator submitted",
    [ChallengeStatus.opponent_submitted]: "Opponent submitted",
    [ChallengeStatus.ai_reviewing]: "AI reviewing",
    [ChallengeStatus.ai_verdict_ready]: "AI verdict ready",
    [ChallengeStatus.dispute_window_open]: "Dispute window open",
    [ChallengeStatus.finalized]: "Finalized",
    [ChallengeStatus.settled]: "Settled",
    [ChallengeStatus.opponent_declined]: "Opponent declined",
    [ChallengeStatus.cancelled]: "Cancelled",
    [ChallengeStatus.expired]: "Expired",
    [ChallengeStatus.evidence_missing]: "Evidence missing",
    [ChallengeStatus.evidence_invalid]: "Evidence invalid",
    [ChallengeStatus.ai_inconclusive]: "AI inconclusive",
    [ChallengeStatus.manual_review_required]: "Manual review required",
    [ChallengeStatus.disputed]: "Disputed",
    [ChallengeStatus.refunded]: "Refunded",
    [ChallengeStatus.voided]: "Voided",
    [ChallengeStatus.open]: "Waiting for opponent",
    [ChallengeStatus.matched]: "Evidence window open",
    [ChallengeStatus.live]: "Evidence window open",
    [ChallengeStatus.judging]: "AI reviewing",
    [ChallengeStatus.pending_settlement]: "Finalizing settlement",
    [ChallengeStatus.resolved]: "Settled",
    [ChallengeStatus.void]: "Voided",
  };
  return labels[status] ?? status;
}
