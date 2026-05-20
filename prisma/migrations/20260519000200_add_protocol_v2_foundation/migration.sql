ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "protocolVersion" TEXT DEFAULT '2.0';
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "participantMode" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "outcomeType" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "evidenceMode" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "identityMode" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "locationMode" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "settlementProtocolMode" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "compilerProviderId" TEXT;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "compilerModel" TEXT;

CREATE TABLE "ChallengeProtocol" (
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
);

CREATE UNIQUE INDEX "ChallengeProtocol_challengeId_key" ON "ChallengeProtocol"("challengeId");

ALTER TABLE "ChallengeProtocol"
  ADD CONSTRAINT "ChallengeProtocol_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ParticipantBinding" (
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
);

CREATE UNIQUE INDEX "ParticipantBinding_challengeId_userId_key" ON "ParticipantBinding"("challengeId", "userId");
CREATE INDEX "ParticipantBinding_challengeId_idx" ON "ParticipantBinding"("challengeId");

ALTER TABLE "ParticipantBinding"
  ADD CONSTRAINT "ParticipantBinding_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantBinding"
  ADD CONSTRAINT "ParticipantBinding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantBinding"
  ADD CONSTRAINT "ParticipantBinding_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RecordingSession" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "protocolJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'started',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "RecordingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordingSession_challengeId_idx" ON "RecordingSession"("challengeId");

ALTER TABLE "RecordingSession"
  ADD CONSTRAINT "RecordingSession_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordingSession"
  ADD CONSTRAINT "RecordingSession_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EvidenceCheck" (
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
);

CREATE UNIQUE INDEX "EvidenceCheck_evidenceId_key" ON "EvidenceCheck"("evidenceId");
CREATE INDEX "EvidenceCheck_challengeId_idx" ON "EvidenceCheck"("challengeId");
CREATE INDEX "EvidenceCheck_userId_idx" ON "EvidenceCheck"("userId");

ALTER TABLE "EvidenceCheck"
  ADD CONSTRAINT "EvidenceCheck_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceCheck"
  ADD CONSTRAINT "EvidenceCheck_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceCheck"
  ADD CONSTRAINT "EvidenceCheck_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiUsageLog" (
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
);

CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");
CREATE INDEX "AiUsageLog_challengeId_createdAt_idx" ON "AiUsageLog"("challengeId", "createdAt");
CREATE INDEX "AiUsageLog_route_createdAt_idx" ON "AiUsageLog"("route", "createdAt");

ALTER TABLE "AiUsageLog"
  ADD CONSTRAINT "AiUsageLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiUsageLog"
  ADD CONSTRAINT "AiUsageLog_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
