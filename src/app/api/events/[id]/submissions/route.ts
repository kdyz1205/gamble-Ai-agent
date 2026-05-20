import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const source = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const score = Number(source.score);
  if (!Number.isFinite(score)) {
    return Response.json({ error: "A finite numeric score is required." }, { status: 400 });
  }

  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    include: {
      entries: { where: { userId: user.userId }, take: 1 },
    },
  });
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  if (!["open", "submissions_open"].includes(event.status)) {
    return Response.json({ error: `Event is not accepting submissions (status=${event.status})` }, { status: 409 });
  }
  if (event.entries.length === 0) {
    return Response.json({ error: "Join the event before submitting." }, { status: 403 });
  }

  const evidenceId = optionalString(source.evidenceId);
  const validationStatus = optionalString(source.validationStatus) ?? "submitted";
  const entry = await prisma.leaderboardEntry.upsert({
    where: { eventId_userId: { eventId: id, userId: user.userId } },
    create: {
      eventId: id,
      userId: user.userId,
      score,
      rank: null,
      evidenceId,
      validationStatus,
    },
    update: {
      score,
      rank: null,
      evidenceId,
      validationStatus,
      createdAt: new Date(),
    },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
  });

  await prisma.activityEvent.create({
    data: {
      type: "event_submission",
      message: `${user.username} submitted a score for "${event.title}"`,
      userId: user.userId,
    },
  }).catch(() => null);

  return Response.json({ eventId: id, entry }, { status: 201 });
}
