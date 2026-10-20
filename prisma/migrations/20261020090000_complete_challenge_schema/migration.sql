-- Bring fresh installs to the canonical quest schema without rewriting records.
-- Existing manually added columns/indexes are retained. A duplicate proof pair
-- makes the unique index fail and rolls back this migration; never delete proof.
BEGIN;

ALTER TABLE "Challenge"
  ADD COLUMN IF NOT EXISTS "arbiter" TEXT,
  ADD COLUMN IF NOT EXISTS "disputeWindow" TEXT,
  ADD COLUMN IF NOT EXISTS "eventTime" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceHash" TEXT,
  ADD COLUMN IF NOT EXISTS "fallbackRule" TEXT,
  ADD COLUMN IF NOT EXISTS "joinWindow" TEXT,
  ADD COLUMN IF NOT EXISTS "marketType" TEXT NOT NULL DEFAULT 'challenge',
  ADD COLUMN IF NOT EXISTS "paramsHash" TEXT,
  ADD COLUMN IF NOT EXISTS "proofSource" TEXT,
  ADD COLUMN IF NOT EXISTS "proofWindow" TEXT,
  ADD COLUMN IF NOT EXISTS "proposition" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionHash" TEXT,
  ADD COLUMN IF NOT EXISTS "settlementMode" TEXT NOT NULL DEFAULT 'mutual_confirmation',
  ADD COLUMN IF NOT EXISTS "stakeToken" TEXT NOT NULL DEFAULT 'credits',
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'private';
-- Changes future inserts only; preserve every existing visibility value.
ALTER TABLE "Challenge" ALTER COLUMN "isPublic" SET DEFAULT false;

ALTER TABLE "Evidence"
  ADD COLUMN IF NOT EXISTS "prepareError" TEXT,
  ADD COLUMN IF NOT EXISTS "preparedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "preparedDurationSec" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "preparedFrames" TEXT,
  ADD COLUMN IF NOT EXISTS "preparedMode" TEXT;

ALTER TABLE "JudgeJob"
  ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "ActivityEvent_challengeId_idx" ON "ActivityEvent"("challengeId");
CREATE INDEX IF NOT EXISTS "Challenge_status_isPublic_createdAt_idx" ON "Challenge"("status", "isPublic", "createdAt");
CREATE INDEX IF NOT EXISTS "Challenge_creatorId_createdAt_idx" ON "Challenge"("creatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Challenge_status_updatedAt_idx" ON "Challenge"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CreditTx_userId_createdAt_idx" ON "CreditTx"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditTx_challengeId_idx" ON "CreditTx"("challengeId");
CREATE INDEX IF NOT EXISTS "CreditTx_type_createdAt_idx" ON "CreditTx"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "Evidence_challengeId_idx" ON "Evidence"("challengeId");
CREATE UNIQUE INDEX IF NOT EXISTS "Evidence_challengeId_userId_key" ON "Evidence"("challengeId", "userId");
CREATE INDEX IF NOT EXISTS "JudgeJob_status_startedAt_idx" ON "JudgeJob"("status", "startedAt");

COMMIT;
