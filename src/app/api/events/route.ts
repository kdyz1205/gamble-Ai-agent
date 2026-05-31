import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import {
  createChallengeEventFromProtocol,
  deriveEventMaxParticipants,
  eventPublicInclude,
  isEventProtocol,
} from "@/lib/challenge-events";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { normalizeWeatherOracleProtocol } from "@/lib/weather-oracle";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "true";
  const status = url.searchParams.get("status") || "open";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const user = await getAuthUser();

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;
  if (mine) {
    if (!user) return unauthorized();
    where.OR = [
      { creatorId: user.userId },
      { entries: { some: { userId: user.userId } } },
    ];
  }

  const [events, total] = await Promise.all([
    prisma.challengeEvent.findMany({
      where,
      include: eventPublicInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.challengeEvent.count({ where }),
  ]);

  return Response.json({ events, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const source = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const parsedProtocol = parseProtocolSpecV2(source.protocol);
  if (!parsedProtocol) {
    return Response.json({ error: "ProtocolSpecV2 protocol is required." }, { status: 400 });
  }
  const protocol = await normalizeWeatherOracleProtocol(parsedProtocol);
  if (!protocol.riskPolicy.allowed) {
    return Response.json({
      error: protocol.riskPolicy.blockedReason || "This event protocol is blocked by safety policy.",
      protocol,
    }, { status: 400 });
  }
  if (!isEventProtocol(protocol)) {
    return Response.json({
      error: "This protocol is not a mass-crowd, public-market, mass-local-event, or leaderboard event.",
      protocol,
    }, { status: 400 });
  }

  const maxParticipants = deriveEventMaxParticipants(protocol, source.maxParticipants);
  const { event, creatorEntry } = await createChallengeEventFromProtocol({
    user,
    protocol,
    maxParticipants,
  });

  await prisma.activityEvent.create({
    data: {
      type: "event_created",
      message: `${user.username} created event "${event.title}" for up to ${event.maxParticipants} participants`,
      userId: user.userId,
    },
  }).catch(() => null);

  return Response.json({
    event,
    creatorEntry,
    requiresEventFlow: true,
    eventUrl: `/events/${event.id}`,
  }, { status: 201 });
}
