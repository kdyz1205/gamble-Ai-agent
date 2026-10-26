-- Atomic server-only private rounds and player-specific exposure receipts.
-- Existing public Quizzes, XP, wallet and Summon schemas remain unchanged.
CREATE TABLE "QuizPrivateRound" (
  "id" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "opponentId" TEXT NOT NULL,
  "bankVersion" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "questionIdsJson" TEXT NOT NULL,
  "answerCommitment" TEXT NOT NULL,
  "serverNonce" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizPrivateRound_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizPrivateRound_distinct_players_check"
    CHECK ("creatorId" <> "opponentId"),
  CONSTRAINT "QuizPrivateRound_commitment_check"
    CHECK (length("answerCommitment")=64 AND length("serverNonce")=64),
  CONSTRAINT "QuizPrivateRound_status_check"
    CHECK ("status" IN ('reserved','completed','void'))
);
CREATE UNIQUE INDEX "QuizPrivateRound_requestKey_key" ON "QuizPrivateRound"("requestKey");
CREATE INDEX "QuizPrivateRound_creatorId_createdAt_idx" ON "QuizPrivateRound"("creatorId","createdAt");
CREATE INDEX "QuizPrivateRound_opponentId_createdAt_idx" ON "QuizPrivateRound"("opponentId","createdAt");
ALTER TABLE "QuizPrivateRound" ADD CONSTRAINT "QuizPrivateRound_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuizPrivateRound" ADD CONSTRAINT "QuizPrivateRound_opponentId_fkey"
  FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuizPrivateExposure" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "bankVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizPrivateExposure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuizPrivateExposure_userId_bankVersion_questionId_key"
  ON "QuizPrivateExposure"("userId","bankVersion","questionId");
CREATE UNIQUE INDEX "QuizPrivateExposure_roundId_userId_questionId_key"
  ON "QuizPrivateExposure"("roundId","userId","questionId");
CREATE INDEX "QuizPrivateExposure_roundId_idx" ON "QuizPrivateExposure"("roundId");
ALTER TABLE "QuizPrivateExposure" ADD CONSTRAINT "QuizPrivateExposure_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "QuizPrivateRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuizPrivateExposure" ADD CONSTRAINT "QuizPrivateExposure_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuizPrivateExposure" ADD CONSTRAINT "QuizPrivateExposure_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "QuizProtectedQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
