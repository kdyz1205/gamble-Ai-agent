import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { eventPublicInclude, recomputeEventLeaderboard } from "@/lib/challenge-events";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { extractWeatherOracleSpec } from "@/lib/weather-oracle";
import { resolveOracleEvent } from "@/lib/event-resolution";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    select: {
      id: true,
      creatorId: true,
      status: true,
      title: true,
      protocolJson: true,
      entries: {
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
      },
    },
  });
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  if (event.creatorId !== user.userId) {
    return Response.json({ error: "Only the event creator can finalize this event." }, { status: 403 });
  }
  if (event.status === "finalized") {
    const existing = await prisma.challengeEvent.findUnique({ where: { id }, include: eventPublicInclude });
    return Response.json({ event: existing, entries: await recomputeEventLeaderboard(id), alreadyFinalized: true });
  }
  if (!["open", "submissions_open", "closed"].includes(event.status)) {
    return Response.json({ error: `Event cannot be finalized from status ${event.status}.` }, { status: 409 });
  }

  const protocol = (() => {
    try {
      return parseProtocolSpecV2(JSON.parse(event.protocolJson));
    } catch {
      return null;
    }
  })();
  const weatherOracleSpec = extractWeatherOracleSpec({
    protocol,
    title: event.title,
  });
  if (protocol?.settlementProtocol.mode === "auto_oracle" || weatherOracleSpec) {
    const result = await resolveOracleEvent(id, {
      kind: "creator",
      userId: user.userId,
      username: user.username,
    });
    if (!result.ok) {
      return Response.json({ error: result.error, status: result.status }, { status: result.httpStatus });
    }
    if (result.status === "not_due") {
      return Response.json({
        error: result.resolution.reasoning,
        status: "not_due",
        settlementTime: result.spec?.settlementTime.toISOString() ?? null,
        resolution: result.resolution,
      }, { status: 409 });
    }
    const updated = await prisma.challengeEvent.findUnique({ where: { id }, include: eventPublicInclude });

    return Response.json({
      event: updated,
      entries: [],
      alreadyFinalized: false,
      oracle: {
        source: "Open-Meteo",
        status: result.status,
        resolution: result.resolution,
      },
    });
  }

  const entries = await recomputeEventLeaderboard(id);
  if (entries.length === 0) {
    return Response.json({ error: "Cannot finalize an event with no leaderboard submissions." }, { status: 409 });
  }

  const updated = await prisma.challengeEvent.update({
    where: { id },
    data: { status: "finalized" },
    include: eventPublicInclude,
  });

  await prisma.activityEvent.create({
    data: {
      type: "event_finalized",
      message: `${user.username} finalized event "${event.title}"`,
      userId: user.userId,
    },
  }).catch(() => null);

  return Response.json({ event: updated, entries, alreadyFinalized: false });
}
