import "dotenv/config";
import prisma from "../src/lib/db";
import { parseProtocolSpecV2 } from "../src/lib/protocol-spec-v2";
import { extractWeatherOracleSpec, normalizeWeatherOracleProtocol } from "../src/lib/weather-oracle";

async function main() {
  const eventId = process.argv[2];
  if (!eventId) {
    throw new Error("Usage: tsx scripts/repair-weather-oracle-event.ts <eventId>");
  }

  const event = await prisma.challengeEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, protocolJson: true },
  });
  if (!event) throw new Error(`Event not found: ${eventId}`);

  const parsed = parseProtocolSpecV2(JSON.parse(event.protocolJson));
  if (!parsed) throw new Error(`Event ${eventId} protocolJson is not ProtocolSpecV2`);

  const before = extractWeatherOracleSpec({ protocol: parsed, title: event.title });
  const normalized = await normalizeWeatherOracleProtocol(parsed);
  const after = extractWeatherOracleSpec({ protocol: normalized, title: event.title });
  if (!after) {
    throw new Error(`Event ${eventId} could not be normalized into a locked weather oracle protocol`);
  }

  const changed = JSON.stringify(parsed) !== JSON.stringify(normalized);
  if (changed) {
    await prisma.challengeEvent.update({
      where: { id: eventId },
      data: {
        title: normalized.title || event.title,
        protocolJson: JSON.stringify(normalized),
      },
    });
  }

  console.log(JSON.stringify({
    eventId,
    changed,
    beforeLocked: Boolean(before),
    afterLocked: Boolean(after),
    oracle: {
      locationName: after.locationName,
      latitude: after.latitude,
      longitude: after.longitude,
      date: after.date,
      metric: after.metric,
      condition: after.condition,
      targetValue: after.targetValue,
      settlementTime: after.settlementTime.toISOString(),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
