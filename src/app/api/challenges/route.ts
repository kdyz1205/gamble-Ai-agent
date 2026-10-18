import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, noCredits } from "@/lib/auth";
import { createChallengeForUser, ChallengeCreationInputError, ChallengeCreationCreditsError } from "@/lib/challenge-creation";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type   = url.searchParams.get("type");
  const mine   = url.searchParams.get("mine") === "true";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const user = await getAuthUser();

  const where: Record<string, unknown> = { isPublic: true };
  if (status) where.status = status;
  if (type)   where.type = type;
  if (mine && user) {
    delete where.isPublic;
    where.OR = [
      { creatorId: user.userId },
      { participants: { some: { userId: user.userId } } },
    ];
  }

  const [challenges, total] = await Promise.all([
    prisma.challenge.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true, image: true, credits: true } },
        participants: {
          include: { user: { select: { id: true, username: true, image: true } } },
        },
        _count: { select: { evidence: true, judgments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.challenge.count({ where }),
  ]);

  return Response.json({ challenges, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  try {
    const challenge = await createChallengeForUser(user, body);
    return Response.json({ challenge }, { status: 201 });
  } catch (error) {
    if (error instanceof ChallengeCreationInputError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof ChallengeCreationCreditsError) return noCredits(error.needed, error.balance);
    console.error("[create-challenge] transaction failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Challenge could not be created. Please retry." }, { status: 500 });
  }
}
