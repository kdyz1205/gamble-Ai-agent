-- Additive receipt ledger: spendable-free-ticket -> owned Summon.
-- No changes to cash, credits, wagers, Quest judgment, or existing rows.
CREATE TABLE "SummonDrawReceipt" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "professionId" TEXT NOT NULL,
  "occupationId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "rarity" TEXT NOT NULL,
  "pityKind" TEXT NOT NULL,
  "randomValue" INTEGER NOT NULL,
  "effectiveWeights" TEXT NOT NULL,
  "rareMissesBefore" INTEGER NOT NULL,
  "epicMissesBefore" INTEGER NOT NULL,
  "rareMissesAfter" INTEGER NOT NULL,
  "epicMissesAfter" INTEGER NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SummonDrawReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SummonDrawReceipt_randomValue_check" CHECK ("randomValue">=0 AND "randomValue"<1000000000),
  CONSTRAINT "SummonDrawReceipt_ordinal_check" CHECK ("ordinal">=1 AND "ordinal"<=1200),
  CONSTRAINT "SummonDrawReceipt_pity_check" CHECK (
    "rareMissesBefore" BETWEEN 0 AND 19 AND "rareMissesAfter" BETWEEN 0 AND 19
    AND "epicMissesBefore" BETWEEN 0 AND 79 AND "epicMissesAfter" BETWEEN 0 AND 79)
);
CREATE UNIQUE INDEX "SummonDrawReceipt_requestKey_key" ON "SummonDrawReceipt"("requestKey");
CREATE UNIQUE INDEX "SummonDrawReceipt_ticketId_key" ON "SummonDrawReceipt"("ticketId");
CREATE UNIQUE INDEX "SummonDrawReceipt_instanceId_key" ON "SummonDrawReceipt"("instanceId");
CREATE UNIQUE INDEX "SummonDrawReceipt_ownerId_ordinal_key" ON "SummonDrawReceipt"("ownerId","ordinal");
CREATE INDEX "SummonDrawReceipt_ownerId_createdAt_idx" ON "SummonDrawReceipt"("ownerId","createdAt");
ALTER TABLE "SummonDrawReceipt" ADD CONSTRAINT "SummonDrawReceipt_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SummonDrawReceipt" ADD CONSTRAINT "SummonDrawReceipt_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SummonTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SummonDrawReceipt" ADD CONSTRAINT "SummonDrawReceipt_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "SummonInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
