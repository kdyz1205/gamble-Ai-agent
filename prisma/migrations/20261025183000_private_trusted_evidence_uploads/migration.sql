CREATE TABLE "TrustedEvidenceUpload" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "expectedSizeBytes" INTEGER NOT NULL,
  "evidenceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "sha256" TEXT,
  "observedSizeBytes" INTEGER,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrustedEvidenceUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrustedEvidenceUpload_size_check" CHECK ("expectedSizeBytes" > 0 AND "expectedSizeBytes" <= 104857600),
  CONSTRAINT "TrustedEvidenceUpload_status_check" CHECK ("status" IN ('issued','verified','consumed','revoked'))
);
CREATE UNIQUE INDEX "TrustedEvidenceUpload_objectKey_key" ON "TrustedEvidenceUpload"("objectKey");
CREATE INDEX "TrustedEvidenceUpload_challengeId_userId_status_idx" ON "TrustedEvidenceUpload"("challengeId","userId","status");
CREATE INDEX "TrustedEvidenceUpload_expiresAt_status_idx" ON "TrustedEvidenceUpload"("expiresAt","status");
CREATE UNIQUE INDEX "TrustedEvidenceUpload_evidenceId_key" ON "TrustedEvidenceUpload"("evidenceId");
ALTER TABLE "TrustedEvidenceUpload" ADD CONSTRAINT "TrustedEvidenceUpload_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedEvidenceUpload" ADD CONSTRAINT "TrustedEvidenceUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedEvidenceUpload" ADD CONSTRAINT "TrustedEvidenceUpload_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
