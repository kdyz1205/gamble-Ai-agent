import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { cancelChallengeAtomic } from "@/lib/challenge-cancellation";
import { loadChallengeDetail } from "@/lib/quest-detail-handler";

/**
 * GET /api/challenges/[id] — Get a single challenge with full details
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return loadChallengeDetail(id, await getAuthUser());

}

/** DELETE retains the quest as cancelled; legacy success fields remain available. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return unauthorized();
  try {
    const result = await cancelChallengeAtomic(id, user.userId);
    return Response.json(result, { status: result.ok ? 200 : result.status });
  } catch {
    return Response.json({ error: "Quest cancellation could not complete. Please retry." }, { status: 500 });
  }
}
