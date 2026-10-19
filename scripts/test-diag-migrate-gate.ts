/** Actual route handlers against a disposable local PostgreSQL database. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const originalURL = process.env.DATABASE_URL;
  const originalToken = process.env.DIAG_TOKEN;
  const target = new URL(originalURL ?? "postgresql://missing");
  assert(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification", "Requires the isolated local verification server");
  const database = `diag_gate_${randomUUID().replaceAll("-", "")}`;
  assert.match(database, /^diag_gate_[a-f0-9]{32}$/);
  const admin = new pg.Client({ connectionString: originalURL });
  await admin.connect();
  let fixture: pg.Client | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    target.pathname = `/${database}`;
    process.env.DATABASE_URL = target.toString();
    process.env.DIAG_TOKEN = randomUUID();
    fixture = new pg.Client({ connectionString: target.toString() });
    await fixture.connect();
    await fixture.query(`CREATE TYPE "QuestQAState" AS ENUM ('qa_open', 'qa_done');
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL);
      CREATE TABLE "Evidence" ("id" TEXT PRIMARY KEY, "challengeId" TEXT, "userId" TEXT, "createdAt" TIMESTAMP NOT NULL);
      INSERT INTO "User" VALUES ('sentinel-user', 'private-sentinel@example.invalid');
      INSERT INTO "Evidence" VALUES ('old-proof','quest','sentinel-user','2020-01-01'), ('new-proof','quest','sentinel-user','2021-01-01')`);
    // Use the normal db.ts singleton hook with a real adapter/pool that this
    // disposable-database test owns and can completely close before cleanup.
    pool = new pg.Pool({ connectionString: target.toString() });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
    disconnect = () => prisma.$disconnect();
    const { POST, GET } = await import("../src/app/api/diag/migrate/route");
    const request = (query = "", body?: unknown, token = process.env.DIAG_TOKEN) => new NextRequest(`http://localhost/api/diag/migrate${query}`, {
      method: "POST", headers: { "x-diag-token": token!, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const snapshot = async () => ({
      columns: (await fixture!.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name`)).rows,
      indexes: (await fixture!.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`)).rows,
      users: (await fixture!.query(`SELECT * FROM "User" ORDER BY id`)).rows,
      evidence: (await fixture!.query(`SELECT * FROM "Evidence" ORDER BY id`)).rows,
    });
    const before = await snapshot();
    for (const query of ["?inspect=1", "?apply=1&ids=user_isReviewer"]) assert.equal((await POST(request(query, undefined, "wrong-token"))).status, 401);
    const configuredToken = process.env.DIAG_TOKEN;
    delete process.env.DIAG_TOKEN;
    assert.equal((await POST(request("?inspect=1", undefined, configuredToken))).status, 401);
    process.env.DIAG_TOKEN = configuredToken;
    const dry = await POST(request()); assert.equal(dry.status, 200);
    const dryBody = await dry.json(); assert.equal(dryBody.mode, "dry-run");
    assert(!dryBody.wouldRun.includes("evidence_unique_challenge_user"));
    assert(!dryBody.wouldRun.includes("review_case_low_confidence_backfill"));
    for (const [query, body] of [
      ["?apply=1", undefined],
      ["?apply=1&ids=user_isReviewer,unknown_id", undefined],
      ["?apply=1", { ids: ["user_isReviewer", "evidence_unique_challenge_user"] }],
      ["?apply=1", { ids: ["user_isReviewer", "review_case_low_confidence_backfill"] }],
      ["?apply=1&ids=user_isReviewer", { ids: ["evidence_preparedFrames"] }],
      ["?apply=1", { ids: "user_isReviewer" }],
      ["?inspect=1&apply=1", undefined],
    ] as const) assert.equal((await POST(request(query, body))).status, 400);
    assert.deepEqual(await snapshot(), before);
    console.log("PASS authorization, unknown/destructive/backfill IDs, ambiguous selection and implicit bulk apply all fail before any row or schema changes");

    for (const inspect of [await POST(request("?inspect=1")), await GET(new NextRequest("http://localhost/api/diag/migrate", { headers: { "x-diag-token": process.env.DIAG_TOKEN! } }))]) {
      assert.equal(inspect.status, 200); assert.equal(inspect.headers.get("cache-control"), "no-store");
      const metadata = await inspect.json(); assert.equal(metadata.mode, "inspect");
      assert(metadata.inventory.tables.some((item: { table_name: string }) => item.table_name === "User"));
      assert(metadata.inventory.columns.some((item: { column_name: string }) => item.column_name === "email"));
      assert(metadata.inventory.types.some((item: { type_name: string }) => item.type_name === "User"));
      assert.deepEqual(metadata.inventory.types.filter((item: { type_name: string }) => item.type_name === "QuestQAState").map((item: { enum_value: string }) => item.enum_value), ["qa_open", "qa_done"]);
      assert(metadata.inventory.indexes.some((item: { definition: string }) => item.definition.includes("User_pkey")));
      assert(metadata.inventory.constraints.some((item: { definition: string }) => item.definition === "PRIMARY KEY (id)"));
      assert(!JSON.stringify(metadata).includes("private-sentinel@example.invalid"));
    }
    assert.deepEqual(await snapshot(), before);
    console.log("PASS authenticated GET/POST inspect returns tables, columns, types, index/constraint definitions without selecting or changing user data");

    const applied = await POST(request("?apply=1", { ids: ["user_isReviewer", "evidence_preparedFrames", "evidence_idx_challengeId"] }));
    const result = await applied.json(); assert.equal(result.succeeded, 3); assert.equal(result.total, 3);
    assert(result.results.every((item: { ok: boolean }) => item.ok));
    const after = await snapshot();
    assert(after.columns.some((item) => item.column_name === "isReviewer"));
    assert(after.columns.some((item) => item.column_name === "preparedFrames"));
    assert(after.indexes.some((item) => item.indexname === "Evidence_challengeId_idx"));
    assert.deepEqual(after.evidence, before.evidence.map((row) => ({ ...row, preparedFrames: null })));
    assert.deepEqual(after.users, [{ ...before.users[0], isReviewer: false }]);
    const retried = await (await POST(request("?apply=1&ids=evidence_idx_challengeId&ids=user_isReviewer,evidence_preparedFrames"))).json();
    assert.equal(retried.succeeded, 3); assert.deepEqual(await snapshot(), after);
    console.log("PASS explicit JSON/query additive DDL creates only selected columns/index, preserves duplicate proof rows and sentinel account, and retries idempotently");
  } finally {
    await disconnect?.();
    await pool?.end();
    await fixture?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
    if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL;
    if (originalToken === undefined) delete process.env.DIAG_TOKEN; else process.env.DIAG_TOKEN = originalToken;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
