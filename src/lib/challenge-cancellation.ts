import prisma from "./db";
import { assertChallengeTransition } from "./challenge-state-machine";
import { ChallengeStatus } from "./enums";

export type CancellationResult = {
  ok: true; deletedId: string; status: "cancelled"; retained: true; refundedStake: number; reused: boolean;
} | { ok: false; status: number; error: string };

/** Cancel an unmatched quest, retaining all proof, participants and financial history. */
export async function cancelChallengeAtomic(challengeId: string, userId: string): Promise<CancellationResult> {
  return prisma.$transaction(async (tx): Promise<CancellationResult> => {
    // Acceptance and cancellation must choose one outcome before either debits/refunds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId}, 7117))`;
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
    const quest = await tx.challenge.findUnique({ where: { id: challengeId }, include: { participants: true } });
    if (!quest) return { ok: false, status: 404, error: "Challenge not found" };
    if (quest.creatorId !== userId) return { ok: false, status: 403, error: "Only the creator can cancel this quest" };
    if (!["draft", "open", "cancelled"].includes(quest.status)
      || quest.participants.some((p) => p.userId !== userId && p.role === "opponent" && ["accepted", "completed"].includes(p.status))) {
      return { ok: false, status: 409, error: "A quest with accepted players or an active outcome cannot be cancelled" };
    }
    const reconciliation = (): CancellationResult => ({ ok: false, status: 409, error: "Stake history requires reconciliation before this quest can be cancelled" });
    if (quest.escrowTxHash || quest.settleTxHash) return reconciliation();
    const key = `cancellation:${challengeId}:${userId}`;
    const ledger = await tx.creditTx.findMany({ where: { challengeId } });
    if (ledger.some((row) => ["win", "loss"].includes(row.type) || row.idempotencyKey === `settlement:${challengeId}`
      || (row.type === "stake" && (row.userId !== userId || row.amount >= 0 || row.x402TxHash)))) return reconciliation();
    const staked = ledger.filter((row) => row.userId === userId && row.type === "stake").reduce((sum, row) => sum - row.amount, 0);
    let refunded = 0;
    for (const row of ledger.filter((entry) => entry.type === "refund")) {
      if (row.userId !== userId || row.amount <= 0 || row.x402TxHash) return reconciliation();
      if (row.idempotencyKey?.startsWith(`refund:judge-fee:${challengeId}:`)) {
        const fee = ledger.find((entry) => entry.idempotencyKey === row.idempotencyKey!.slice("refund:".length));
        if (!fee || fee.type !== "ai_judge" || fee.userId !== userId || fee.amount !== -row.amount) return reconciliation();
        continue; // Compensation for inference is not a returned stake.
      }
      if (row.idempotencyKey !== key && ![
        "Challenge voided — credits refunded", "Solo challenge — stake refunded",
        "Settlement: inconclusive challenge stake refunded", "Settlement: solo challenge stake refunded",
      ].includes(row.description ?? "")) return reconciliation();
      refunded += row.amount;
    }
    if (refunded < 0 || refunded > staked || !Number.isSafeInteger(staked)) return reconciliation();
    if (quest.status === "open" && quest.stake > 0 && staked === 0) return reconciliation();
    const remaining = staked - refunded;
    const marker = ledger.find((row) => row.idempotencyKey === key);
    if (marker && (marker.type !== "refund" || marker.userId !== userId || remaining !== 0)) return reconciliation();
    // The old DELETE implementation refunded without a challengeId. A crash
    // could leave an open quest with such an unlinked refund; do not guess.
    if (remaining > 0 && await tx.creditTx.findFirst({ where: {
      userId, challengeId: null, type: "refund",
      description: `Refund — deleted market "${quest.title.slice(0, 40)}"`,
    } })) return reconciliation();
    if (remaining > 0) {
      const updated = await tx.user.update({ where: { id: userId }, data: { credits: { increment: remaining } }, select: { credits: true } });
      await tx.creditTx.create({ data: {
        userId, challengeId, type: "refund", amount: remaining, balanceAfter: updated.credits,
        idempotencyKey: key, description: "Quest cancelled before opponent acceptance — recorded stake returned",
      } });
    }
    if (quest.status !== "cancelled" || remaining > 0) {
      assertChallengeTransition(quest.status as ChallengeStatus, ChallengeStatus.cancelled);
      await tx.challenge.update({ where: { id: challengeId }, data: { status: "cancelled" } });
      await tx.auditLog.create({ data: {
        action: "challenge.cancelled", actorUserId: userId, challengeId,
        payload: JSON.stringify({ previousStatus: quest.status, status: "cancelled", refundedStake: remaining, recordedStake: staked, priorRefunds: refunded, retained: true }),
      } });
      await tx.activityEvent.create({ data: { type: "challenge_cancelled", userId, challengeId,
        message: `"${quest.title}" cancelled before opponent acceptance; ${remaining} quest credits returned.` } });
    }
    return { ok: true, deletedId: challengeId, status: "cancelled", retained: true, refundedStake: remaining, reused: quest.status === "cancelled" };
  }, { maxWait: 15_000, timeout: 15_000 });
}
