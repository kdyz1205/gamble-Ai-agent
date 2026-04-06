-- CreateTable
CREATE TABLE "JudgeJob" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tierId" INTEGER NOT NULL DEFAULT 1,
    "providerId" TEXT,
    "model" TEXT,
    "webhookUrl" TEXT,
    "error" TEXT,
    "resultJson" TEXT,
    "judgmentId" TEXT,
    "creditsUsed" INTEGER,
    "creditsRemaining" INTEGER,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JudgeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JudgeJob_challengeId_status_idx" ON "JudgeJob"("challengeId", "status");

-- AddForeignKey
ALTER TABLE "JudgeJob" ADD CONSTRAINT "JudgeJob_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeJob" ADD CONSTRAINT "JudgeJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeJob" ADD CONSTRAINT "JudgeJob_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "Judgment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
