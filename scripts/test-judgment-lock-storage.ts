/** Real execution leases against both canonical TEXT and legacy JSONB storage. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const originalURL = process.env.DATABASE_URL;
  const target = new URL(originalURL ?? "postgresql://missing");
  assert(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification", "Requires isolated local PostgreSQL");
  const database = `lock_storage_${randomUUID().replaceAll("-", "")}`;
  assert.match(database, /^lock_storage_[a-f0-9]{32}$/);
  const admin = new pg.Client({ connectionString: originalURL });
  await admin.connect();
  let connection: pg.Client | undefined;
  let pool: pg.Pool | undefined;
  let prisma: PrismaClient | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    target.pathname = `/${database}`; process.env.DATABASE_URL = target.toString();
    connection = new pg.Client({ connectionString: target.toString() }); await connection.connect();
    pool = new pg.Pool({ connectionString: target.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
    const { withJudgmentExecutionLock: lock } = await import("../src/lib/judgment-execution-lock");
    for (const storage of ["TEXT", "JSONB"] as const) {
      await connection.query(`CREATE TABLE "AuditLog" (
        "id" TEXT PRIMARY KEY, "action" TEXT NOT NULL, "actorUserId" TEXT,
        "targetUserId" TEXT, "challengeId" TEXT, "payload" ${storage},
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      const claim = async (quest: string, age = 0) => {
        const id = randomUUID();
        await prisma!.auditLog.create({ data: { id, action: "judgment.execution.claim", challengeId: quest, createdAt: new Date(Date.now() - age) } });
        return id;
      };
      assert.equal(await lock("twice", async () => "first"), "first");
      assert.equal(await lock("twice", async () => "second"), "second");
      const releases: Array<{ id: string; payload: string | { claimId: string } }> = (await connection.query(`SELECT "id", "payload" FROM "AuditLog" WHERE action='judgment.execution.release' AND "challengeId"='twice'`)).rows;
      assert.equal(releases.length, 2);
      for (const row of releases) {
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        assert.equal(row.id, `judgment-release:${payload.claimId}`);
      }

      let entered!: () => void; let finish!: () => void; let calls = 0;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const blocked = new Promise<void>((resolve) => { finish = resolve; });
      const worker = lock("concurrent", async () => { calls++; entered(); await blocked; return "winner"; });
      await started;
      const opponents = await Promise.all(Array.from({ length: 8 }, () => lock("concurrent", async () => { calls++; return "unexpected"; })));
      assert(opponents.every((result) => result === null)); assert.equal(calls, 1);
      finish(); assert.equal(await worker, "winner");
      assert.equal(await prisma.auditLog.count({ where: { action: "judgment.execution.claim", challengeId: "concurrent" } }), 1);

      await claim("recent");
      assert.equal(await lock("recent", async () => assert.fail("recent unreleased claim entered")), null);
      await claim("stale", 7 * 60_000);
      assert.equal(await lock("stale", async () => "recovered"), "recovered");

      const legacy = await claim("legacy-release");
      await prisma.auditLog.create({ data: { action: "judgment.execution.release", challengeId: "legacy-release", payload: storage === "TEXT" ? legacy : JSON.stringify(legacy) } });
      assert.equal(await lock("legacy-release", async () => "legacy-reused"), "legacy-reused");
      const cross = await claim("cross-scope");
      await prisma.auditLog.create({ data: { action: "judgment.execution.release", challengeId: "another-quest", payload: storage === "TEXT" ? cross : JSON.stringify(cross) } });
      assert.equal(await lock("cross-scope", async () => assert.fail("unrelated release unlocked claim")), null);

      // Equal timestamps: a released claim must never hide another live claim.
      const tied = await claim("tied");
      await prisma.auditLog.create({ data: { id: `judgment-release:${tied}`, action: "judgment.execution.release", challengeId: "tied", payload: JSON.stringify({ claimId: tied }) } });
      const newer = await claim("tied");
      const same = new Date();
      await prisma.auditLog.updateMany({ where: { id: { in: [tied, newer] } }, data: { createdAt: same } });
      assert.equal(await lock("tied", async () => assert.fail("equal timestamp hid live worker")), null);

      const failure = new Error("Actual callback failure"); let failedToken = "";
      await assert.rejects(() => lock("throws", async (token) => { failedToken = token; throw failure; }), (error) => error === failure);
      assert(await prisma.auditLog.findUnique({ where: { id: `judgment-release:${failedToken}` } }));
      assert.equal(await lock("throws", async () => "retry-after-failure"), "retry-after-failure");
      console.log(`PASS ${storage}: twice, eight competing callers, recent/stale lease, historical/cross-scope releases, tied timestamps and thrown-callback release`);
      await connection.query(`DROP TABLE "AuditLog"`);
    }
  } finally {
    await prisma?.$disconnect(); await pool?.end(); await connection?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`); await admin.end();
    if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
