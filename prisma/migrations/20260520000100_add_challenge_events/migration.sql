CREATE TABLE "ChallengeEvent" (
  "id" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "protocolJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "maxParticipants" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChallengeEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventEntry" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ticketCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'joined',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaderboardEntry" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "rank" INTEGER,
  "evidenceId" TEXT,
  "validationStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChallengeEvent_creatorId_createdAt_idx" ON "ChallengeEvent"("creatorId", "createdAt");
CREATE INDEX "ChallengeEvent_status_createdAt_idx" ON "ChallengeEvent"("status", "createdAt");

CREATE UNIQUE INDEX "EventEntry_eventId_userId_key" ON "EventEntry"("eventId", "userId");
CREATE INDEX "EventEntry_eventId_idx" ON "EventEntry"("eventId");
CREATE INDEX "EventEntry_userId_joinedAt_idx" ON "EventEntry"("userId", "joinedAt");

CREATE INDEX "LeaderboardEntry_eventId_idx" ON "LeaderboardEntry"("eventId");
CREATE INDEX "LeaderboardEntry_userId_createdAt_idx" ON "LeaderboardEntry"("userId", "createdAt");
CREATE UNIQUE INDEX "LeaderboardEntry_eventId_userId_key" ON "LeaderboardEntry"("eventId", "userId");

ALTER TABLE "ChallengeEvent"
  ADD CONSTRAINT "ChallengeEvent_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventEntry"
  ADD CONSTRAINT "EventEntry_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "ChallengeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventEntry"
  ADD CONSTRAINT "EventEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaderboardEntry"
  ADD CONSTRAINT "LeaderboardEntry_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "ChallengeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaderboardEntry"
  ADD CONSTRAINT "LeaderboardEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
