import { getAuthUser, unauthorized } from "@/lib/auth";
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

  const lightTier = { id: 1, name: "Free", priceUsd: 0.01, creditCost: TIER_MULTIPLIER[1], model: "free-ai-route" };
  const proTier = { id: 2, name: "Premium", priceUsd: 0.05, creditCost: TIER_MULTIPLIER[2], model: "premium-ai-route" };
  const maxTier = { id: 3, name: "Premium", priceUsd: 0.25, creditCost: TIER_MULTIPLIER[3], model: "premium-deep-review-route" };

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
      light: lightTier,
      pro: proTier,
      max: maxTier,
      // Backwards-compatible aliases for older clients.
      haiku: lightTier,
      sonnet: proTier,
      opus: maxTier,
    },
  });
}
