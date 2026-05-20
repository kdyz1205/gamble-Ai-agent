import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { eventPublicInclude } from "@/lib/challenge-events";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    include: eventPublicInclude,
  });

  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  return Response.json({ event });
}
