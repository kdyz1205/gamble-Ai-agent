import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { nearbyQuery } from "@/lib/request-input";
import { findNearbyUsers } from "@/lib/nearby-users";

/** A read-only lookup. Saving location is exclusively POST /api/me/location. */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const query = nearbyQuery(new URL(req.url).searchParams);
  if (!query) return Response.json({ error: "Valid lat, lng and a positive radius are required" }, { status: 400 });
  const users = await findNearbyUsers(user.userId, query);
  return Response.json({ users }, { headers: { "Cache-Control": "private, no-store" } });
}
