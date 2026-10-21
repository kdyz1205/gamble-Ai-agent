import { getAuthUser, unauthorized } from "@/lib/auth";

/** Client-supplied amounts and hashes are not evidence of a verified payment. */
export async function POST() {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  return Response.json({
    error: "Credit purchases are currently unavailable. Quests use internal, non-cash credits.",
    configured: false,
  }, { status: 503 });
}
