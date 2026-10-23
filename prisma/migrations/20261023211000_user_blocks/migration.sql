-- Real account-scoped blocks. Idempotent intent is in the composite primary key.
-- This does not alter historical Quest, proof, or credit ledger rows.
CREATE TABLE "UserBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId","blockedId"),
    CONSTRAINT "UserBlock_no_self" CHECK ("blockerId" <> "blockedId")
);
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey"
  FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey"
  FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
