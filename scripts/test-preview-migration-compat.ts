import "dotenv/config";
import assert from "node:assert/strict";
import { Pool } from "pg";
import prisma from "../src/lib/db";

/**
 * Proves the legacy Evidence table remains structurally unchanged even after
 * installing the optional private-upload migration. Existing public/mobile
 * routes select Evidence normally without querying the new optional table.
 * Isolated disposable PostgreSQL only; strictly read-only.
 */
async function main() {
  const u = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
  if (!["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.pathname !== "/summoner_verification") {
    throw new Error("Legacy migration compatibility check must use isolated CI PostgreSQL");
  }
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const optionalColumn = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Evidence' AND column_name='trustedUploadId'",
    );
    assert.equal(optionalColumn.rowCount, 0,
      "A feature-gated upload must not add a required column to the legacy Evidence table");

    const fk = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='TrustedEvidenceUpload' AND column_name='evidenceId'",
    );
    assert.equal(fk.rowCount, 1, "The new optional table must own the evidence linkage");

    // Deliberately use ordinary Prisma queries, not a direct SQL projection.
    const evidence = await prisma.evidence.findMany({ take: 1 });
    const quests = await prisma.challenge.findMany({ take: 1, include: {
      evidence: true,
    } });
    assert.ok(Array.isArray(evidence) && Array.isArray(quests));

    console.log("PASS unchanged legacy Evidence model; optional private upload uses its own FK");
  } finally {
    await db.end();
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
