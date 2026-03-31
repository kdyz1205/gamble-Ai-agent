import { getAuthUser, unauthorized, MODEL_TIERS } from "@/lib/auth";
import prisma from "@/lib/db";
import { getTokenBalances, TIER_MULTIPLIER } from "@/lib/credits";
import { isOnChainEnabled, tokenLink } from "@/lib/contracts";

/**
 * GET /api/tokens — Full token status: off-chain credits + on-chain per-tier balances
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      credits: true,
      totalCreditsWon: true,
      totalCreditsLost: true,
      totalCreditsBought: true,
      evmAddress: true,
    },
  });

  if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 });

  const onChainBalances = await getTokenBalances(user.userId);

  const recentTxs = await prisma.creditTx.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return Response.json({
    offChain: {
      credits: dbUser.credits,
      stats: { won: dbUser.totalCreditsWon, lost: dbUser.totalCreditsLost, bought: dbUser.totalCreditsBought },
    },
    onChain: onChainBalances
      ? {
          balances: onChainBalances,
          totalValueUsd: onChainBalances.reduce((s, b) => s + b.valueUsd, 0),
          tokenAddress: process.env.USAGE_TOKEN_ADDRESS,
          explorerLink: dbUser.evmAddress ? tokenLink(dbUser.evmAddress) : null,
          network: process.env.X402_NETWORK || "base-sepolia",
        }
      : null,
    isOnChainEnabled: isOnChainEnabled(),
    evmAddress: dbUser.evmAddress,
    transactions: recentTxs,
    tiers: {
      haiku:  { id: 1, name: "Haiku",  priceUsd: 0.01, creditCost: TIER_MULTIPLIER[1], model: MODEL_TIERS.HAIKU.model },
      sonnet: { id: 2, name: "Sonnet", priceUsd: 0.05, creditCost: TIER_MULTIPLIER[2], model: MODEL_TIERS.SONNET.model },
      opus:   { id: 3, name: "Opus",   priceUsd: 0.25, creditCost: TIER_MULTIPLIER[3], model: MODEL_TIERS.OPUS.model },
    },
  });
}
