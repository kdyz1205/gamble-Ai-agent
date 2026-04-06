import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      id: true,
      email: true,
      username: true,
      image: true,
      bio: true,
      credits: true,
      totalCreditsWon: true,
      totalCreditsLost: true,
      totalCreditsBought: true,
      isOnline: true,
      createdAt: true,
      _count: { select: { challengesCreated: true, participations: true } },
    },
  });

  if (!dbUser) return unauthorized();

  return Response.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      username: dbUser.username,
      image: dbUser.image,
      bio: dbUser.bio,
      credits: dbUser.credits,
      stats: {
        won: dbUser.totalCreditsWon,
        lost: dbUser.totalCreditsLost,
        bought: dbUser.totalCreditsBought,
        challenges: dbUser._count.challengesCreated + dbUser._count.participations,
      },
      isOnline: dbUser.isOnline,
      createdAt: dbUser.createdAt,
    },
  });
}
