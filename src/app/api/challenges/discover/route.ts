import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import {
  discoveryMetaForChallenge,
  fetchWaitingChallengesWithCreatorGeo,
  sortChallengesByDiscovery,
} from "@/lib/challenge-discovery";

/**
 * GET /api/challenges/discover — Challenge-level discovery by creator geo (snapshot first, else live profile).
 *
 * Query: lat, lng, radiusMiles (unused for filtering today — global open challenges, sorted by distance), limit
 * Anonymous: allowed (no user location update).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
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

  const user = await getAuthUser();
  if (user && hasGeo) {
    await prisma.user.update({
      where: { id: user.userId },
      data: { latitude: lat, longitude: lng, locationUpdatedAt: new Date() },
    });
  }

  const rows = await fetchWaitingChallengesWithCreatorGeo(limit);

  if (!hasGeo) {
    return Response.json({
      challenges: rows,
      mode: "global_newest",
      reason: user ? "no_coordinates" : "anonymous_no_geo",
    });
  }

  const decorated = rows.map((row) => ({
    row,
    meta: discoveryMetaForChallenge(row, lat, lng),
  }));
  const sorted = sortChallengesByDiscovery(decorated);
  const challenges = sorted.map(({ row, meta }) => ({
    ...row,
    discovery: meta,
  }));

  return Response.json({
    challenges,
    mode: "by_creator_location",
    reason: "geo",
  });
}
