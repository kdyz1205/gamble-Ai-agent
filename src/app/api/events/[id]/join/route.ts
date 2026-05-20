import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { eventPublicInclude, issueEventTicketCode } from "@/lib/challenge-events";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ChallengeEvent" WHERE "id" = ${id} FOR UPDATE
      `;
      if (locked.length === 0) throw new Error("NOT_FOUND");

      const event = await tx.challengeEvent.findUnique({
        where: { id },
        select: { id: true, status: true, maxParticipants: true, title: true },
      });
      if (!event) throw new Error("NOT_FOUND");
      if (event.status !== "open") throw new Error("CLOSED");

      const existing = await tx.eventEntry.findUnique({
        where: { eventId_userId: { eventId: id, userId: user.userId } },
      });
      if (existing) return { entry: existing, alreadyJoined: true };

      const count = await tx.eventEntry.count({ where: { eventId: id } });
      if (count >= event.maxParticipants) throw new Error("FULL");

      const entry = await tx.eventEntry.create({
        data: {
          eventId: id,
          userId: user.userId,
          ticketCode: issueEventTicketCode(),
          status: "joined",
        },
      });
      return { entry, alreadyJoined: false };
    });

    const event = await prisma.challengeEvent.findUnique({
      where: { id },
      include: eventPublicInclude,
    });
    if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

    await prisma.activityEvent.create({
      data: {
        type: "event_joined",
        message: `${user.username} joined event "${event.title}"`,
        userId: user.userId,
      },
    }).catch(() => null);

    return Response.json({ event, entry: result.entry, alreadyJoined: result.alreadyJoined });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return Response.json({ error: "Event not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "CLOSED") {
      return Response.json({ error: "Event is not open for joining" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "FULL") {
      return Response.json({ error: "Event is full" }, { status: 409 });
    }
    console.error("Join event error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
