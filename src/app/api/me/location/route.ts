import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

/**
 * POST /api/me/location — update the authenticated user's lat/lng.
 *
 * Body: { lat: number, lng: number }
 *
 * This was previously a side-effect inside GET /api/challenges/discover.
 * Splitting it out keeps the discover endpoint read-only and makes location
 * updates an explicit, auditable mutation.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lat, lng } = body as { lat?: unknown; lng?: unknown };

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return Response.json(
      { error: "lat must be in [-90,90] and lng in [-180,180]" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.userId },
    data: { latitude: lat, longitude: lng, locationUpdatedAt: new Date() },
  });

  return Response.json({ success: true });
}
