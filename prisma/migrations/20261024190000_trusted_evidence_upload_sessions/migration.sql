CREATE TABLE "TrustedEvidenceUpload" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "expectedSizeBytes" INTEGER NOT NULL,
    "recordingSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "sha256" TEXT,
    "observedSizeBytes" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustedEvidenceUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedEvidenceUpload_objectKey_key"
    ON "TrustedEvidenceUpload"("objectKey");
CREATE INDEX "TrustedEvidenceUpload_challengeId_userId_status_idx"
    ON "TrustedEvidenceUpload"("challengeId", "userId", "status");
CREATE INDEX "TrustedEvidenceUpload_expiresAt_status_idx"
    ON "TrustedEvidenceUpload"("expiresAt", "status");
ALTER TABLE "TrustedEvidenceUpload"
    ADD CONSTRAINT "TrustedEvidenceUpload_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedEvidenceUpload"
    ADD CONSTRAINT "TrustedEvidenceUpload_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
