import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { evaluateLocationEligibility, validLatLng } from "@/lib/location-eligibility";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const lat = source.lat;
  const lng = source.lng;
  if (!validLatLng(lat, lng)) {
    return Response.json({ error: "lat must be in [-90,90] and lng in [-180,180]" }, { status: 400 });
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      creator: { select: { latitude: true, longitude: true } },
      protocol: true,
    },
  });
  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });

  const result = evaluateLocationEligibility(challenge, { lat, lng: lng as number });
  return Response.json({
    eligible: result.eligible,
    distanceMeters: result.distanceMeters,
    requiredRadiusMeters: result.requiredRadiusMeters,
    reason: result.reason,
  });
}
