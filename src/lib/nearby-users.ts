import prisma from "@/lib/db";
import type { NearbyQuery } from "./request-input";

export type NearbyUser = {
  id: string; username: string; image: string | null; distance: number;
  isOnline: boolean; lastSeenAt: Date | null; challengeCount: number;
};

/** Read-only exact distance ordering. Radius filtering precedes LIMIT, including
 * the date line and poles; no user coordinates are returned or written. */
export async function findNearbyUsers(userId: string, query: NearbyQuery): Promise<NearbyUser[]> {
  const { latitude, longitude, radiusMiles } = query;
  return prisma.$queryRaw<NearbyUser[]>`
    SELECT ranked.id, ranked.username, ranked.image,
      ROUND(ranked.distance::numeric, 1)::double precision AS distance,
      ranked."isOnline", ranked."lastSeenAt",
      ((SELECT COUNT(*) FROM "Challenge" c WHERE c."creatorId" = ranked.id)
        + (SELECT COUNT(*) FROM "Participant" p WHERE p."userId" = ranked.id))::integer
        AS "challengeCount"
    FROM (
      SELECT u.id, u.username, u.image, u."isOnline", u."lastSeenAt",
        3959.0 * 2.0 * ASIN(SQRT(LEAST(1.0, GREATEST(0.0,
          POWER(SIN(RADIANS(u.latitude - ${latitude}) / 2.0), 2.0)
          + COS(RADIANS(${latitude}::double precision)) * COS(RADIANS(u.latitude))
          * POWER(SIN(RADIANS(u.longitude - ${longitude}) / 2.0), 2.0)
        )))) AS distance
      FROM "User" u
      WHERE u.id <> ${userId}
        AND u.latitude BETWEEN -90.0 AND 90.0
        AND u.longitude BETWEEN -180.0 AND 180.0
    ) ranked
    WHERE ranked.distance <= ${radiusMiles}
    ORDER BY ranked.distance ASC, ranked.id ASC
    LIMIT 20
  `;
}
