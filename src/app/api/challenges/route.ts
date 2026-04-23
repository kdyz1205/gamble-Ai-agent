import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, noCredits } from "@/lib/auth";
import { getCredits, spendCredits, addCredits } from "@/lib/credits";

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

  try {
    const body = await req.json();
    const {
      title,
      description,
      marketType = "challenge",
      proposition,
      type = "General",
      stake = 0,
      stakeToken = "credits",
      deadline,
      eventTime,
      joinWindow,
      proofWindow,
      rules,
      evidenceType = "self_report",
      settlementMode = "mutual_confirmation",
      proofSource,
      arbiter,
      fallbackRule,
      disputeWindow,
      aiReview = true,
      isPublic = true,
      visibility,
    } = body;

    if (!title) return Response.json({ error: "title is required" }, { status: 400 });

    const stakeInt = Math.max(0, Math.floor(stake));

    // ── ATOMIC ESCROW + CREATE ──
    // Previous flow:
    //   spendCredits(stakeInt)  → credits gone
    //   prisma.challenge.create → may throw (constraint, DB blip, etc.)
    //   → user is charged but no Challenge row exists, no refund.
    // We now stake FIRST (atomic spendCredits is already race-safe, see
    // credits.ts updateMany pattern) and immediately refund if the follow-up
    // Challenge.create throws for any reason. That's the standard
    // "compensating action" pattern — two ops can't be a single transaction
    // because spendCredits writes to both User and CreditTx tables and we
    // want its atomicity guarantees preserved.
    if (stakeInt > 0) {
      const balance = await getCredits(user.userId);
      if (balance < stakeInt) return noCredits(stakeInt, balance);

      const result = await spendCredits(user.userId, stakeInt, "stake", `Staked ${stakeInt} credits on "${title.slice(0, 40)}"`, undefined);
      if (!result.success) return noCredits(stakeInt, result.balance);
    }

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
      else deadlineDate.setHours(deadlineDate.getHours() + 48);
    }

    let challenge;
    try {
      challenge = await prisma.challenge.create({
        data: {
          creatorId: user.userId,
          title,
          description,
          marketType,
          proposition,
          type,
          status: "open",
          stake: stakeInt,
          stakeToken,
          deadline: deadlineDate,
          eventTime,
          joinWindow,
          proofWindow,
          rules,
          evidenceType,
          settlementMode,
          proofSource,
          arbiter,
          fallbackRule,
          disputeWindow,
          aiReview,
          isPublic,
          visibility: visibility || (isPublic ? "public" : "private"),
          participants: {
            create: { userId: user.userId, role: "creator", status: "accepted" },
          },
        },
        include: {
          creator: { select: { id: true, username: true, image: true, credits: true } },
          participants: {
            include: { user: { select: { id: true, username: true, image: true } } },
          },
        },
      });
    } catch (createErr) {
      // Compensating refund — never leave a user charged with no Challenge.
      if (stakeInt > 0) {
        try {
          await addCredits(user.userId, stakeInt, "refund", `Refund — challenge creation failed for "${title.slice(0, 40)}"`);
        } catch (refundErr) {
          console.error("CRITICAL: stake charged but refund failed", { userId: user.userId, stakeInt, createErr, refundErr });
        }
      }
      throw createErr;
    }

    await prisma.activityEvent.create({
      data: {
        type: "challenge_created",
        message: `${user.username} created "${title}"${stakeInt > 0 ? ` — ${stakeInt} credits staked` : ""}`,
        userId: user.userId,
        challengeId: challenge.id,
      },
    });

    return Response.json({ challenge }, { status: 201 });
  } catch (err) {
    console.error("Create challenge error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}
