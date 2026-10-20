import { getAuthUser, unauthorized } from "@/lib/auth";

/** Address text alone does not establish wallet ownership. */
export async function POST() {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  return Response.json({ error: "Wallet linking is currently unavailable. Quests use internal credits.", configured: false }, { status: 503 });
}
