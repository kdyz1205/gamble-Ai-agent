/**
 * POST /api/diag/migrate
 *
 * Inspect the lambda's actual DATABASE_URL catalog without reading user rows,
 * then apply explicitly selected additive schema statements or the reviewed
 * CreditTx foreign-key metadata repair. Historical data cleanup/backfill
 * entries remain documented below but cannot be executed.
 *
 * Gated by x-diag-token == DIAG_TOKEN. Dry-runs by default. Inspect catalog
 * metadata with ?inspect=1; apply only explicitly selected reviewed DDL IDs
 * with ?apply=1&ids=... or a JSON { ids: [...] } body.
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

// Reviewed catalog: additive schema entries plus the exact ledger-owner FK
// repair. Destructive cleanup/data backfill IDs remain blocked. The metadata
// repair is one atomic DO statement; it never changes user or ledger rows.
const DDL: Array<{ id: string; sql: string }> = [
  // ── ChallengeStatus enum values (Neon DB uses a real Postgres ENUM; our
  //    Prisma schema treats status as String and introduced values the enum
  //    never got: pending_settlement, disputed, etc.). ALTER TYPE ADD VALUE
  //    IF NOT EXISTS is idempotent. Must run OUTSIDE any transaction block —
  //    Postgres rejects adding enum values inside a tx.                      ──
  { id: "enum_status_draft",              sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'draft'` },
  { id: "enum_status_open",               sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'open'` },
  { id: "enum_status_matched",            sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'matched'` },
  { id: "enum_status_live",               sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'live'` },
  { id: "enum_status_judging",            sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'judging'` },
  { id: "enum_status_pending_settlement", sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'pending_settlement'` },
  { id: "enum_status_disputed",           sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'disputed'` },
  { id: "enum_status_settled",            sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'settled'` },
  { id: "enum_status_cancelled",          sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'cancelled'` },
  { id: "enum_status_resolved",           sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'resolved'` },
  { id: "enum_status_void",               sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'void'` },
  { id: "enum_status_funded",             sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'funded'` },

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

  // ── Mutual verdict acceptance + human review loop (2026-07-13) ──
  { id: "user_isReviewer", sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isReviewer" BOOLEAN NOT NULL DEFAULT false` },
  { id: "credittx_idempotencyKey", sql: `ALTER TABLE "CreditTx" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT` },
  { id: "credittx_idempotencyKey_unique", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "CreditTx_idempotencyKey_key" ON "CreditTx" ("idempotencyKey")` },
  { id: "credittx_user_fk_restrict", sql: `
    DO $$
    DECLARE prior RECORD;
    BEGIN
      LOCK TABLE public."CreditTx" IN ACCESS EXCLUSIVE MODE;
      SELECT * INTO prior FROM pg_constraint
      WHERE conrelid = 'public."CreditTx"'::regclass AND conname = 'CreditTx_userId_fkey';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Expected CreditTx_userId_fkey is missing; reconciliation is required';
      END IF;
      IF prior.contype <> 'f' OR prior.confrelid <> 'public."User"'::regclass
        OR prior.conkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public."CreditTx"'::regclass AND attname = 'userId')]
        OR prior.confkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public."User"'::regclass AND attname = 'id')]
        OR prior.confupdtype <> 'c' OR prior.confdeltype NOT IN ('c', 'r') THEN
        RAISE EXCEPTION 'Unexpected CreditTx_userId_fkey definition; reconciliation is required';
      END IF;
      IF prior.confdeltype = 'c' THEN
        ALTER TABLE public."CreditTx" DROP CONSTRAINT "CreditTx_userId_fkey";
        ALTER TABLE public."CreditTx" ADD CONSTRAINT "CreditTx_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES public."User"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
      END IF;
      ALTER TABLE public."CreditTx" VALIDATE CONSTRAINT "CreditTx_userId_fkey";
    END $$
  ` },
  { id: "verdict_response_table", sql: `
    CREATE TABLE IF NOT EXISTS "VerdictResponse" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "challengeId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "decision" TEXT NOT NULL,
      "reason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "VerdictResponse_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "VerdictResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  ` },
  { id: "verdict_response_unique", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "VerdictResponse_challengeId_userId_key" ON "VerdictResponse" ("challengeId", "userId")` },
  { id: "verdict_response_idx", sql: `CREATE INDEX IF NOT EXISTS "VerdictResponse_challengeId_decision_idx" ON "VerdictResponse" ("challengeId", "decision")` },
  { id: "review_case_table", sql: `
    CREATE TABLE IF NOT EXISTS "ReviewCase" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "challengeId" TEXT NOT NULL,
      "requestedByUserId" TEXT,
      "reviewerUserId" TEXT,
      "originalJudgmentId" TEXT NOT NULL,
      "finalJudgmentId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "reason" TEXT NOT NULL,
      "resolution" TEXT,
      "resolvedWinnerId" TEXT,
      "notes" TEXT,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "resolvedAt" TIMESTAMP(3),
      CONSTRAINT "ReviewCase_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReviewCase_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ReviewCase_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ReviewCase_resolvedWinnerId_fkey" FOREIGN KEY ("resolvedWinnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  ` },
  { id: "review_case_unique", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "ReviewCase_challengeId_key" ON "ReviewCase" ("challengeId")` },
  { id: "review_case_status_idx", sql: `CREATE INDEX IF NOT EXISTS "ReviewCase_status_createdAt_idx" ON "ReviewCase" ("status", "createdAt")` },
  { id: "review_case_requester_idx", sql: `CREATE INDEX IF NOT EXISTS "ReviewCase_requestedByUserId_idx" ON "ReviewCase" ("requestedByUserId")` },
  { id: "review_case_low_confidence_backfill", sql: `
    INSERT INTO "ReviewCase" (
      "id", "challengeId", "requestedByUserId", "reviewerUserId",
      "originalJudgmentId", "status", "reason", "expiresAt", "createdAt", "updatedAt"
    )
    SELECT
      'review_' || md5(c."id" || random()::text), c."id", NULL, NULL,
      j."id", 'pending', 'Automatic review: AI confidence below 0.85',
      NOW() + INTERVAL '72 hours', NOW(), NOW()
    FROM "Challenge" c
    JOIN LATERAL (
      SELECT "id", "confidence" FROM "Judgment"
      WHERE "challengeId" = c."id" AND "method" = 'ai' AND "status" = 'completed'
      ORDER BY "createdAt" DESC LIMIT 1
    ) j ON true
    WHERE c."status"::text = 'disputed'
      AND COALESCE(j."confidence", 0) < 0.85
    ON CONFLICT ("challengeId") DO NOTHING
  ` },
];

const BLOCKED_IDS = new Set(["evidence_unique_challenge_user", "review_case_low_confidence_backfill"]);
const reviewedDDL = DDL.filter((statement) => !BLOCKED_IDS.has(statement.id));
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function inspectSchema() {
  // Explicit read-only transaction: this path cannot run DDL or inspect rows.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const tables = await tx.$queryRawUnsafe(`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    const columns = await tx.$queryRawUnsafe(`SELECT table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
    const types = await tx.$queryRawUnsafe(`SELECT t.typname AS type_name, t.typtype::text AS kind, e.enumlabel AS enum_value FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid = t.oid WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`);
    const indexes = await tx.$queryRawUnsafe(`SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`);
    const constraints = await tx.$queryRawUnsafe(`SELECT c.relname AS table_name, con.conname AS constraint_name, con.contype::text AS kind, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY c.relname, con.conname`);
    return { tables, columns, types, indexes, constraints };
  });
}

async function handle(req: NextRequest, inspectOnly = false) {
  const token = req.headers.get("x-diag-token");
  if (!process.env.DIAG_TOKEN || token !== process.env.DIAG_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const apply = req.nextUrl.searchParams.get("apply") === "1";

  if (inspectOnly || req.nextUrl.searchParams.get("inspect") === "1") {
    if (apply) return json({ error: "Inspection cannot be combined with apply" }, 400);
    try {
      return json({ mode: "inspect", schema: "public", inventory: await inspectSchema(), availableStatements: reviewedDDL, blockedIds: [...BLOCKED_IDS] });
    } catch {
      return json({ error: "Schema inspection failed" }, 500);
    }
  }

  const queryIds = req.nextUrl.searchParams.getAll("ids").flatMap((value) => value.split(",")).map((id) => id.trim());
  let bodyIds: unknown;
  if (req.body) {
    const text = await req.text();
    if (text.length > 16_384) return json({ error: "Request body too large" }, 413);
    if (text.trim()) {
      try {
        const body = JSON.parse(text);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
        bodyIds = body.ids;
      } catch { return json({ error: "Expected a JSON object with an ids array" }, 400); }
    }
  }
  if (bodyIds !== undefined && (!Array.isArray(bodyIds) || !bodyIds.every((id) => typeof id === "string"))) {
    return json({ error: "ids must be an array of statement IDs" }, 400);
  }
  if (queryIds.length && bodyIds !== undefined) return json({ error: "Select ids in either the query or body" }, 400);
  const ids = [...new Set(queryIds.length ? queryIds : bodyIds as string[] | undefined ?? [])];
  if (ids.some((id) => BLOCKED_IDS.has(id))) return json({ error: "Destructive and data-backfill statements are prohibited", blockedIds: ids.filter((id) => BLOCKED_IDS.has(id)) }, 400);
  const unknownIds = ids.filter((id) => !reviewedDDL.some((statement) => statement.id === id));
  if (unknownIds.length) return json({ error: "Unknown statement IDs", unknownIds }, 400);
  if (apply && !ids.length) return json({ error: "Explicit reviewed statement ids are required to apply" }, 400);
  // Execute in the catalog's dependency order, regardless of request order.
  const selected = ids.length ? reviewedDDL.filter((statement) => ids.includes(statement.id)) : reviewedDDL;

  // Identify which DB we're about to touch so dev can cross-check
  const dbHost = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();

  const results: Array<{ id: string; ok: boolean; applied: boolean; ms?: number; error?: string }> = [];

  if (!apply) {
    return json({
      mode: "dry-run",
      databaseHost: dbHost,
      wouldRun: selected.map((d) => d.id),
      statements: selected,
      blockedIds: [...BLOCKED_IDS],
      note: "Inspect with ?inspect=1. Apply explicitly selected reviewed ids with ?apply=1&ids=... or JSON {ids:[...]}.",
    });
  }

  for (const stmt of selected) {
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

  return json({
    mode: "apply",
    databaseHost: dbHost,
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    results,
  });
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req, true); }
