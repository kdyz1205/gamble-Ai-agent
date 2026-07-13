-- Additive verdict-consent and human-review workflow.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isReviewer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreditTx" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CreditTx_idempotencyKey_key" ON "CreditTx"("idempotencyKey");

CREATE TABLE IF NOT EXISTS "VerdictResponse" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VerdictResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReviewCase" (
    "id" TEXT NOT NULL,
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
    CONSTRAINT "ReviewCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VerdictResponse_challengeId_userId_key" ON "VerdictResponse"("challengeId", "userId");
CREATE INDEX IF NOT EXISTS "VerdictResponse_challengeId_decision_idx" ON "VerdictResponse"("challengeId", "decision");
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewCase_challengeId_key" ON "ReviewCase"("challengeId");
CREATE INDEX IF NOT EXISTS "ReviewCase_status_createdAt_idx" ON "ReviewCase"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewCase_requestedByUserId_idx" ON "ReviewCase"("requestedByUserId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VerdictResponse_challengeId_fkey') THEN
    ALTER TABLE "VerdictResponse" ADD CONSTRAINT "VerdictResponse_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VerdictResponse_userId_fkey') THEN
    ALTER TABLE "VerdictResponse" ADD CONSTRAINT "VerdictResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewCase_challengeId_fkey') THEN
    ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewCase_requestedByUserId_fkey') THEN
    ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewCase_reviewerUserId_fkey') THEN
    ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewCase_resolvedWinnerId_fkey') THEN
    ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_resolvedWinnerId_fkey" FOREIGN KEY ("resolvedWinnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Existing low-confidence recommendations were previously stranded in
-- `disputed`. Put them into the same visible queue as new recommendations.
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
ON CONFLICT ("challengeId") DO NOTHING;
