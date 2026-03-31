import { NextRequest } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/feed — Get live activity feed
 * Query params: limit, offset, type
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const type   = url.searchParams.get("type"); // filter by event type

  const where: Record<string, unknown> = {};
  if (type) where.type = type;

  const [events, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        challenge: { select: { id: true, title: true, type: true, status: true, stake: true } },
      },
    }),
    prisma.activityEvent.count({ where }),
  ]);

  return Response.json({ events, total, limit, offset });
}
