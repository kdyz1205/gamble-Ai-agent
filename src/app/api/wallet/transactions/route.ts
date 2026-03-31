import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

/**
 * GET /api/wallet/transactions — Get transaction history
 */
export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) return unauthorized();

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        challenge: { select: { id: true, title: true, type: true } },
      },
    }),
    prisma.transaction.count({ where: { userId: payload.userId } }),
  ]);

  return Response.json({ transactions, total, limit, offset });
}
