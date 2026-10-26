CREATE TABLE "VerifiedXpApproval" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "finalJudgmentId" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL DEFAULT 'private-proof-manual-xp-v1',
  "status" TEXT NOT NULL DEFAULT 'approved',
  "reason" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "VerifiedXpApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VerifiedXpApproval_state_check" CHECK ("status" IN ('approved','revoked')),
  CONSTRAINT "VerifiedXpApproval_source_hash_check" CHECK (length("sourceFingerprint") = 64)
);
CREATE UNIQUE INDEX "VerifiedXpApproval_challengeId_ownerId_key" ON "VerifiedXpApproval"("challengeId", "ownerId");
CREATE INDEX "VerifiedXpApproval_reviewerUserId_approvedAt_idx" ON "VerifiedXpApproval"("reviewerUserId", "approvedAt");
CREATE INDEX "VerifiedXpApproval_status_approvedAt_idx" ON "VerifiedXpApproval"("status", "approvedAt");
ALTER TABLE "VerifiedXpApproval"
  ADD CONSTRAINT "VerifiedXpApproval_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VerifiedXpApproval"
  ADD CONSTRAINT "VerifiedXpApproval_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VerifiedXpApproval"
  ADD CONSTRAINT "VerifiedXpApproval_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
