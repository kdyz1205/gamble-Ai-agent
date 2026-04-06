import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const activeStakeStatuses = ["open", "live", "judging", "pending_settlement"] as const;

  const [dbUser, recentTxs, lockedAgg, aiSpendAgg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        credits: true,
        totalCreditsWon: true,
        totalCreditsLost: true,
        totalCreditsBought: true,
      },
    }),

    prisma.creditTx.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),

    // Sum of stake from challenges where user is a participant and challenge is active
    prisma.challenge.aggregate({
      _sum: { stake: true },
      where: {
        status: { in: [...activeStakeStatuses] },
        participants: { some: { userId: user.userId } },
      },
    }),

    // Sum of abs(amount) for AI spend (ai_parse, ai_judge) — amounts are negative, so negate
    prisma.creditTx.aggregate({
      _sum: { amount: true },
      where: {
        userId: user.userId,
        type: { startsWith: "ai_" },
      },
    }),
  ]);

  if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 });

  const lockedInStake = lockedAgg._sum.stake ?? 0;
  // AI spend amounts are stored as negative; take absolute value
  const aiSpend = Math.abs(aiSpendAgg._sum.amount ?? 0);

  return Response.json({
    credits: dbUser.credits,
    available: dbUser.credits,
    lockedInStake,
    aiSpend,
    stats: {
      won: dbUser.totalCreditsWon,
      lost: dbUser.totalCreditsLost,
      bought: dbUser.totalCreditsBought,
    },
    transactions: recentTxs,
  });
}
