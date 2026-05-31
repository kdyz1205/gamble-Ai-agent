import prisma from "@/lib/db";
import { parseProtocolSpecV2, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { extractWeatherOracleSpec, judgeWeatherOracle, normalizeWeatherOracleProtocol, type WeatherOracleSpec } from "@/lib/weather-oracle";

export type EventResolutionActor = {
  kind: "creator" | "admin" | "developer" | "cron";
  userId?: string | null;
  username?: string | null;
};

export type EventOracleResolutionResult =
  | {
      ok: true;
      status: "not_due" | "resolved" | "needs_review";
      eventId: string;
      eventStatus: string;
      resolution: Awaited<ReturnType<typeof upsertEventResolution>>;
      protocol?: ProtocolSpecV2 | null;
      spec?: WeatherOracleSpec | null;
      alreadyFinalized?: boolean;
    }
  | {
      ok: false;
      status: "not_oracle" | "not_found" | "invalid_status" | "failed";
      eventId?: string;
      error: string;
      httpStatus: number;
    };

function parseEventProtocol(protocolJson: string): ProtocolSpecV2 | null {
  try {
    return parseProtocolSpecV2(JSON.parse(protocolJson));
  } catch {
    return null;
  }
}

function snapshotJson(input: {
  spec?: WeatherOracleSpec | null;
  result?: {
    winnerId: string | null;
    confidence: number;
    evidenceQuality?: string;
    recommendation?: string;
    reasoning: string;
    eventMetrics?: Record<string, unknown>;
    providerCall?: unknown;
  } | null;
  status: string;
  reason?: string;
}) {
  return JSON.stringify({
    source: "Open-Meteo",
    status: input.status,
    reason: input.reason,
    weatherOracle: input.spec
      ? {
          locationName: input.spec.locationName,
          latitude: input.spec.latitude,
          longitude: input.spec.longitude,
          date: input.spec.date,
          metric: input.spec.metric,
          condition: input.spec.condition,
          targetValue: input.spec.targetValue,
          targetUnit: input.spec.targetUnit,
          settlementTime: input.spec.settlementTime.toISOString(),
        }
      : null,
    result: input.result
      ? {
          winnerId: input.result.winnerId,
          confidence: input.result.confidence,
          evidenceQuality: input.result.evidenceQuality,
          recommendation: input.result.recommendation,
          reasoning: input.result.reasoning,
          eventMetrics: input.result.eventMetrics ?? null,
          providerCall: input.result.providerCall ?? null,
        }
      : null,
  });
}

async function upsertEventResolution(input: {
  eventId: string;
  status: "not_due" | "resolved" | "needs_review" | "failed";
  winnerId?: string | null;
  confidence?: number | null;
  recommendation?: string | null;
  evidenceQuality?: string | null;
  reasoning?: string | null;
  oracleSnapshotJson?: string | null;
  blockingIssues?: string[] | null;
  resolvedAt?: Date | null;
}) {
  const data = {
    source: "open_meteo",
    status: input.status,
    winnerId: input.winnerId ?? null,
    confidence: input.confidence ?? null,
    recommendation: input.recommendation ?? null,
    evidenceQuality: input.evidenceQuality ?? null,
    reasoning: input.reasoning ?? null,
    oracleSnapshotJson: input.oracleSnapshotJson ?? null,
    blockingIssues: input.blockingIssues?.length ? JSON.stringify(input.blockingIssues) : null,
    resolvedAt: input.resolvedAt ?? null,
  };
  return prisma.eventResolution.upsert({
    where: { eventId: input.eventId },
    create: {
      eventId: input.eventId,
      ...data,
    },
    update: data,
  });
}

function resolutionStatusForVerdict(input: {
  recommendation?: string | null;
  evidenceQuality?: string | null;
  confidence: number;
}) {
  if (input.evidenceQuality !== "good") return "needs_review";
  if (input.recommendation === "needs_review" || input.recommendation === "invalid_evidence") return "needs_review";
  if (input.confidence < 0.85) return "needs_review";
  return "resolved";
}

async function recordActivity(input: {
  eventId: string;
  title: string;
  creatorId: string;
  actor: EventResolutionActor;
  status: string;
  message: string;
  metadata: Record<string, unknown>;
}) {
  await prisma.activityEvent.create({
    data: {
      type: input.status === "resolved" ? "event_oracle_resolved" : "event_oracle_needs_review",
      message: input.message,
      userId: input.actor.userId ?? input.creatorId,
      metadata: JSON.stringify(input.metadata),
    },
  }).catch(() => null);
}

export async function resolveOracleEvent(
  eventId: string,
  actor: EventResolutionActor,
  now = new Date(),
): Promise<EventOracleResolutionResult> {
  const event = await prisma.challengeEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      creatorId: true,
      status: true,
      protocolJson: true,
      resolutions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      entries: {
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
      },
    },
  });
  if (!event) {
    return { ok: false, status: "not_found", error: "Event not found", httpStatus: 404 };
  }

  const existing = event.resolutions[0] ?? null;
  if (event.status === "finalized" && existing?.status === "resolved") {
    return {
      ok: true,
      status: "resolved",
      eventId: event.id,
      eventStatus: event.status,
      resolution: existing,
      alreadyFinalized: true,
    };
  }

  if (!["open", "submissions_open", "closed", "needs_review", "finalized"].includes(event.status)) {
    return {
      ok: false,
      status: "invalid_status",
      eventId: event.id,
      error: `Event cannot be resolved from status ${event.status}.`,
      httpStatus: 409,
    };
  }

  let protocol = parseEventProtocol(event.protocolJson);
  let spec = extractWeatherOracleSpec({ protocol, title: event.title, now });

  if (!spec && protocol?.settlementProtocol.mode === "auto_oracle") {
    const normalized = await normalizeWeatherOracleProtocol(protocol, now);
    const normalizedSpec = extractWeatherOracleSpec({ protocol: normalized, title: event.title, now });
    if (normalizedSpec) {
      protocol = normalized;
      spec = normalizedSpec;
      await prisma.challengeEvent.update({
        where: { id: event.id },
        data: {
          title: normalized.title || event.title,
          protocolJson: JSON.stringify(normalized),
        },
      });
    }
  }

  if (protocol?.settlementProtocol.mode !== "auto_oracle" && !spec) {
    return {
      ok: false,
      status: "not_oracle",
      eventId: event.id,
      error: "This event is not an auto-oracle event.",
      httpStatus: 409,
    };
  }

  if (!spec) {
    const resolution = await upsertEventResolution({
      eventId: event.id,
      status: "needs_review",
      recommendation: "needs_review",
      evidenceQuality: "invalid",
      confidence: 0,
      reasoning: "This oracle event is missing locked weather oracle fields.",
      blockingIssues: [
        "Missing ORACLE_WEATHER_LATITUDE, ORACLE_WEATHER_LONGITUDE, ORACLE_WEATHER_DATE, metric, condition, target, or settlement time.",
      ],
      oracleSnapshotJson: snapshotJson({
        status: "needs_review",
        reason: "missing_locked_weather_fields",
      }),
      resolvedAt: now,
    });
    await prisma.challengeEvent.update({ where: { id: event.id }, data: { status: "needs_review" } });
    return { ok: true, status: "needs_review", eventId: event.id, eventStatus: "needs_review", resolution, protocol, spec: null };
  }

  if (now < spec.settlementTime) {
    const resolution = await upsertEventResolution({
      eventId: event.id,
      status: "not_due",
      recommendation: "needs_review",
      evidenceQuality: "insufficient",
      confidence: 0,
      reasoning: `Weather oracle challenge is not ready until ${spec.settlementTime.toISOString()}.`,
      blockingIssues: ["Settlement time has not passed yet."],
      oracleSnapshotJson: snapshotJson({
        spec,
        status: "not_due",
        reason: "settlement_time_not_reached",
      }),
      resolvedAt: null,
    });
    return { ok: true, status: "not_due", eventId: event.id, eventStatus: event.status, resolution, protocol, spec };
  }

  const opponent = event.entries.find((entry) => entry.userId !== event.creatorId) ?? null;
  const oracle = await judgeWeatherOracle({
    spec,
    participantAId: event.creatorId,
    participantBId: opponent?.userId ?? null,
    now,
  });
  if (oracle.status === "not_due") {
    const resolution = await upsertEventResolution({
      eventId: event.id,
      status: "not_due",
      recommendation: "needs_review",
      evidenceQuality: "insufficient",
      confidence: 0,
      reasoning: oracle.reason,
      blockingIssues: ["Settlement time has not passed yet."],
      oracleSnapshotJson: snapshotJson({ spec, status: "not_due", reason: oracle.reason }),
      resolvedAt: null,
    });
    return { ok: true, status: "not_due", eventId: event.id, eventStatus: event.status, resolution, protocol, spec };
  }

  const verdictStatus = resolutionStatusForVerdict({
    recommendation: oracle.result.recommendation ?? oracle.result.settlementRecommendation,
    evidenceQuality: oracle.result.evidenceQuality,
    confidence: oracle.result.confidence,
  });
  const resolution = await upsertEventResolution({
    eventId: event.id,
    status: verdictStatus,
    winnerId: oracle.result.winnerId,
    confidence: oracle.result.confidence,
    recommendation: oracle.result.recommendation ?? oracle.result.settlementRecommendation ?? null,
    evidenceQuality: oracle.result.evidenceQuality ?? null,
    reasoning: oracle.result.reasoning,
    blockingIssues: oracle.result.blockingIssues ?? [],
    oracleSnapshotJson: snapshotJson({ spec, result: oracle.result, status: verdictStatus }),
    resolvedAt: now,
  });
  const nextEventStatus = verdictStatus === "resolved" ? "finalized" : "needs_review";
  await prisma.challengeEvent.update({ where: { id: event.id }, data: { status: nextEventStatus } });

  if (existing?.status !== verdictStatus) {
    await recordActivity({
      eventId: event.id,
      title: event.title,
      creatorId: event.creatorId,
      actor,
      status: verdictStatus,
      message: verdictStatus === "resolved"
        ? `Oracle event "${event.title}" resolved from Open-Meteo.`
        : `Oracle event "${event.title}" needs review after Open-Meteo check.`,
      metadata: {
        eventId: event.id,
        actor,
        source: "Open-Meteo",
        status: verdictStatus,
        winnerId: oracle.result.winnerId,
        confidence: oracle.result.confidence,
        evidenceQuality: oracle.result.evidenceQuality,
        recommendation: oracle.result.recommendation,
        reasoning: oracle.result.reasoning,
        blockingIssues: oracle.result.blockingIssues ?? [],
        weatherOracle: {
          locationName: spec.locationName,
          latitude: spec.latitude,
          longitude: spec.longitude,
          date: spec.date,
          metric: spec.metric,
          condition: spec.condition,
          targetValue: spec.targetValue,
        },
        eventMetrics: oracle.result.eventMetrics ?? null,
      },
    });
  }

  return {
    ok: true,
    status: verdictStatus,
    eventId: event.id,
    eventStatus: nextEventStatus,
    resolution,
    protocol,
    spec,
  };
}
