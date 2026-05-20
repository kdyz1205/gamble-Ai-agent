import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { haversineMiles } from "@/lib/challenge-discovery";

function readNumber(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function validLatLng(lat: number | null, lng: number | null) {
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function bucketMeters(meters: number) {
  if (meters <= 100) return 100;
  if (meters <= 250) return 250;
  if (meters <= 500) return 500;
  if (meters <= 1000) return 1000;
  if (meters <= 2000) return 2000;
  return Math.ceil(meters / 1000) * 1000;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const lat = readNumber(url, "lat");
  const lng = readNumber(url, "lng");
  const radiusMiles = Math.min(Math.max(readNumber(url, "radiusMiles") ?? 5, 0.1), 25);
  if (!validLatLng(lat, lng)) {
    return Response.json({ error: "lat must be in [-90,90] and lng in [-180,180]" }, { status: 400 });
  }

  const latitude = lat as number;
  const longitude = lng as number;
  const latRange = radiusMiles / 69;
  const lngRange = radiusMiles / (69 * Math.cos((latitude * Math.PI) / 180) || 69);
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      id: { not: user.userId },
      latitude: { not: null, gte: latitude - latRange, lte: latitude + latRange },
      longitude: { not: null, gte: longitude - lngRange, lte: longitude + lngRange },
      lastSeenAt: { gte: cutoff },
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
    take: 50,
  });

  const nearby = users
    .map((item) => {
      const distanceMiles = haversineMiles(latitude, longitude, item.latitude!, item.longitude!);
      const distanceMeters = Math.round(distanceMiles * 1609.344);
      return {
        id: item.id,
        username: item.username,
        image: item.image,
        approximateDistanceMeters: bucketMeters(distanceMeters),
        distanceLabel: distanceMeters < 1000 ? `${bucketMeters(distanceMeters)}m` : `${Math.round(bucketMeters(distanceMeters) / 1000)}km`,
        isOnline: item.isOnline,
        lastSeenAt: item.lastSeenAt,
        challengeCount: item._count.challengesCreated + item._count.participations,
      };
    })
    .filter((item) => item.approximateDistanceMeters <= radiusMiles * 1609.344)
    .sort((a, b) => a.approximateDistanceMeters - b.approximateDistanceMeters)
    .slice(0, 24);

  return Response.json({
    users: nearby,
    privacy: "approximate",
    radiusMiles,
  });
}

