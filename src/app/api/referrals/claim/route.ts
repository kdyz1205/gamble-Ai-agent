import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

const REFERRAL_BONUS = 10;
const NEW_USER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function cleanRef(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^@+/, "").slice(0, 80);
}

function cleanCampaign(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const ref = cleanRef(body.ref);
  if (!ref) {
    return Response.json({ claimed: false, reason: "missing_ref" });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { id: true, username: true, credits: true, createdAt: true },
  });
  if (!currentUser) return unauthorized();

  const inviter = await prisma.user.findFirst({
    where: {
      OR: [
        { id: ref },
        { username: ref },
      ],
    },
    select: { id: true, username: true, credits: true },
  });

  if (!inviter) {
    return Response.json({ claimed: false, reason: "referrer_not_found" });
  }
  if (inviter.id === currentUser.id) {
    return Response.json({ claimed: false, reason: "self_referral_blocked" });
  }

  const ageMs = Date.now() - currentUser.createdAt.getTime();
  if (ageMs > NEW_USER_WINDOW_MS) {
    return Response.json({ claimed: false, reason: "account_not_new" });
  }

  const existingClaim = await prisma.creditTx.findFirst({
    where: {
      userId: currentUser.id,
      type: "bonus",
      description: { startsWith: "Referral invitee bonus:" },
    },
    select: { id: true },
  });
  if (existingClaim) {
    return Response.json({ claimed: false, reason: "already_claimed" });
  }

  const campaign = cleanCampaign(body.campaign);
  const source = cleanCampaign(body.source);
  const landingUrl = cleanCampaign(body.landingUrl);

  const result = await prisma.$transaction(async (tx) => {
    const invitee = await tx.user.update({
      where: { id: currentUser.id },
      data: { credits: { increment: REFERRAL_BONUS } },
      select: { credits: true },
    });
    const referrer = await tx.user.update({
      where: { id: inviter.id },
      data: { credits: { increment: REFERRAL_BONUS } },
      select: { credits: true },
    });

    const metadata = JSON.stringify({
      ref,
      referrerId: inviter.id,
      inviteeId: currentUser.id,
      campaign,
      source,
      landingUrl,
      bonus: REFERRAL_BONUS,
    });

    await tx.creditTx.createMany({
      data: [
        {
          userId: currentUser.id,
          type: "bonus",
          amount: REFERRAL_BONUS,
          balanceAfter: invitee.credits,
          description: `Referral invitee bonus: invited by ${inviter.username}`,
        },
        {
          userId: inviter.id,
          type: "bonus",
          amount: REFERRAL_BONUS,
          balanceAfter: referrer.credits,
          description: `Referral referrer bonus: ${currentUser.username} joined`,
        },
      ],
    });

    await tx.activityEvent.create({
      data: {
        type: "referral_claimed",
        message: `${currentUser.username} joined from ${inviter.username}'s invite`,
        userId: currentUser.id,
        metadata,
      },
    });

    return {
      inviteeCredits: invitee.credits,
      referrerCredits: referrer.credits,
    };
  });

  return Response.json({
    claimed: true,
    bonus: REFERRAL_BONUS,
    referrer: { id: inviter.id, username: inviter.username },
    credits: result.inviteeCredits,
  });
}
