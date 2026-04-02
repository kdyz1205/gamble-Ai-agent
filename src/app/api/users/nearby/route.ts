import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import {
  discoveryMetaForChallenge,
  fetchWaitingChallengesWithCreatorGeo,
  sortChallengesByDiscovery,
} from "@/lib/challenge-discovery";

/**
 * GET /api/users/nearby — Nearby users + discoverable challenges (sorted by challenge creator geo when GPS present).
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  const url = new URL(req.url);
  const radiusRaw = parseFloat(url.searchParams.get("radius") || "25");
  const radiusMiles = Number.isFinite(radiusRaw)
    ? Math.min(500, Math.max(1, radiusRaw))
    : 25;

  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : NaN;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : NaN;
  const hasGeo =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  const take = 24;
  const baseRows = await fetchWaitingChallengesWithCreatorGeo(take);

  const attachDiscovery = (rows: typeof baseRows) =>
    hasGeo
      ? sortChallengesByDiscovery(
          rows.map((row) => ({
            row,
            meta: discoveryMetaForChallenge(row, lat, lng),
          })),
        ).map(({ row, meta }) => ({ ...row, discovery: meta }))
      : rows.map((row) => ({
          ...row,
          discovery: { distanceMiles: null as number | null, source: "none" as const },
        }));

  if (!user) {
    return Response.json({
      users: [],
      challenges: attachDiscovery(baseRows),
      mode: "global_fallback",
      reason: "anonymous",
    });
  }

  if (!hasGeo) {
    return Response.json({
      users: [],
      challenges: attachDiscovery(baseRows),
      mode: "global_no_location",
      reason: "no_coordinates",
    });
  }

  await prisma.user.update({
    where: { id: user.userId },
    data: { latitude: lat, longitude: lng, locationUpdatedAt: new Date() },
  });

  const latRange = radiusMiles / 69;
  const lngCos = Math.cos((lat * Math.PI) / 180) || 1;
  const lngRange = radiusMiles / (69 * lngCos);

  const nearbyUserRows = await prisma.user.findMany({
    where: {
      id: { not: user.userId },
      latitude: { not: null, gte: lat - latRange, lte: lat + latRange },
      longitude: { not: null, gte: lng - lngRange, lte: lng + lngRange },
    },
    select: {
      id: true,
      username: true,
      image: true,
      latitude: true,
      longitude: true,
      isOnline: true,
      lastSeenAt: true,
      _count: { select: { challengesCreated: true, participations: true } },
    },
    take: 20,
  });

  const withDistance = nearbyUserRows.map((u) => {
    const dLat = ((u.latitude! - lat) * Math.PI) / 180;
    const dLng = ((u.longitude! - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((u.latitude! * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMiles = 3959 * c;
    return {
      id: u.id,
      username: u.username,
      image: u.image,
      distance: Math.round(distanceMiles * 10) / 10,
      isOnline: u.isOnline,
      lastSeenAt: u.lastSeenAt,
      challengeCount: u._count.challengesCreated + u._count.participations,
    };
  });

  withDistance.sort((a, b) => a.distance - b.distance);

  const challenges = attachDiscovery(baseRows);
  const nearFirstIds = new Set(withDistance.map((u) => u.id));
  const reordered = [...challenges].sort((a, b) => {
    const aNear = nearFirstIds.has(a.creatorId) ? 0 : 1;
    const bNear = nearFirstIds.has(b.creatorId) ? 0 : 1;
    if (aNear !== bNear) return aNear - bNear;
    const da = a.discovery?.distanceMiles;
    const db = b.discovery?.distanceMiles;
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db == null) return -1;
    if (da == null && db != null) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const mode =
    reordered.some((c) => nearFirstIds.has(c.creatorId))
      ? "nearby_challenges"
      : "global_with_nearby_users";

  return Response.json({
    users: withDistance,
    challenges: reordered.slice(0, take),
    mode,
    reason: "geo",
  });
}
