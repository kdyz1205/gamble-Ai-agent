CREATE TABLE "UserDailyQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "specUsed" INTEGER NOT NULL DEFAULT 0,
    "judgeUsed" INTEGER NOT NULL DEFAULT 0,
    "videoJudgeUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDailyQuota_userId_dateKey_key" ON "UserDailyQuota"("userId", "dateKey");
CREATE INDEX "UserDailyQuota_dateKey_idx" ON "UserDailyQuota"("dateKey");

ALTER TABLE "UserDailyQuota" ADD CONSTRAINT "UserDailyQuota_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
