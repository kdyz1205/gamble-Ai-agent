import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { recomputeEventLeaderboard } from "@/lib/challenge-events";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    select: {
      id: true,
      creatorId: true,
      entries: { where: { userId: user.userId }, select: { id: true }, take: 1 },
    },
  });
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  if (event.creatorId !== user.userId && event.entries.length === 0) {
    return Response.json({ error: "Only the creator or joined participants can recompute this leaderboard." }, { status: 403 });
  }

  const entries = await recomputeEventLeaderboard(id);
  return Response.json({ eventId: id, entries });
}
