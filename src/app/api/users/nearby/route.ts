import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

/**
 * GET /api/users/nearby — Get nearby users
 * Query params: lat, lng, radius (miles, default 10)
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") || "0");
  const lng = parseFloat(url.searchParams.get("lng") || "0");
  const radiusMiles = parseFloat(url.searchParams.get("radius") || "10");

  // Update current user's location
  if (lat !== 0 && lng !== 0) {
    await prisma.user.update({
      where: { id: user.userId },
      data: { latitude: lat, longitude: lng, locationUpdatedAt: new Date() },
    });
  }

  // SQLite doesn't have geo functions, so we do a rough bounding box then filter
  // 1 degree latitude ≈ 69 miles
  const latRange = radiusMiles / 69;
  const lngRange = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180) || 69);

  const users = await prisma.user.findMany({
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

  // Calculate distance and sort
  const withDistance = users.map((u: typeof users[number]) => {
    const dLat = ((u.latitude! - lat) * Math.PI) / 180;
    const dLng = ((u.longitude! - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((u.latitude! * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMiles = 3959 * c; // Earth radius in miles

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

  withDistance.sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance);

  return Response.json({ users: withDistance });
}
