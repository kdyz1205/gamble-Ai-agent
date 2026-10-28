import { publicFeedWhere } from "@/lib/public-feed-policy";
import { pageInteger } from "@/lib/request-input";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/feed — Get live activity feed
 * Query params: limit, offset, type
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = pageInteger(url.searchParams.get("limit"), 20, 1, 50, true);
  const offset = pageInteger(url.searchParams.get("offset"), 0, 0, 2_147_483_647);
  if (limit === null || offset === null) return Response.json({ error: "Invalid pagination" }, { status: 400 });
  const type   = url.searchParams.get("type"); // filter by event type

  const where = publicFeedWhere(type);

  const [events, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, username: true, image: true } },
        challenge: { select: { id: true, title: true, type: true, status: true, stake: true } },
      },
    }),
    prisma.activityEvent.count({ where }),
  ]);

  return Response.json({ events, total, limit, offset }, { headers: { "Cache-Control": "private, no-store" } });
}
