import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { haversineMiles } from "@/lib/challenge-discovery";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";

function validLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

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

  const protocol = challenge.protocol?.specJson
    ? (() => {
        try {
          return parseProtocolSpecV2(JSON.parse(challenge.protocol.specJson));
        } catch {
          return null;
        }
      })()
    : null;
  const mode = protocol?.locationProtocol.mode ?? challenge.locationMode ?? "none";
  const targetLat = challenge.discoveryLat ?? challenge.creator.latitude;
  const targetLng = challenge.discoveryLng ?? challenge.creator.longitude;
  const requiredRadiusMeters =
    protocol?.locationProtocol.joinRadiusMeters ??
    protocol?.locationProtocol.challengeRadiusMeters ??
    500;

  if (mode === "none") {
    return Response.json({
      eligible: true,
      distanceMeters: null,
      requiredRadiusMeters,
      reason: "Challenge does not require location eligibility.",
    });
  }

  if (targetLat == null || targetLng == null) {
    return Response.json({
      eligible: false,
      distanceMeters: null,
      requiredRadiusMeters,
      reason: "Challenge has no location snapshot.",
    });
  }

  const distanceMeters = Math.round(haversineMiles(lat, lng as number, targetLat, targetLng) * 1609.344);
  const eligible = distanceMeters <= requiredRadiusMeters;
  return Response.json({
    eligible,
    distanceMeters,
    requiredRadiusMeters,
    reason: eligible
      ? "You are within the challenge join radius."
      : "You are outside the challenge join radius.",
  });
}

