import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      wallet: true,
      participations: { include: { challenge: true }, take: 10, orderBy: { joinedAt: "desc" } },
    },
  });

  if (!user) return unauthorized();

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      isOnline: user.isOnline,
      wallet: user.wallet,
      activeChallenges: user.participations.filter(p => ["pending", "accepted"].includes(p.status)).length,
      createdAt: user.createdAt,
    },
  });
}
