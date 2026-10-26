/**
 * Player-facing career XP status. READ ONLY — never reconciles, repairs,
 * issues an XP receipt, grants a ticket or draws an owned Familiar.
 */
import prisma from "@/lib/db";
import { assessTrustedQuestXpWithTx } from "./trusted-xp-audit";
import {
  MANUAL_XP_APPROVAL_VERSION,
  manualXpApprovalEnabled,
} from "./manual-xp-approval";
import { XP_LEDGER_VERSION, professionByQuestType } from "./server-ledger";

export type QuestXpStatus = {
  status:
    | "disabled"
    | "awaiting_final_result"
    | "awaiting_independent_review"
    | "approved_pending_issuance"
    | "review_revoked"
    | "awarded"
    | "requires_correction"
    | "not_eligible";
  verifiedXp: number | null;
  professionId: string | null;
  note: string;
};

export class QuestXpAccessError extends Error {
  constructor(public readonly httpStatus: number, message: string) {
    super(message);
    this.name = "QuestXpAccessError";
  }
}

const disabled: QuestXpStatus = {
  status: "disabled",
  verifiedXp: null,
  professionId: null,
  note: "Career XP rewards are not enabled. A settled match is not an XP receipt.",
};

export async function readMyQuestXpStatus(input: {
  challengeId: string;
  userId: string;
}): Promise<QuestXpStatus> {
  if (!input.challengeId?.trim() || !input.userId?.trim()) {
    throw new QuestXpAccessError(400, "Valid Quest and player required");
  }
  if (!manualXpApprovalEnabled()) return disabled;

  return prisma.$transaction(async tx => {
    const membership = await tx.participant.findUnique({
      where: { challengeId_userId: {
        challengeId: input.challengeId, userId: input.userId,
      } },
      select: { role: true, status: true },
    });
    if (!membership || !["creator", "opponent"].includes(membership.role) ||
        !["accepted", "completed"].includes(membership.status)) {
      throw new QuestXpAccessError(403, "Only an accepted player can see this Quest progression");
    }
    const quest = await tx.challenge.findUnique({
      where: { id: input.challengeId },
      select: { status: true, evidenceType: true, type: true },
    });
    if (!quest) throw new QuestXpAccessError(404, "Quest not found");
    if (!["video", "photo"].includes(quest.evidenceType)) {
      return {
        status: "not_eligible" as const, verifiedXp: null, professionId: null,
        note: "This Quest uses a separate career progression policy.",
      };
    }
    if (quest.status !== "settled") {
      return {
        status: "awaiting_final_result" as const,
        verifiedXp: null, professionId: null,
        note: "The final judgment, both confirmations or appeal is still pending.",
      };
    }

    // An interactive Prisma transaction owns one PostgreSQL connection.
    // Sequential reads preserve its repeatable-read snapshot without
    // scheduling overlapping queries on the same client.
    const approval = await tx.verifiedXpApproval.findUnique({
      where: { challengeId_ownerId: {
        challengeId: input.challengeId, ownerId: input.userId,
      } },
      include: { reviewer: { select: { isReviewer: true } } },
    });
    const event = await tx.professionXpEvent.findFirst({
      where: {
        challengeId: input.challengeId, ownerId: input.userId,
        awardType: "verified_quest", ruleVersion: XP_LEDGER_VERSION,
      },
      select: { amount: true, professionId: true, sourceReceipt: true, eventKey: true },
    });
    const audit = await assessTrustedQuestXpWithTx(tx, input);
    const approved = Boolean(approval && approval.status === "approved" &&
      !approval.revokedAt && approval.reviewer.isReviewer &&
      approval.policyVersion === MANUAL_XP_APPROVAL_VERSION &&
      approval.finalJudgmentId === audit.finalJudgmentId &&
      approval.sourceFingerprint === audit.sourceFingerprint &&
      audit.admittedForManualReview);

    if (event) {
      const expectedProfession = professionByQuestType[quest.type];
      const expectedAmount = audit.finalWinningUserId === input.userId ? 100 : 80;
      const expectedEventKey = expectedProfession
        ? "quest-xp:" + XP_LEDGER_VERSION + ":" +
          input.challengeId + ":" + input.userId + ":" + expectedProfession
        : null;
      const receiptValid = Boolean(audit.finalWinningUserId && expectedProfession &&
        (event.amount === expectedAmount) &&
        event.professionId === expectedProfession &&
        event.eventKey === expectedEventKey &&
        event.sourceReceipt === audit.finalJudgmentId);
      if (approved && receiptValid) {
        return {
          status: "awarded" as const,
          verifiedXp: event.amount,
          professionId: event.professionId,
          note: "Recorded, independently approved career XP. Free tickets require their own audited receipt.",
        };
      }
      return {
        status: "requires_correction" as const,
        verifiedXp: null,
        professionId: null,
        note: "A previous XP record requires independent reconciliation before it can be treated as current.",
      };
    }
    if (approval?.status === "revoked") {
      return {
        status: "review_revoked" as const,
        verifiedXp: null, professionId: null,
        note: "Independent review was revoked. XP cannot be issued without manual reconciliation.",
      };
    }
    if (approved) {
      return {
        status: "approved_pending_issuance" as const,
        verifiedXp: null, professionId: null,
        note: "Independent review approved. XP has not yet been issued.",
      };
    }
    return audit.admittedForManualReview
      ? {
          status: "awaiting_independent_review" as const,
          verifiedXp: null, professionId: null,
          note: "The recorded outcome is awaiting an independent progression review.",
        }
      : {
          status: "not_eligible" as const,
          verifiedXp: null, professionId: null,
          note: "This result is not currently eligible for a verified career XP receipt.",
        };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
