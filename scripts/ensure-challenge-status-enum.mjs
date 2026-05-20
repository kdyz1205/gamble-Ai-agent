import { Client } from "pg";

const STATUSES = [
  "draft",
  "generated_spec",
  "creator_confirmed",
  "waiting_for_opponent",
  "opponent_accepted",
  "escrow_locked",
  "evidence_window_open",
  "creator_submitted",
  "opponent_submitted",
  "ai_reviewing",
  "ai_verdict_ready",
  "dispute_window_open",
  "finalized",
  "settled",
  "opponent_declined",
  "cancelled",
  "expired",
  "evidence_missing",
  "evidence_invalid",
  "ai_inconclusive",
  "manual_review_required",
  "disputed",
  "refunded",
  "voided",
  "open",
  "matched",
  "live",
  "judging",
  "pending_settlement",
  "resolved",
  "void",
  "funded",
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("[status-enum] DATABASE_URL missing; skipping enum sync.");
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "livenessPrompt" TEXT`);
    await client.query(`ALTER TABLE "Judgment" ADD COLUMN IF NOT EXISTS "metricsJson" TEXT`);
    console.log("[status-enum] ensured liveness/judgment metric columns.");

    await client.query(`
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
    `);
    await client.query(`ALTER TABLE "UserDailyQuota" ADD COLUMN IF NOT EXISTS "transcribeUsed" INTEGER NOT NULL DEFAULT 0`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UserDailyQuota_userId_dateKey_key" ON "UserDailyQuota" ("userId", "dateKey")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "UserDailyQuota_dateKey_idx" ON "UserDailyQuota" ("dateKey")`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'UserDailyQuota_userId_fkey'
        ) THEN
          ALTER TABLE "UserDailyQuota"
          ADD CONSTRAINT "UserDailyQuota_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
    console.log("[status-enum] ensured UserDailyQuota table and indexes.");

    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "protocolVersion" TEXT DEFAULT '2.0'`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "participantMode" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "outcomeType" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "evidenceMode" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "identityMode" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "locationMode" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "settlementProtocolMode" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "compilerProviderId" TEXT`);
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "compilerModel" TEXT`);

    await client.query(`
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
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ChallengeProtocol_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ChallengeProtocol_challengeId_key" ON "ChallengeProtocol" ("challengeId")`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChallengeProtocol_challengeId_fkey') THEN
          ALTER TABLE "ChallengeProtocol"
          ADD CONSTRAINT "ChallengeProtocol_challengeId_fkey"
          FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await client.query(`
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
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ParticipantBinding_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ParticipantBinding_challengeId_userId_key" ON "ParticipantBinding" ("challengeId", "userId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "ParticipantBinding_challengeId_idx" ON "ParticipantBinding" ("challengeId")`);
    await client.query(`
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
    `);

    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "RecordingSession_challengeId_idx" ON "RecordingSession" ("challengeId")`);
    await client.query(`
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
    `);

    await client.query(`
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
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "EvidenceCheck_evidenceId_key" ON "EvidenceCheck" ("evidenceId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "EvidenceCheck_challengeId_idx" ON "EvidenceCheck" ("challengeId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "EvidenceCheck_userId_idx" ON "EvidenceCheck" ("userId")`);
    await client.query(`
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
    `);

    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog" ("userId", "createdAt")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "AiUsageLog_challengeId_createdAt_idx" ON "AiUsageLog" ("challengeId", "createdAt")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "AiUsageLog_route_createdAt_idx" ON "AiUsageLog" ("route", "createdAt")`);
    await client.query(`
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
    `);
    console.log("[status-enum] ensured ProtocolSpecV2 foundation tables and columns.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "ChallengeEvent" (
        "id" TEXT NOT NULL,
        "creatorId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "protocolJson" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'open',
        "maxParticipants" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ChallengeEvent_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "ChallengeEvent_creatorId_createdAt_idx" ON "ChallengeEvent" ("creatorId", "createdAt")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "ChallengeEvent_status_createdAt_idx" ON "ChallengeEvent" ("status", "createdAt")`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChallengeEvent_creatorId_fkey') THEN
          ALTER TABLE "ChallengeEvent" ADD CONSTRAINT "ChallengeEvent_creatorId_fkey"
          FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "EventEntry" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "ticketCode" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'joined',
        "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EventEntry_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "EventEntry_eventId_userId_key" ON "EventEntry" ("eventId", "userId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "EventEntry_eventId_idx" ON "EventEntry" ("eventId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "EventEntry_userId_joinedAt_idx" ON "EventEntry" ("userId", "joinedAt")`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventEntry_eventId_fkey') THEN
          ALTER TABLE "EventEntry" ADD CONSTRAINT "EventEntry_eventId_fkey"
          FOREIGN KEY ("eventId") REFERENCES "ChallengeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventEntry_userId_fkey') THEN
          ALTER TABLE "EventEntry" ADD CONSTRAINT "EventEntry_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "LeaderboardEntry" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "score" DOUBLE PRECISION,
        "rank" INTEGER,
        "evidenceId" TEXT,
        "validationStatus" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "LeaderboardEntry_eventId_idx" ON "LeaderboardEntry" ("eventId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "LeaderboardEntry_userId_createdAt_idx" ON "LeaderboardEntry" ("userId", "createdAt")`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "LeaderboardEntry_eventId_userId_key" ON "LeaderboardEntry" ("eventId", "userId")`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaderboardEntry_eventId_fkey') THEN
          ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_eventId_fkey"
          FOREIGN KEY ("eventId") REFERENCES "ChallengeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaderboardEntry_userId_fkey') THEN
          ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
    console.log("[status-enum] ensured ChallengeEvent/EventEntry/LeaderboardEntry tables.");

    const typeResult = await client.query(
      "SELECT 1 FROM pg_type WHERE typname = $1",
      ["ChallengeStatus"],
    );
    if (typeResult.rowCount === 0) {
      console.log("[status-enum] ChallengeStatus enum not present; status column is likely text.");
      return;
    }

    for (const status of STATUSES) {
      await client.query(`ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS '${status}'`);
    }
    console.log(`[status-enum] ensured ${STATUSES.length} ChallengeStatus values.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[status-enum] failed", error);
  process.exit(1);
});
