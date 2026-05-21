import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

function parseMetadata(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  const [events, bonusTxs] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { type: "referral_claimed" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { metadata: true, createdAt: true },
    }),
    prisma.creditTx.findMany({
      where: {
        userId: user.userId,
        type: "bonus",
        description: { startsWith: "Referral referrer bonus:" },
      },
      select: { amount: true },
    }),
  ]);

  const invited = events
    .map((event) => ({ event, metadata: parseMetadata(event.metadata) }))
    .filter(({ metadata }) => metadata?.referrerId === user.userId);

  const recentInvites = invited.slice(0, 8).map(({ event, metadata }) => ({
    username: typeof metadata?.inviteeUsername === "string" ? metadata.inviteeUsername : "new user",
    createdAt: event.createdAt.toISOString(),
  }));

  return Response.json({
    inviteLink: `${origin}/?ref=${encodeURIComponent(user.username)}&utm_source=invite&utm_medium=share&utm_campaign=beta_launch`,
    invitedCount: invited.length,
    bonusEarned: bonusTxs.reduce((sum, tx) => sum + Math.max(0, tx.amount), 0),
    recentInvites,
  });
}
