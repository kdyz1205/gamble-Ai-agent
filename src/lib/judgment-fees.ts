import prisma from "./db";
import { isOnChainEnabled, TIER_MULTIPLIER, type TierId } from "./credits";
import type { Prisma } from "@/generated/prisma/client";

type Transaction = Prisma.TransactionClient;
export interface JudgmentFeeResult {
  success: boolean;
  balance: number;
  error?: string;
  txHash?: string;
}

function feeKey(challengeId: string, attemptId: string) {
  if (!challengeId || !attemptId) throw new Error("Judgment fee requires challenge and execution attempt identifiers");
  return `judge-fee:${challengeId}:${attemptId}`;
}

function offChainOnly() {
  if (isOnChainEnabled()) throw new Error("Judgment fee reconciliation supports off-chain credits only");
}

async function balance(tx: Transaction, userId: string) {
  return (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })).credits;
}

/** One debit per execution attempt; called while holding the challenge execution lock. */
export async function reserveJudgmentFee(
  userId: string, tierId: TierId, challengeId: string, attemptId: string,
): Promise<JudgmentFeeResult> {
  offChainOnly();
  const key = feeKey(challengeId, attemptId);
  const cost = TIER_MULTIPLIER[tierId];
  if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error("Invalid judgment fee tier");
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.creditTx.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.userId !== userId || existing.challengeId !== challengeId || existing.type !== "ai_judge" || existing.amount !== -cost) {
          throw new Error("Judgment fee attempt does not match the original debit");
        }
        const refunded = await tx.creditTx.findUnique({ where: { idempotencyKey: `refund:${key}` } });
        return { success: !refunded, balance: await balance(tx, userId), ...(refunded ? { error: "Judgment execution attempt was already refunded" } : {}) };
      }
      const debited = await tx.user.updateMany({ where: { id: userId, credits: { gte: cost } }, data: { credits: { decrement: cost } } });
      if (debited.count === 0) return { success: false, balance: await balance(tx, userId), error: "Insufficient credits" };
      const remaining = await balance(tx, userId);
      await tx.creditTx.create({ data: {
        userId, challengeId, type: "ai_judge", amount: -cost, balanceAfter: remaining,
        description: `Judgment inference fee; execution ${attemptId}`, idempotencyKey: key,
      } });
      return { success: true, balance: remaining };
    });
  } catch (error) {
    // A concurrent identical reservation can lose the unique-key race. Its debit rolled back.
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await prisma.creditTx.findUnique({ where: { idempotencyKey: key } });
    if (!existing || existing.userId !== userId || existing.challengeId !== challengeId || existing.type !== "ai_judge" || existing.amount !== -cost) throw error;
    const refunded = await prisma.creditTx.findUnique({ where: { idempotencyKey: `refund:${key}` } });
    const remaining = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })).credits;
    return { success: !refunded, balance: remaining, ...(refunded ? { error: "Judgment execution attempt was already refunded" } : {}) };
  }
}

async function refundFee(tx: Transaction, userId: string, challengeId: string, key: string, reason: string) {
  const fee = await tx.creditTx.findUnique({ where: { idempotencyKey: key } });
  if (!fee) return { refunded: false, amount: 0, balance: await balance(tx, userId) };
  if (fee.userId !== userId || fee.challengeId !== challengeId || fee.type !== "ai_judge" || fee.amount >= 0) {
    throw new Error("Judgment fee refund does not match the original debit");
  }
  if (await tx.creditTx.findUnique({ where: { idempotencyKey: `refund:${key}` } })) {
    return { refunded: false, amount: 0, balance: await balance(tx, userId) };
  }
  const amount = -fee.amount;
  const updated = await tx.user.update({ where: { id: userId }, data: { credits: { increment: amount } }, select: { credits: true } });
  await tx.creditTx.create({ data: {
    userId, challengeId, type: "refund", amount, balanceAfter: updated.credits,
    description: reason.slice(0, 500), idempotencyKey: `refund:${key}`,
  } });
  return { refunded: true, amount, balance: updated.credits };
}

/** Idempotent compensation for one marked off-chain execution fee. */
export async function refundJudgmentFee(
  userId: string, challengeId: string, attemptId: string, reason: string,
): Promise<JudgmentFeeResult> {
  offChainOnly();
  const key = feeKey(challengeId, attemptId);
  try {
    const result = await prisma.$transaction((tx) => refundFee(tx, userId, challengeId, key, reason));
    return { success: true, balance: result.balance };
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const completed = await prisma.creditTx.findUnique({ where: { idempotencyKey: `refund:${key}` } });
    if (!completed || completed.userId !== userId || completed.challengeId !== challengeId) throw error;
    return { success: true, balance: (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })).credits };
  }
}

/**
 * Run under the challenge execution lock BEFORE reserving the next attempt's fee.
 * Only our explicitly marked fees are recoverable; historical/other charges remain untouched.
 * Completed judgments retain their fees. Every refund and balance update commit together.
 */
export async function reconcileJudgmentFees(challengeId: string): Promise<{ refundedCount: number; refundedCredits: number }> {
  offChainOnly();
  return prisma.$transaction(async (tx) => {
    if (await tx.judgment.findFirst({ where: { challengeId, status: "completed" }, select: { id: true } })) {
      return { refundedCount: 0, refundedCredits: 0 };
    }
    const fees = await tx.creditTx.findMany({ where: {
      challengeId, type: "ai_judge", amount: { lt: 0 }, idempotencyKey: { startsWith: `judge-fee:${challengeId}:` },
    }, orderBy: { createdAt: "asc" } });
    let refundedCount = 0, refundedCredits = 0;
    for (const fee of fees) {
      const result = await refundFee(tx, fee.userId, challengeId, fee.idempotencyKey!, "Recovered inference fee from interrupted judgment execution");
      if (result.refunded) { refundedCount++; refundedCredits += result.amount; }
    }
    return { refundedCount, refundedCredits };
  });
}
