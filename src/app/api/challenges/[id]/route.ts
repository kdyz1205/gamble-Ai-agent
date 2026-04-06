import { NextRequest } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/challenges/[id] — Get a single challenge with full details
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, image: true } },
      participants: {
        include: { user: { select: { id: true, username: true, image: true } } },
      },
      evidence: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "desc" },
      },
      judgments: {
        include: {
          winner: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { evidence: true, participants: true } },
    },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  return Response.json({ challenge });
}
