import { NextRequest } from "next/server";
import { getAuthUser, unauthorized, noCredits } from "@/lib/auth";
import { acceptChallenge } from "@/lib/challenge-acceptance";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await acceptChallenge(id, user.userId);
    if (!result.ok) {
      if (result.status === 402) return noCredits(result.needed ?? 0, result.balance ?? 0);
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ challenge: result.challenge, reused: result.reused });
  } catch (error) {
    console.error("[challenge/accept] atomic acceptance failed", { challengeId: id, error });
    return Response.json({ error: "Could not accept quest. No credits or seat changes were committed." }, { status: 500 });
  }
}
