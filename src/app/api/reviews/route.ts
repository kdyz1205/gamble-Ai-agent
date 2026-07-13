import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { isReviewModerator, listReviewQueue } from "@/lib/verdict-review";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (!(await isReviewModerator(user.userId))) {
    return Response.json({ error: "Reviewer permission required" }, { status: 403 });
  }
  const requested = req.nextUrl.searchParams.get("status") ?? "pending";
  const status = ["pending", "processing", "resolved", "expired", "all"].includes(requested) ? requested : "pending";
  const reviews = await listReviewQueue(status);
  return Response.json({ reviews });
}
