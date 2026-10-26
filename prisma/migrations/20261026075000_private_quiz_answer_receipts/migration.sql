-- Add-only, zero-reward private Quiz answer receipts and final outcome.
-- The public Quiz, settled Quests, XP, ticket and credit ledgers are unchanged.
ALTER TABLE "QuizPrivateRound"
  ADD COLUMN "resultJson" TEXT,
  ADD COLUMN "resultHash" TEXT,
  ADD COLUMN "finalizedAt" TIMESTAMP(3);
ALTER TABLE "QuizPrivateRound" ADD CONSTRAINT "QuizPrivateRound_result_shape_check"
  CHECK (
    ("status"='reserved' AND "resultJson" IS NULL AND "resultHash" IS NULL AND "finalizedAt" IS NULL)
    OR ("status" IN ('completed','void') AND "resultJson" IS NOT NULL AND
        length("resultHash")=64 AND "finalizedAt" IS NOT NULL)
  );
CREATE TABLE "QuizPrivateAttempt" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "answersJson" TEXT NOT NULL,
  "answerHash" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizPrivateAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizPrivateAttempt_score_check" CHECK ("score" BETWEEN 0 AND 3),
  CONSTRAINT "QuizPrivateAttempt_hash_check" CHECK (length("answerHash")=64)
);
CREATE UNIQUE INDEX "QuizPrivateAttempt_roundId_userId_key"
  ON "QuizPrivateAttempt"("roundId","userId");
CREATE INDEX "QuizPrivateAttempt_userId_createdAt_idx"
  ON "QuizPrivateAttempt"("userId","createdAt");
ALTER TABLE "QuizPrivateAttempt" ADD CONSTRAINT "QuizPrivateAttempt_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "QuizPrivateRound"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuizPrivateAttempt" ADD CONSTRAINT "QuizPrivateAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
