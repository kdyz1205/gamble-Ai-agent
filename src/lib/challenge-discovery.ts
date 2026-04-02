import prisma from "@/lib/db";
import { ChallengeStatus } from "@/generated/prisma/enums";

const CHALLENGE_LIST_INCLUDE = {
  creator: {
    select: {
      id: true,
      username: true,
      image: true,
      credits: true,
      latitude: true,
      longitude: true,
    },
  },
  participants: {
    include: { user: { select: { id: true, username: true, image: true } } },
  },
  _count: { select: { evidence: true, judgments: true } },
} as const;

export type DiscoverySource = "snapshot" | "creator_live" | "none";

export type ChallengeDiscoveryMeta = {
  distanceMiles: number | null;
  source: DiscoverySource;
};

/** Haversine distance in miles (WGS84). */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function discoveryMetaForChallenge(
  c: {
    discoveryLat: number | null;
    discoveryLng: number | null;
    creator: { latitude: number | null; longitude: number | null };
  },
  viewerLat: number,
  viewerLng: number,
): ChallengeDiscoveryMeta {
  if (c.discoveryLat != null && c.discoveryLng != null) {
    return {
      distanceMiles: haversineMiles(viewerLat, viewerLng, c.discoveryLat, c.discoveryLng),
      source: "snapshot",
    };
  }
  const clat = c.creator.latitude;
  const clng = c.creator.longitude;
  if (clat != null && clng != null) {
    return {
      distanceMiles: haversineMiles(viewerLat, viewerLng, clat, clng),
      source: "creator_live",
    };
  }
  return { distanceMiles: null, source: "none" };
}

export async function fetchWaitingChallengesWithCreatorGeo(take: number) {
  const rows = await prisma.challenge.findMany({
    where: { status: ChallengeStatus.open, isPublic: true },
    include: CHALLENGE_LIST_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: Math.min(120, take * 4),
  });
  return rows.filter((c) => c.participants.length < c.maxParticipants).slice(0, take);
}

export function sortChallengesByDiscovery<T extends { createdAt: Date }>(
  items: Array<{ row: T; meta: ChallengeDiscoveryMeta }>,
): Array<{ row: T; meta: ChallengeDiscoveryMeta }> {
  return [...items].sort((a, b) => {
    const da = a.meta.distanceMiles;
    const db = b.meta.distanceMiles;
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db == null) return -1;
    if (da == null && db != null) return 1;
    return b.row.createdAt.getTime() - a.row.createdAt.getTime();
  });
}
