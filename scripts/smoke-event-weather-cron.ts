import "dotenv/config";
import prisma from "../src/lib/db";
import { runCron } from "../src/app/api/cron/challenge-judgment/route";
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
      title: `Cron weather smoke ${Date.now()}`,
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
    const cron = await runCron();
    const reloaded = await prisma.challengeEvent.findUnique({
      where: { id: event.id },
      select: { id: true, status: true, protocolJson: true },
    });
    const outcome = cron.eventOutcomes.find((item) => item.eventId === event.id) ?? null;
    const ok = reloaded?.status === "finalized" && outcome?.status === "finalized";
    console.log(JSON.stringify({
      ok,
      eventId: event.id,
      finalStatus: reloaded?.status,
      outcome,
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
