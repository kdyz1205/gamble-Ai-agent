import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

type PingMode = "browsing" | "live_challenge";

function validMode(value: unknown): value is PingMode {
  return value === "browsing" || value === "live_challenge";
}

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

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const lat = source.lat;
  const lng = source.lng;
  const accuracy = typeof source.accuracy === "number" && Number.isFinite(source.accuracy)
    ? Math.max(0, Math.round(source.accuracy))
    : null;
  const mode = validMode(source.mode) ? source.mode : "browsing";

  if (!validLatLng(lat, lng)) {
    return Response.json({ error: "lat must be in [-90,90] and lng in [-180,180]" }, { status: 400 });
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.userId },
    data: {
      latitude: lat,
      longitude: lng as number,
      locationUpdatedAt: now,
      isOnline: true,
      lastSeenAt: now,
    },
  });

  return Response.json({
    ok: true,
    mode,
    accuracy,
    locationPrivacy: mode === "live_challenge" ? "precise_live_only" : "approximate",
    updatedAt: now.toISOString(),
  });
}

