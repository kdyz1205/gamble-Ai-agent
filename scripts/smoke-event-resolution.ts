import "dotenv/config";
import prisma from "../src/lib/db";
import { resolveOracleEvent } from "../src/lib/event-resolution";
import { weatherProtocolFromPrompt } from "../src/lib/weather-oracle";

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "no user in current database" }, null, 2));
    return;
  }

  const protocol = await weatherProtocolFromPrompt(
    "San Jose temperature will not exceed 30 C on 2026-05-29",
    "en",
    new Date("2026-05-28T12:00:00.000Z"),
  );
  if (!protocol) throw new Error("weather protocol did not compile");

  const event = await prisma.challengeEvent.create({
    data: {
      creatorId: user.id,
      title: `Resolve weather smoke ${Date.now()}`,
      protocolJson: JSON.stringify(protocol),
      status: "open",
      maxParticipants: 1000,
      entries: {
        create: { userId: user.id, ticketCode: "SMOKE", status: "joined" },
      },
    },
    select: { id: true },
  });

  try {
    const first = await resolveOracleEvent(event.id, { kind: "developer", userId: user.id }, new Date("2026-05-31T12:00:00.000Z"));
    const second = await resolveOracleEvent(event.id, { kind: "developer", userId: user.id }, new Date("2026-05-31T12:05:00.000Z"));
    const reloaded = await prisma.challengeEvent.findUnique({
      where: { id: event.id },
      select: {
        id: true,
        status: true,
        resolutions: { select: { id: true, status: true, winnerId: true, confidence: true, recommendation: true } },
      },
    });
    const resolutionCount = reloaded?.resolutions.length ?? 0;
    const ok =
      first.ok &&
      second.ok &&
      first.status === "resolved" &&
      second.status === "resolved" &&
      reloaded?.status === "finalized" &&
      resolutionCount === 1 &&
      Boolean(reloaded?.resolutions[0]?.winnerId);

    console.log(JSON.stringify({
      ok,
      eventId: event.id,
      firstStatus: first.ok ? first.status : first.status,
      secondStatus: second.ok ? second.status : second.status,
      finalStatus: reloaded?.status,
      resolutionCount,
      resolution: reloaded?.resolutions[0] ?? null,
    }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.activityEvent.deleteMany({ where: { metadata: { contains: event.id } } }).catch(() => null);
    await prisma.challengeEvent.delete({ where: { id: event.id } }).catch(() => null);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
