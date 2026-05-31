import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAiAccessForUser } from "@/lib/ai-access-policy";
import { eventPublicInclude } from "@/lib/challenge-events";
import { resolveOracleEvent } from "@/lib/event-resolution";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { extractWeatherOracleSpec } from "@/lib/weather-oracle";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();

  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    select: { id: true, creatorId: true, title: true, protocolJson: true },
  });
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

  const protocol = (() => {
    try {
      return parseProtocolSpecV2(JSON.parse(event.protocolJson));
    } catch {
      return null;
    }
  })();
  const spec = extractWeatherOracleSpec({ protocol, title: event.title });
  const publicDueOracle =
    protocol?.settlementProtocol.mode === "auto_oracle" &&
    spec &&
    new Date() >= spec.settlementTime;

  const access = user ? await getAiAccessForUser(user.userId) : null;
  const canResolve =
    Boolean(publicDueOracle) ||
    Boolean(user && (
      event.creatorId === user.userId ||
      access?.role === "admin" ||
      access?.role === "developer" ||
      access?.internalFlags.developerOverride
    ));
  if (!canResolve || (!user && !publicDueOracle)) {
    return Response.json({ error: "Only the creator/operator can resolve this event before the public oracle settlement time." }, { status: user ? 403 : 401 });
  }

  const result = await resolveOracleEvent(id, {
    kind: access?.role === "admin" ? "admin" : access?.isDeveloper ? "developer" : user ? "creator" : "cron",
    userId: user?.userId ?? null,
    username: user?.username ?? "public-oracle-trigger",
  });
  if (!result.ok) {
    return Response.json({ error: result.error, status: result.status }, { status: result.httpStatus });
  }

  const updated = await prisma.challengeEvent.findUnique({
    where: { id },
    include: eventPublicInclude,
  });

  return Response.json({
    event: updated,
    resolution: result.resolution,
    status: result.status,
    eventStatus: result.eventStatus,
    alreadyFinalized: result.alreadyFinalized ?? false,
    settlementTime: result.spec?.settlementTime.toISOString() ?? null,
  });
}
