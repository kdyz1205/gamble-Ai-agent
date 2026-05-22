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
  // ── ChallengeStatus enum values (Neon DB uses a real Postgres ENUM; our
  //    Prisma schema treats status as String and introduced values the enum
  //    never got: pending_settlement, disputed, etc.). ALTER TYPE ADD VALUE
  //    IF NOT EXISTS is idempotent. Must run OUTSIDE any transaction block —
  //    Postgres rejects adding enum values inside a tx.                      ──
  { id: "enum_status_draft",              sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'draft'` },
  { id: "enum_status_generated_spec",     sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'generated_spec'` },
  { id: "enum_status_creator_confirmed",  sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'creator_confirmed'` },
  { id: "enum_status_waiting_for_opponent", sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'waiting_for_opponent'` },
  { id: "enum_status_opponent_accepted",  sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'opponent_accepted'` },
  { id: "enum_status_escrow_locked",      sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'escrow_locked'` },
  { id: "enum_status_evidence_window_open", sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'evidence_window_open'` },
  { id: "enum_status_creator_submitted",  sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'creator_submitted'` },
  { id: "enum_status_opponent_submitted", sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'opponent_submitted'` },
  { id: "enum_status_ai_reviewing",       sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'ai_reviewing'` },
  { id: "enum_status_ai_verdict_ready",   sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'ai_verdict_ready'` },
  { id: "enum_status_dispute_window_open", sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'dispute_window_open'` },
  { id: "enum_status_finalized",          sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'finalized'` },
  { id: "enum_status_open",               sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'open'` },
  { id: "enum_status_matched",            sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'matched'` },
  { id: "enum_status_live",               sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'live'` },
  { id: "enum_status_judging",            sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'judging'` },
  { id: "enum_status_pending_settlement", sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'pending_settlement'` },
  { id: "enum_status_disputed",           sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'disputed'` },
  { id: "enum_status_settled",            sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'settled'` },
  { id: "enum_status_opponent_declined",  sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'opponent_declined'` },
  { id: "enum_status_cancelled",          sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'cancelled'` },
  { id: "enum_status_expired",            sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'expired'` },
  { id: "enum_status_evidence_missing",   sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'evidence_missing'` },
  { id: "enum_status_evidence_invalid",   sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'evidence_invalid'` },
  { id: "enum_status_ai_inconclusive",    sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'ai_inconclusive'` },
  { id: "enum_status_manual_review_required", sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'manual_review_required'` },
  { id: "enum_status_refunded",           sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'refunded'` },
  { id: "enum_status_voided",             sql: `ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'voided'` },
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

  { id: "challenge_livenessPrompt",      sql: `ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "livenessPrompt" TEXT` },
  { id: "judgment_metricsJson",          sql: `ALTER TABLE "Judgment" ADD COLUMN IF NOT EXISTS "metricsJson" TEXT` },

  // Protocol compiler / quota foundation. Keep this route additive because
  // several live DBs have diverged from Prisma migration history.
  { id: "quota_userDailyQuota_table", sql: `
    CREATE TABLE IF NOT EXISTS "UserDailyQuota" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "dateKey" TEXT NOT NULL,
      "specUsed" INTEGER NOT NULL DEFAULT 0,
      "judgeUsed" INTEGER NOT NULL DEFAULT 0,
      "videoJudgeUsed" INTEGER NOT NULL DEFAULT 0,
      "transcribeUsed" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserDailyQuota_pkey" PRIMARY KEY ("id")
    )
  ` },
  { id: "quota_transcribeUsed", sql: `ALTER TABLE "UserDailyQuota" ADD COLUMN IF NOT EXISTS "transcribeUsed" INTEGER NOT NULL DEFAULT 0` },
  { id: "quota_unique_user_date", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "UserDailyQuota_userId_dateKey_key" ON "UserDailyQuota" ("userId", "dateKey")` },
  { id: "quota_idx_date", sql: `CREATE INDEX IF NOT EXISTS "UserDailyQuota_dateKey_idx" ON "UserDailyQuota" ("dateKey")` },
  { id: "quota_user_fk", sql: `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserDailyQuota_userId_fkey') THEN
        ALTER TABLE "UserDailyQuota" ADD CONSTRAINT "UserDailyQuota_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$
  ` },

  { id: "challenge_protocol_summary_columns", sql: `
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "protocolVersion" TEXT DEFAULT '2.0';
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "participantMode" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "outcomeType" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "evidenceMode" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "identityMode" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "locationMode" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "settlementProtocolMode" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "compilerProviderId" TEXT;
    ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "compilerModel" TEXT
  ` },
  { id: "challenge_protocol_table", sql: `
    CREATE TABLE IF NOT EXISTS "ChallengeProtocol" (
      "id" TEXT NOT NULL,
      "challengeId" TEXT NOT NULL,
      "version" TEXT NOT NULL,
      "rawPrompt" TEXT NOT NULL,
      "specJson" TEXT NOT NULL,
      "compilerProviderId" TEXT,
      "compilerModel" TEXT,
      "compilerCallJson" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ChallengeProtocol_pkey" PRIMARY KEY ("id")
    )
  ` },
  { id: "challenge_protocol_unique", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "ChallengeProtocol_challengeId_key" ON "ChallengeProtocol" ("challengeId")` },
  { id: "challenge_protocol_fk", sql: `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChallengeProtocol_challengeId_fkey') THEN
        ALTER TABLE "ChallengeProtocol" ADD CONSTRAINT "ChallengeProtocol_challengeId_fkey"
        FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$
  ` },
  { id: "participant_binding_table", sql: `
    CREATE TABLE IF NOT EXISTS "ParticipantBinding" (
      "id" TEXT NOT NULL,
      "challengeId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "participantId" TEXT,
      "role" TEXT NOT NULL,
      "displayName" TEXT,
      "expectedPosition" TEXT,
      "livenessCode" TEXT,
      "qrTokenHash" TEXT,
      "bindingStatus" TEXT NOT NULL DEFAULT 'pending',
      "identityConfidence" DOUBLE PRECISION,
      "identityCheckJson" TEXT,
      "verifiedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ParticipantBinding_pkey" PRIMARY KEY ("id")
    )
  ` },
  { id: "participant_binding_unique", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "ParticipantBinding_challengeId_userId_key" ON "ParticipantBinding" ("challengeId", "userId")` },
  { id: "participant_binding_idx_challenge", sql: `CREATE INDEX IF NOT EXISTS "ParticipantBinding_challengeId_idx" ON "ParticipantBinding" ("challengeId")` },
  { id: "participant_binding_fks", sql: `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParticipantBinding_challengeId_fkey') THEN
        ALTER TABLE "ParticipantBinding" ADD CONSTRAINT "ParticipantBinding_challengeId_fkey"
        FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParticipantBinding_userId_fkey') THEN
        ALTER TABLE "ParticipantBinding" ADD CONSTRAINT "ParticipantBinding_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParticipantBinding_participantId_fkey') THEN
        ALTER TABLE "ParticipantBinding" ADD CONSTRAINT "ParticipantBinding_participantId_fkey"
        FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$
  ` },
  { id: "recording_session_table", sql: `
    CREATE TABLE IF NOT EXISTS "RecordingSession" (
      "id" TEXT NOT NULL,
      "challengeId" TEXT NOT NULL,
      "createdByUserId" TEXT NOT NULL,
      "mode" TEXT NOT NULL,
      "protocolJson" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'started',
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "endedAt" TIMESTAMP(3),
      CONSTRAINT "RecordingSession_pkey" PRIMARY KEY ("id")
    )
  ` },
  { id: "recording_session_idx_challenge", sql: `CREATE INDEX IF NOT EXISTS "RecordingSession_challengeId_idx" ON "RecordingSession" ("challengeId")` },
  { id: "recording_session_fks", sql: `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordingSession_challengeId_fkey') THEN
        ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_challengeId_fkey"
        FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordingSession_createdByUserId_fkey') THEN
        ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_createdByUserId_fkey"
        FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$
  ` },
  { id: "evidence_check_table", sql: `
    CREATE TABLE IF NOT EXISTS "EvidenceCheck" (
      "id" TEXT NOT NULL,
      "evidenceId" TEXT NOT NULL,
      "challengeId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "protocolVersion" TEXT NOT NULL,
      "identityCheckJson" TEXT,
      "evidenceCheckJson" TEXT,
      "outcomeCheckJson" TEXT,
      "identityConfidence" DOUBLE PRECISION,
      "evidenceConfidence" DOUBLE PRECISION,
      "outcomeConfidence" DOUBLE PRECISION,
      "decision" TEXT NOT NULL,
      "blockingIssues" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EvidenceCheck_pkey" PRIMARY KEY ("id")
    )
  ` },
  { id: "evidence_check_unique", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "EvidenceCheck_evidenceId_key" ON "EvidenceCheck" ("evidenceId")` },
  { id: "evidence_check_idx_challenge", sql: `CREATE INDEX IF NOT EXISTS "EvidenceCheck_challengeId_idx" ON "EvidenceCheck" ("challengeId")` },
  { id: "evidence_check_idx_user", sql: `CREATE INDEX IF NOT EXISTS "EvidenceCheck_userId_idx" ON "EvidenceCheck" ("userId")` },
  { id: "evidence_check_fks", sql: `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvidenceCheck_evidenceId_fkey') THEN
        ALTER TABLE "EvidenceCheck" ADD CONSTRAINT "EvidenceCheck_evidenceId_fkey"
        FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvidenceCheck_challengeId_fkey') THEN
        ALTER TABLE "EvidenceCheck" ADD CONSTRAINT "EvidenceCheck_challengeId_fkey"
        FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvidenceCheck_userId_fkey') THEN
        ALTER TABLE "EvidenceCheck" ADD CONSTRAINT "EvidenceCheck_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$
  ` },
  { id: "ai_usage_log_table", sql: `
    CREATE TABLE IF NOT EXISTS "AiUsageLog" (
      "id" TEXT NOT NULL,
      "userId" TEXT,
      "challengeId" TEXT,
      "route" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "requestKind" TEXT NOT NULL,
      "inputTokens" INTEGER,
      "outputTokens" INTEGER,
      "totalTokens" INTEGER,
      "imageCount" INTEGER,
      "estimatedCostUsd" DOUBLE PRECISION,
      "durationMs" INTEGER,
      "responseId" TEXT,
      "metadataJson" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
    )
  ` },
  { id: "ai_usage_log_idx_user", sql: `CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog" ("userId", "createdAt")` },
  { id: "ai_usage_log_idx_challenge", sql: `CREATE INDEX IF NOT EXISTS "AiUsageLog_challengeId_createdAt_idx" ON "AiUsageLog" ("challengeId", "createdAt")` },
  { id: "ai_usage_log_idx_route", sql: `CREATE INDEX IF NOT EXISTS "AiUsageLog_route_createdAt_idx" ON "AiUsageLog" ("route", "createdAt")` },
  { id: "ai_usage_log_fks", sql: `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiUsageLog_userId_fkey') THEN
        ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiUsageLog_challengeId_fkey') THEN
        ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_challengeId_fkey"
        FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$
  ` },
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
