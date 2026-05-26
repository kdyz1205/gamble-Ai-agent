import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";
import { getDailyAiQuotaStatus } from "@/lib/daily-ai-quota";
import { getAiAccessForUser } from "@/lib/ai-access-policy";

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
    },
  });

  if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 });

  const recentTxs = await prisma.creditTx.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const dailyQuota = await getDailyAiQuotaStatus(user.userId);
  const aiAccess = await getAiAccessForUser(user.userId);

  return Response.json({
    credits: dbUser.credits,
    stats: {
      won: dbUser.totalCreditsWon,
      lost: dbUser.totalCreditsLost,
      bought: dbUser.totalCreditsBought,
    },
    dailyQuota,
    aiAccess,
    transactions: recentTxs,
  });
}
