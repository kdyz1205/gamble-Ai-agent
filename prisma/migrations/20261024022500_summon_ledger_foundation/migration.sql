-- Summon ledger foundation (additive only, no backfill or credit mutation).
-- Applied automatically only to the CI-isolated verification PostgreSQL for
-- this PR. Keep SUMMON_PERSISTENCE_ENABLED unset until production schema
-- deployment, repair verification and release approval are complete.
BEGIN;

CREATE TABLE "SummonInstance" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "speciesId" TEXT NOT NULL,
  "originKind" TEXT NOT NULL,
  "grantKey" TEXT NOT NULL,
  "professionId" TEXT,
  "occupationId" TEXT,
  "rarity" TEXT NOT NULL DEFAULT 'starter',
  "form" TEXT NOT NULL DEFAULT 'base',
  "status" TEXT NOT NULL DEFAULT 'owned',
  "catalogVersion" TEXT NOT NULL DEFAULT 'summon-professions-v1',
  "parentOneId" TEXT,
  "parentTwoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SummonInstance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SummonInstance_grantKey_key" ON "SummonInstance"("grantKey");
CREATE INDEX "SummonInstance_ownerId_status_createdAt_idx"
  ON "SummonInstance"("ownerId", "status", "createdAt");
CREATE INDEX "SummonInstance_speciesId_rarity_idx"
  ON "SummonInstance"("speciesId", "rarity");
ALTER TABLE "SummonInstance" ADD CONSTRAINT "SummonInstance_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProfessionXpEvent" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "challengeId" TEXT,
  "eventKey" TEXT NOT NULL,
  "professionId" TEXT NOT NULL,
  "awardType" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "ruleVersion" TEXT NOT NULL DEFAULT 'profession-xp-v1',
  "sourceReceipt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionXpEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfessionXpEvent_eventKey_key" ON "ProfessionXpEvent"("eventKey");
CREATE INDEX "ProfessionXpEvent_ownerId_professionId_createdAt_idx"
  ON "ProfessionXpEvent"("ownerId", "professionId", "createdAt");
CREATE INDEX "ProfessionXpEvent_challengeId_idx" ON "ProfessionXpEvent"("challengeId");
ALTER TABLE "ProfessionXpEvent" ADD CONSTRAINT "ProfessionXpEvent_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionXpEvent" ADD CONSTRAINT "ProfessionXpEvent_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SummonTicket" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "grantKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'available',
  "professionId" TEXT NOT NULL,
  "spentAt" TIMESTAMP(3),
  "spentByGrant" TEXT,
  "sourceVersion" TEXT NOT NULL DEFAULT 'free-tickets-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SummonTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SummonTicket_grantKey_key" ON "SummonTicket"("grantKey");
CREATE UNIQUE INDEX "SummonTicket_spentByGrant_key" ON "SummonTicket"("spentByGrant");
CREATE INDEX "SummonTicket_ownerId_status_idx" ON "SummonTicket"("ownerId", "status");
ALTER TABLE "SummonTicket" ADD CONSTRAINT "SummonTicket_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
