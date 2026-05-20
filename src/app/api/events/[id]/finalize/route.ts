import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { eventPublicInclude, recomputeEventLeaderboard } from "@/lib/challenge-events";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    select: { id: true, creatorId: true, status: true, title: true },
  });
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  if (event.creatorId !== user.userId) {
    return Response.json({ error: "Only the event creator can finalize this event." }, { status: 403 });
  }
  if (event.status === "finalized") {
    const existing = await prisma.challengeEvent.findUnique({ where: { id }, include: eventPublicInclude });
    return Response.json({ event: existing, entries: await recomputeEventLeaderboard(id), alreadyFinalized: true });
  }
  if (!["open", "submissions_open", "closed"].includes(event.status)) {
    return Response.json({ error: `Event cannot be finalized from status ${event.status}.` }, { status: 409 });
  }

  const entries = await recomputeEventLeaderboard(id);
  if (entries.length === 0) {
    return Response.json({ error: "Cannot finalize an event with no leaderboard submissions." }, { status: 409 });
  }

  const updated = await prisma.challengeEvent.update({
    where: { id },
    data: { status: "finalized" },
    include: eventPublicInclude,
  });

  await prisma.activityEvent.create({
    data: {
      type: "event_finalized",
      message: `${user.username} finalized event "${event.title}"`,
      userId: user.userId,
    },
  }).catch(() => null);

  return Response.json({ event: updated, entries, alreadyFinalized: false });
}
