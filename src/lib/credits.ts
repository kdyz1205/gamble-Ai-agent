import prisma from "./db";
import {
  isOnChainEnabled,
  burnForInference,
  settleOnChain,
  getAllBalances,
  getBalance,
  txLink,
  MODEL_TIERS,
  tierById,
  type TierId,
  type TierBalance,
} from "./contracts";
import type { Address } from "viem";

/**
 * Tiered Token Economy — Each AI model has its own token.
 *
 * HAIKU token  (id=1): cheap, fast inference    — $0.01 each
 * SONNET token (id=2): balanced                 — $0.05 each
 * OPUS token   (id=3): most powerful            — $0.25 each
 *
 * Tokens are:
 *   - Bought with USDC (on-chain mint)
 *   - Burned when AI is called (1 token = 1 inference)
 *   - Staked as bets (Opus stakes are worth 25x Haiku stakes)
 *   - Freely tradeable on any ERC-1155 marketplace
 *
 * Off-chain mode: uses integer credits in PostgreSQL (1 credit = 1 Haiku equivalent)
 * Off-chain tier multipliers: HAIKU=1, SONNET=5, OPUS=25
 */

export const TIER_MULTIPLIER = { 1: 1, 2: 5, 3: 25 } as const;

export const COSTS = {
  PARSE: 1,
  JUDGE: 1,
  SIGNUP_BONUS: 50, // 50 Haiku-equivalent credits
  CREDITS_PER_USDC: 100,
} as const;

// ── Reads ──

export async function getCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return user?.credits ?? 0;
}

export async function getTokenBalances(userId: string): Promise<TierBalance[] | null> {
  if (!isOnChainEnabled()) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { evmAddress: true } });
  if (!user?.evmAddress) return null;
  return getAllBalances(user.evmAddress as Address);
}

export async function hasTierTokens(userId: string, tierId: TierId, amount: number): Promise<boolean> {
  if (!isOnChainEnabled()) {
    const credits = await getCredits(userId);
    return credits >= amount * TIER_MULTIPLIER[tierId];
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { evmAddress: true } });
  if (!user?.evmAddress) return false;
  const bal = await getBalance(user.evmAddress as Address, tierId);
  return bal >= amount;
}

// ── Spend (AI inference) ──

export async function spendForInference(
  userId: string,
  tierId: TierId,
  action: string,
  description: string,
  challengeId?: string,
): Promise<{ success: boolean; balance: number; txHash?: string; model: string; error?: string }> {
  const tier = tierById(tierId);

  // On-chain: burn 1 model token
  if (isOnChainEnabled()) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { evmAddress: true } });
    if (user?.evmAddress) {
      try {
        const { txHash } = await burnForInference(user.evmAddress as Address, tierId, action, challengeId);
        const newBal = await getBalance(user.evmAddress as Address, tierId);

        await prisma.creditTx.create({
          data: {
            userId,
            type: `ai_${action}`,
            amount: -1,
            balanceAfter: newBal,
            description: `${description} [${tier.name} on-chain]`,
            challengeId,
            x402TxHash: txHash,
          },
        });

        return { success: true, balance: newBal, txHash, model: tier.model };
      } catch (err) {
        return { success: false, balance: 0, model: tier.model, error: err instanceof Error ? err.message : "Burn failed" };
      }
    }
  }

  // Off-chain: atomic conditional decrement.
  // updateMany with {credits: {gte: cost}} is a single SQL statement equivalent to:
  //   UPDATE "User" SET credits = credits - cost WHERE id = ? AND credits >= cost
  // so two concurrent calls cannot both pass the balance check at different moments.
  const cost = TIER_MULTIPLIER[tierId];
  const result = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: cost } },
    data: { credits: { decrement: cost } },
  });
  if (result.count === 0) {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    return { success: false, balance: current?.credits ?? 0, model: tier.model, error: "Insufficient credits" };
  }

  // Refetch balance for the tx row (not in the same transaction — acceptable for ledger display).
  const after = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  await prisma.creditTx.create({
    data: {
      userId,
      type: `ai_${action}`,
      amount: -cost,
      balanceAfter: after?.credits ?? 0,
      description: `${description} [${tier.name}]`,
      challengeId,
    },
  });

  return { success: true, balance: after?.credits ?? 0, model: tier.model };
}

// ── Stake / Add Credits ──

/**
 * Atomic credit decrement. Uses a single conditional updateMany so two concurrent
 * callers can't both pass the balance check at different moments and double-spend.
 * If the update touched 0 rows, the caller had insufficient credits.
 */
export async function spendCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  challengeId?: string,
): Promise<{ success: boolean; balance: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, balance: 0, error: "Invalid spend amount" };
  }
  const result = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  if (result.count === 0) {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    return { success: false, balance: current?.credits ?? 0, error: "Insufficient credits" };
  }
  const after = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  await prisma.creditTx.create({
    data: { userId, type, amount: -amount, balanceAfter: after?.credits ?? 0, description, challengeId },
  });
  return { success: true, balance: after?.credits ?? 0 };
}

export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  challengeId?: string,
  x402TxHash?: string,
): Promise<{ balance: number }> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      credits: { increment: amount },
      ...(type === "topup" ? { totalCreditsBought: { increment: amount } } : {}),
      ...(type === "win" ? { totalCreditsWon: { increment: amount } } : {}),
    },
  });
  await prisma.creditTx.create({
    data: { userId, type, amount, balanceAfter: updated.credits, description, challengeId, x402TxHash },
  });
  return { balance: updated.credits };
}

// ── Settlement ──

export async function settleChallenge(
  challengeId: string,
  winnerId: string | null,
  stake: number,
  participants: Array<{ userId: string }>,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (stake <= 0) return { success: true };

  // On-chain
  if (isOnChainEnabled()) {
    const winner = winnerId
      ? await prisma.user.findUnique({ where: { id: winnerId }, select: { evmAddress: true } })
      : null;
    if (winner?.evmAddress || !winnerId) {
      try {
        const txHash = await settleOnChain(challengeId, (winner?.evmAddress as Address) || null);
        for (const p of participants) {
          const isWinner = p.userId === winnerId;
          await prisma.creditTx.create({
            data: {
              userId: p.userId,
              type: isWinner ? "win" : (winnerId ? "loss" : "refund"),
              amount: isWinner ? stake * 2 : (winnerId ? -stake : stake),
              balanceAfter: 0,
              description: isWinner ? `Won — +${stake * 2} tokens [on-chain]` : `Lost [on-chain]`,
              challengeId,
              x402TxHash: txHash,
            },
          });
        }
        return { success: true, txHash };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Settlement failed" };
      }
    }
  }

  // Off-chain
  if (!winnerId) {
    for (const p of participants) {
      await addCredits(p.userId, stake, "refund", "Challenge voided — credits refunded", challengeId);
    }
    return { success: true };
  }

  // Multi-participant safe: iterate over EVERY non-winner, not just the first.
  // Previously this assumed exactly 2 players; for a 3+ player stake pool the
  // winner would only receive stake*2 while the 3rd+ players' stakes were
  // silently absorbed into the void (maxParticipants can be > 2 per schema).
  const losers = participants.filter((p) => p.userId !== winnerId);
  if (losers.length === 0) {
    // Solo / no-opponent payout — just refund the stake.
    await addCredits(winnerId, stake, "refund", "Solo challenge — stake refunded", challengeId);
    return { success: true };
  }

  for (const loser of losers) {
    const row = await prisma.user.findUnique({ where: { id: loser.userId }, select: { credits: true } });
    await prisma.creditTx.create({
      data: {
        userId: loser.userId,
        type: "loss",
        amount: -stake,
        balanceAfter: row?.credits ?? 0,
        description: `Lost challenge — ${stake} credits`,
        challengeId,
      },
    });
    await prisma.user.update({
      where: { id: loser.userId },
      data: { totalCreditsLost: { increment: stake } },
    });
  }

  // Winner takes own stake back + every loser's stake.
  const totalWinnings = stake * (losers.length + 1); // self + N losers
  await addCredits(
    winnerId,
    totalWinnings,
    "win",
    `Won challenge — +${totalWinnings} credits (${losers.length} opponent${losers.length > 1 ? "s" : ""})`,
    challengeId,
  );

  return { success: true };
}

export { txLink, MODEL_TIERS, tierById, isOnChainEnabled };
export type { TierId };
