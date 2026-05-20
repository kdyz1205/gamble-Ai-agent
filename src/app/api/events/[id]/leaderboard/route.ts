import { NextRequest } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

  const entries = await prisma.leaderboardEntry.findMany({
    where: { eventId: id },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
    orderBy: [
      { rank: "asc" },
      { score: "desc" },
      { createdAt: "asc" },
    ],
  });

  return Response.json({ eventId: id, entries });
}
