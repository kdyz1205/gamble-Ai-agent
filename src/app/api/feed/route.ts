import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { blockedPeerIds, blockedFeedExclusions } from "@/lib/user-blocks";
import type { Prisma } from "@/generated/prisma/client";

/**
 * GET /api/feed — Get live activity feed
 * Query params: limit, offset, type
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit  = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "20") || 20, 1), 50);
  const offset = Math.max(Number.parseInt(url.searchParams.get("offset") || "0") || 0, 0);
  const type   = url.searchParams.get("type"); // filter by event type

  const viewer = await getAuthUser();
  const peers = viewer ? await blockedPeerIds(viewer.userId) : [];
  const where: Prisma.ActivityEventWhereInput = {
    OR: [{ challengeId: null }, { challenge: { is: { isPublic: true, visibility: "public" } } }],
    ...(type ? { type } : {}),
    ...blockedFeedExclusions(peers),
  };

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
