import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { preExtractAndPersistFrames } from "../src/lib/media/pre-extract-frames";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert(["localhost", "127.0.0.1"].includes(db.hostname) && db.pathname === "/summoner_verification");
  const run = randomUUID();
  const owner = await prisma.user.create({ data: { email: `cache-${run}@example.invalid`, username: `cache-${run}`, credits: 50 } });
  const quest = await prisma.challenge.create({ data: { title: `QA cache race ${run}`, creatorId: owner.id, type: "General", status: "live" } });
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = ""; // Controlled unavailable-storage negative path; no model or upload calls.
  try {
    const proof = await prisma.evidence.create({ data: { challengeId: quest.id, userId: owner.id, type: "photo", url: "https://example.com/v2.png", description: "latest", preparedFrames: '["https://example.com/latest-frame.jpg"]', preparedAt: new Date(), preparedMode: "photo" } });
    const latest = await prisma.evidence.findUniqueOrThrow({ where: { id: proof.id } });
    await preExtractAndPersistFrames({ evidenceId: proof.id, challengeId: quest.id, userId: owner.id, type: "photo", url: "https://example.com/v1.png", description: "old", metadata: null });
    assert.deepEqual(await prisma.evidence.findUniqueOrThrow({ where: { id: proof.id } }), latest);
    await preExtractAndPersistFrames({ evidenceId: proof.id, challengeId: quest.id, userId: owner.id, type: "photo", url: latest.url, description: "old", metadata: null });
    assert.deepEqual(await prisma.evidence.findUniqueOrThrow({ where: { id: proof.id } }), latest);
    await preExtractAndPersistFrames({ evidenceId: proof.id, challengeId: quest.id, userId: owner.id, type: "photo", url: latest.url, description: latest.description, metadata: latest.metadata });
    const current = await prisma.evidence.findUniqueOrThrow({ where: { id: proof.id } });
    assert.equal(current.preparedFrames, null);
    assert.match(current.prepareError ?? "", /BLOB/);
    console.log("PASS real PG stale URL/description preparation cannot overwrite newest cache; current failure remains visible");
  } finally {
    if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
    await prisma.challenge.delete({ where: { id: quest.id } });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
