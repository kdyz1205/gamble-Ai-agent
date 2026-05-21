import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { OPEN_FOR_OPPONENT_STATUSES } from "@/lib/challenge-state-machine";
import {
  discoveryMetaForChallenge,
  sortChallengesByDiscovery,
} from "@/lib/challenge-discovery";

const CREATOR_SELECT = {
  id: true,
  username: true,
  image: true,
  latitude: true,
  longitude: true,
} as const;

function readNumber(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function hasLatLng(lat: number | null, lng: number | null) {
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function metersFromMiles(miles: number | null) {
  return miles === null ? null : Math.round(miles * 1609.344);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const now = new Date();
  const lat = readNumber(url, "lat");
  const lng = readNumber(url, "lng");
  const radiusMiles = Math.min(Math.max(readNumber(url, "radiusMiles") ?? 10, 0.1), 50);
  const limit = Math.min(Math.max(Math.floor(readNumber(url, "limit") ?? 30), 1), 60);
  const hasGeo = hasLatLng(lat, lng);
  const viewerLat = hasGeo ? lat as number : null;
  const viewerLng = hasGeo ? lng as number : null;

  const rows = await prisma.challenge.findMany({
    where: {
      status: { in: [...OPEN_FOR_OPPONENT_STATUSES] },
      isPublic: true,
      // Radar is for playable challenges. Expired / no-deadline smoke rows
      // stay available to their owners through the manager, but must not be
      // shown to strangers as joinable nearby challenges.
      deadline: { gt: now },
    },
    include: {
      creator: { select: CREATOR_SELECT },
      participants: {
        include: { user: { select: { id: true, username: true, image: true } } },
      },
      _count: { select: { evidence: true, judgments: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(160, limit * 5),
  });

  const available = rows.filter((challenge) => challenge.participants.length < challenge.maxParticipants);
  const decorated = available.map((row) => {
    const meta = viewerLat !== null && viewerLng !== null
      ? discoveryMetaForChallenge(
          {
            discoveryLat: row.discoveryLat,
            discoveryLng: row.discoveryLng,
            creator: {
              latitude: row.creator.latitude,
              longitude: row.creator.longitude,
            },
          },
          viewerLat,
          viewerLng,
        )
      : { distanceMiles: null, source: "none" as const };
    return { row, meta };
  });

  const filtered = hasGeo
    ? decorated.filter(({ meta }) => meta.distanceMiles === null || meta.distanceMiles <= radiusMiles)
    : decorated;
  const sorted = sortChallengesByDiscovery(filtered).slice(0, limit);

  const challenges = sorted.map(({ row, meta }) => {
    const { latitude: _lat, longitude: _lng, ...safeCreator } = row.creator;
    void _lat; void _lng;
    const {
      discoveryLat: _discoveryLat,
      discoveryLng: _discoveryLng,
      ...safeChallenge
    } = row;
    void _discoveryLat; void _discoveryLng;
    const approximateDistanceMeters = metersFromMiles(meta.distanceMiles);
    const angle = viewerLat !== null && viewerLng !== null && row.discoveryLat != null && row.discoveryLng != null
      ? Math.atan2(row.discoveryLng - viewerLng, row.discoveryLat - viewerLat)
      : null;
    return {
      ...safeChallenge,
      creator: safeCreator,
      discovery: meta,
      radar: {
        approximateDistanceMeters,
        ring: approximateDistanceMeters == null
          ? "global"
          : approximateDistanceMeters <= 500
            ? "walk"
            : approximateDistanceMeters <= 2000
              ? "near"
              : "city",
        angle,
        locationPrivacy: "approximate",
      },
    };
  });

  return Response.json({
    challenges,
    radar: {
      mode: hasGeo ? "nearby" : "global",
      radiusMiles,
      limit,
      locationPrivacy: "approximate",
    },
    levelMessage: hasGeo
      ? "Nearby open challenges are sorted by approximate distance."
      : "Location is not enabled; showing open public challenges globally.",
  });
}
