import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert(["localhost", "127.0.0.1"].includes(db.hostname) && db.pathname === "/summoner_verification");
  const run = randomUUID();
  const players = await Promise.all([0, 1, 2].map((index) => prisma.user.create({ data: {
    email: `participants-${run}-${index}@example.invalid`, username: `participants-${run}-${index}`, credits: 50,
  } })));
  const quests: string[] = [];
  try {
    for (const wrongCreator of [true, false]) {
      const quest = await prisma.challenge.create({ data: {
        title: `QA inconsistent participants ${run}`, type: "General", creatorId: players[0].id,
        status: "judging", stake: 5, evidenceType: "text", participants: { create: wrongCreator
          ? [{ userId: players[1].id, role: "creator", status: "accepted" }, { userId: players[2].id, role: "opponent", status: "accepted" }]
          : players.map((p, i) => ({ userId: p.id, role: i === 0 ? "creator" : "opponent", status: "accepted" })) },
      } });
      quests.push(quest.id);
      const result = await executeChallengeJudgment(quest.id, 1);
      assert.ok(!result.ok && "status" in result && result.status === 409);
      assert.equal(await prisma.creditTx.count({ where: { challengeId: quest.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { challengeId: quest.id, action: "ai.call.reserved" } }), 0);
      assert.equal(await prisma.judgment.count({ where: { challengeId: quest.id } }), 0);
    }
    assert.ok((await prisma.user.findMany({ where: { id: { in: players.map((p) => p.id) } } })).every((p) => p.credits === 50));
    console.log("PASS real PG mismatched creator and multiple opponents reject before fees, inference, judgment or settlement");
  } finally {
    await prisma.challenge.deleteMany({ where: { id: { in: quests } } });
    await prisma.user.deleteMany({ where: { id: { in: players.map((p) => p.id) } } });
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
