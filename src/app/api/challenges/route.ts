import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

/**
 * GET /api/challenges — Browse/list challenges
 * Query params: status, type, limit, offset, mine
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");       // open, live, settled, etc.
  const type   = url.searchParams.get("type");          // Fitness, Coding, etc.
  const mine   = url.searchParams.get("mine") === "true";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const payload = getUserFromRequest(req);

  const where: Record<string, unknown> = { isPublic: true };
  if (status) where.status = status;
  if (type)   where.type = type;
  if (mine && payload) {
    delete where.isPublic;
    where.OR = [
      { creatorId: payload.userId },
      { participants: { some: { userId: payload.userId } } },
    ];
  }

  const [challenges, total] = await Promise.all([
    prisma.challenge.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
        participants: {
          include: { user: { select: { id: true, username: true, avatar: true } } },
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

/**
 * POST /api/challenges — Create a new challenge
 */
export async function POST(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) return unauthorized();

  try {
    const body = await req.json();
    const {
      title,
      description,
      type = "General",
      stake = 0,
      currency = "none",
      deadline,
      rules,
      evidenceType = "self_report",
      aiReview = true,
      isPublic = true,
    } = body;

    if (!title) {
      return Response.json({ error: "title is required" }, { status: 400 });
    }

    // If staking money, check wallet balance & lock funds
    if (stake > 0 && currency === "USD") {
      const wallet = await prisma.wallet.findUnique({ where: { userId: payload.userId } });
      if (!wallet || wallet.balance < stake) {
        return Response.json({ error: "Insufficient balance for stake" }, { status: 400 });
      }

      // Lock funds into escrow
      await prisma.wallet.update({
        where: { userId: payload.userId },
        data: {
          balance: { decrement: stake },
          escrow: { increment: stake },
        },
      });

      // Record transaction
      const updatedWallet = await prisma.wallet.findUnique({ where: { userId: payload.userId } });
      await prisma.transaction.create({
        data: {
          userId: payload.userId,
          type: "stake",
          amount: -stake,
          balanceAfter: updatedWallet!.balance,
          description: `Staked $${stake} on: ${title}`,
        },
      });
    }

    // Parse deadline string into Date
    let deadlineDate: Date | null = null;
    if (deadline) {
      const hoursMatch = String(deadline).match(/(\d+)\s*hour/i);
      const daysMatch  = String(deadline).match(/(\d+)\s*day/i);
      const weeksMatch = String(deadline).match(/(\d+)\s*week/i);
      const minsMatch  = String(deadline).match(/(\d+)\s*min/i);

      deadlineDate = new Date();
      if (hoursMatch) deadlineDate.setHours(deadlineDate.getHours() + parseInt(hoursMatch[1]));
      else if (daysMatch) deadlineDate.setDate(deadlineDate.getDate() + parseInt(daysMatch[1]));
      else if (weeksMatch) deadlineDate.setDate(deadlineDate.getDate() + parseInt(weeksMatch[1]) * 7);
      else if (minsMatch) deadlineDate.setMinutes(deadlineDate.getMinutes() + parseInt(minsMatch[1]));
      else deadlineDate.setHours(deadlineDate.getHours() + 48); // default 48h
    }

    const challenge = await prisma.challenge.create({
      data: {
        creatorId: payload.userId,
        title,
        description,
        type,
        status: "open",
        stake,
        currency,
        deadline: deadlineDate,
        rules,
        evidenceType,
        aiReview,
        isPublic,
        participants: {
          create: {
            userId: payload.userId,
            role: "creator",
            status: "accepted",
          },
        },
      },
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
        participants: {
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
      },
    });

    // Activity event
    await prisma.activityEvent.create({
      data: {
        type: "challenge_created",
        message: `${payload.username} created "${title}"${stake > 0 ? ` — $${stake} stake` : ""}`,
        userId: payload.userId,
        challengeId: challenge.id,
      },
    });

    return Response.json({ challenge }, { status: 201 });
  } catch (err) {
    console.error("Create challenge error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
