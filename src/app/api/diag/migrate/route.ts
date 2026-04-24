/**
 * POST /api/diag/migrate
 *
 * One-shot idempotent schema sync runs against the lambda's actual DATABASE_URL
 * (which Vercel redacts on pull, so dev machines can't be certain they pushed
 * to the same DB). Adds every column / index / constraint the production
 * schema expects; `IF NOT EXISTS` on everything so it's safe to run twice.
 *
 * Gated by x-diag-token == DIAG_TOKEN. Dry-runs by default; set ?apply=1 to
 * actually execute. Returns a per-statement result so we can see exactly
 * which ones were missing.
 *
 * This exists because Vercel redacts DATABASE_URL in `env pull`, so a dev
 * running `prisma db push` locally can't be sure it's going to the same DB
 * the production lambdas are hitting. The load test surfaced an invisible
 * drift: Evidence.preparedFrames / preparedAt / ... were pushed to one DB
 * but not the one production uses.
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// All DDL we've applied since the committed migrations diverged. Each is
// idempotent (IF NOT EXISTS / IF EXISTS). We run them in order — any that
// were already present are no-ops.
const DDL: Array<{ id: string; sql: string }> = [
  // ── Evidence pre-extract columns (commit d7bac2c era) ──
  { id: "evidence_preparedFrames",       sql: `ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "preparedFrames" TEXT` },
  { id: "evidence_preparedAt",           sql: `ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "preparedAt" TIMESTAMP(3)` },
  { id: "evidence_preparedDurationSec",  sql: `ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "preparedDurationSec" DOUBLE PRECISION` },
  { id: "evidence_preparedMode",         sql: `ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "preparedMode" TEXT` },
  { id: "evidence_prepareError",         sql: `ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "prepareError" TEXT` },

  // ── Evidence (challengeId, userId) uniqueness (Batch A d01acb8) ──
  { id: "evidence_unique_challenge_user", sql: `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Evidence_challengeId_userId_key'
      ) THEN
        -- Delete duplicate rows first (keep the newest per (challengeId, userId))
        DELETE FROM "Evidence" e
        USING "Evidence" dup
        WHERE e."challengeId" = dup."challengeId"
          AND e."userId" = dup."userId"
          AND e."createdAt" < dup."createdAt";
        ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_challengeId_userId_key" UNIQUE ("challengeId", "userId");
      END IF;
    END $$;
  ` },
  { id: "evidence_idx_challengeId",      sql: `CREATE INDEX IF NOT EXISTS "Evidence_challengeId_idx" ON "Evidence" ("challengeId")` },

  // ── Challenge hot-query indexes (Batch A d01acb8) ──
  { id: "challenge_idx_status_public_created", sql: `CREATE INDEX IF NOT EXISTS "Challenge_status_isPublic_createdAt_idx" ON "Challenge" ("status", "isPublic", "createdAt")` },
  { id: "challenge_idx_creator_created",       sql: `CREATE INDEX IF NOT EXISTS "Challenge_creatorId_createdAt_idx" ON "Challenge" ("creatorId", "createdAt")` },
  { id: "challenge_idx_status_updated",        sql: `CREATE INDEX IF NOT EXISTS "Challenge_status_updatedAt_idx" ON "Challenge" ("status", "updatedAt")` },

  // ── CreditTx indexes + safer cascades (Batch A) ──
  { id: "credittx_idx_user_created",     sql: `CREATE INDEX IF NOT EXISTS "CreditTx_userId_createdAt_idx" ON "CreditTx" ("userId", "createdAt")` },
  { id: "credittx_idx_challenge",        sql: `CREATE INDEX IF NOT EXISTS "CreditTx_challengeId_idx" ON "CreditTx" ("challengeId")` },
  { id: "credittx_idx_type_created",     sql: `CREATE INDEX IF NOT EXISTS "CreditTx_type_createdAt_idx" ON "CreditTx" ("type", "createdAt")` },

  // ── ActivityEvent indexes ──
  { id: "activity_idx_created",          sql: `CREATE INDEX IF NOT EXISTS "ActivityEvent_createdAt_idx" ON "ActivityEvent" ("createdAt")` },
  { id: "activity_idx_challenge",        sql: `CREATE INDEX IF NOT EXISTS "ActivityEvent_challengeId_idx" ON "ActivityEvent" ("challengeId")` },

  // ── JudgeJob startedAt / heartbeatAt + status+startedAt index (Batch D a797485) ──
  { id: "judgejob_startedAt",            sql: `ALTER TABLE "JudgeJob" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3)` },
  { id: "judgejob_heartbeatAt",          sql: `ALTER TABLE "JudgeJob" ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3)` },
  { id: "judgejob_idx_status_started",   sql: `CREATE INDEX IF NOT EXISTS "JudgeJob_status_startedAt_idx" ON "JudgeJob" ("status", "startedAt")` },
];

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-diag-token");
  if (!process.env.DIAG_TOKEN || token !== process.env.DIAG_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "1";

  // Identify which DB we're about to touch so dev can cross-check
  const dbHost = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();

  const results: Array<{ id: string; ok: boolean; applied: boolean; ms?: number; error?: string }> = [];

  if (!apply) {
    return Response.json({
      mode: "dry-run",
      databaseHost: dbHost,
      wouldRun: DDL.map((d) => d.id),
      note: "Add ?apply=1 to actually execute.",
    });
  }

  for (const stmt of DDL) {
    const t0 = Date.now();
    try {
      await prisma.$executeRawUnsafe(stmt.sql);
      results.push({ id: stmt.id, ok: true, applied: true, ms: Date.now() - t0 });
    } catch (err) {
      results.push({
        id: stmt.id,
        ok: false,
        applied: false,
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }
  }

  return Response.json({
    mode: "apply",
    databaseHost: dbHost,
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    results,
  });
}
