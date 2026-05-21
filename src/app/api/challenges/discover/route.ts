import { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import {
  discoveryMetaForChallenge,
  sortChallengesByDiscovery,
} from "@/lib/challenge-discovery";
import { OPEN_FOR_OPPONENT_STATUSES } from "@/lib/challenge-state-machine";

/**
 * GET /api/challenges/discover — 3-level waterfall discovery.
 *
 * Level 1 (precise): lat/lng provided → geo-sorted open challenges.
 * Level 2 (global):  no geo or zero precise results → open challenges sorted by stake desc, createdAt desc.
 *
 * Creator select is PII-safe: id, username, image only.
 *
 * Query: lat, lng, radiusMiles (unused for filtering), limit
 * Anonymous: allowed.
 */

const CREATOR_SELECT = { id: true, username: true, image: true } as const;

const CHALLENGE_SELECT = {
  creator: { select: CREATOR_SELECT },
  participants: {
    include: { user: { select: { id: true, username: true, image: true } } },
  },
  _count: { select: { evidence: true, judgments: true } },
} as const;

function discoverableWhere(now: Date): Prisma.ChallengeWhereInput {
  return {
    status: { in: OPEN_FOR_OPPONENT_STATUSES.map(String) },
    isPublic: true,
    // Public nearby discovery is for currently playable challenges only.
    // Old smoke/E2E rows and no-deadline drafts should remain visible to their
    // creators in "My challenges", but they must not block the public join strip.
    deadline: { gt: now },
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const now = new Date();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "24", 10), 50);
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : NaN;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : NaN;
  const hasGeo =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  // ── Level 1: precise geo sort ─────────────────────────────────────────────
  if (hasGeo) {
    // Fetch a larger pool so we can sort by distance then trim.
    const pool = await prisma.challenge.findMany({
      where: discoverableWhere(now),
      include: {
        ...CHALLENGE_SELECT,
        // Include creator geo fields for distance calc only — stripped below.
        creator: {
          select: {
            ...CREATOR_SELECT,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(120, limit * 4),
    });

    const available = pool.filter((c) => c.participants.length < c.maxParticipants);

    const decorated = available.map((row) => ({
      row,
      meta: discoveryMetaForChallenge(
        {
          discoveryLat: (row as { discoveryLat?: number | null }).discoveryLat ?? null,
          discoveryLng: (row as { discoveryLng?: number | null }).discoveryLng ?? null,
          creator: { latitude: row.creator.latitude, longitude: row.creator.longitude },
        },
        lat,
        lng,
      ),
    }));

    const sorted = sortChallengesByDiscovery(decorated).slice(0, limit);

    if (sorted.length > 0) {
      const challenges = sorted.map(({ row, meta }) => {
        // Strip geo PII from creator before returning.
        const { latitude: _lat, longitude: _lng, ...safeCreator } = row.creator;
        void _lat; void _lng;
        return { ...row, creator: safeCreator, discovery: meta };
      });

      return Response.json({
        challenges,
        discoveryLevel: "precise",
        levelMessage: "Challenges sorted by distance from your location.",
      });
    }
  }

  // ── Level 2: global fallback ──────────────────────────────────────────────
  const globalRows = await prisma.challenge.findMany({
    where: discoverableWhere(now),
    include: CHALLENGE_SELECT,
    orderBy: [{ stake: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return Response.json({
    challenges: globalRows,
    discoveryLevel: "global",
    levelMessage: hasGeo
      ? "No nearby challenges found — showing top open challenges globally."
      : "Showing top open challenges globally.",
  });
}
