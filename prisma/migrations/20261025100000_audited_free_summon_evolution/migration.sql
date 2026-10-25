-- Add-only audited FREE cosmetic evolution receipts.
-- No touch to CreditTx, cash, Quest judgment, or purchased items.
CREATE TABLE "SummonEvolutionReceipt" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "professionId" TEXT NOT NULL,
  "fromForm" TEXT NOT NULL,
  "toForm" TEXT NOT NULL,
  "verifiedXp" INTEGER NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SummonEvolutionReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SummonEvolutionReceipt_valid_stages_check" CHECK (
    ("fromForm"='base' AND "toForm"='evolved' AND "verifiedXp">=350)
    OR ("fromForm"='evolved' AND "toForm"='ascended' AND "verifiedXp">=1600)
  )
);
CREATE UNIQUE INDEX "SummonEvolutionReceipt_requestKey_key"
  ON "SummonEvolutionReceipt"("requestKey");
CREATE UNIQUE INDEX "SummonEvolutionReceipt_instanceId_toForm_key"
  ON "SummonEvolutionReceipt"("instanceId", "toForm");
CREATE INDEX "SummonEvolutionReceipt_ownerId_createdAt_idx"
  ON "SummonEvolutionReceipt"("ownerId", "createdAt");
ALTER TABLE "SummonEvolutionReceipt"
  ADD CONSTRAINT "SummonEvolutionReceipt_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SummonEvolutionReceipt"
  ADD CONSTRAINT "SummonEvolutionReceipt_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "SummonInstance"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
