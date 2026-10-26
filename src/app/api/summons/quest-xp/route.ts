import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { readMyQuestXpStatus, QuestXpAccessError } from "@/lib/summons/quest-xp-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Authenticated read-only reward status, not an issuance or review trigger. */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const challengeId = req.nextUrl.searchParams.get("challengeId")?.trim() || "";
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(challengeId)) {
    return Response.json({ error: "Valid Quest ID required" }, { status: 400, headers });
  }
  try {
    const result = await readMyQuestXpStatus({
      challengeId, userId: user.userId,
    });
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof QuestXpAccessError) {
      return Response.json({ error: error.message },
        { status: error.httpStatus, headers });
    }
    console.error("[summons/quest-xp] account read unavailable",
      error instanceof Error ? error.name : "UnknownError");
    return Response.json({
      error: "Verified XP status could not be read. No reward was issued.",
    }, { status: 503, headers });
  }
}
