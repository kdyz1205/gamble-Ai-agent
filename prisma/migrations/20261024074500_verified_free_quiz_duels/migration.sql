-- Additive, free-only deterministic two-person quiz receipts.
-- No Credits, Judgment, existing Quest or User columns are rewritten.
CREATE TABLE "QuizDuel" (
  "challengeId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "bankVersion" TEXT NOT NULL,
  "questionIds" TEXT NOT NULL,
  "answerCommitment" TEXT NOT NULL,
  "invitedUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "startedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "winnerId" TEXT,
  "resultJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "QuizDuel_pkey" PRIMARY KEY ("challengeId")
);

CREATE TABLE "QuizAttempt" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "answersJson" TEXT NOT NULL,
  "answerHash" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuizDuel_requestKey_key" ON "QuizDuel"("requestKey");
CREATE INDEX "QuizDuel_status_expiresAt_idx" ON "QuizDuel"("status","expiresAt");
CREATE UNIQUE INDEX "QuizAttempt_challengeId_userId_key" ON "QuizAttempt"("challengeId","userId");
CREATE INDEX "QuizAttempt_userId_submittedAt_idx" ON "QuizAttempt"("userId","submittedAt");

ALTER TABLE "QuizDuel" ADD CONSTRAINT "QuizDuel_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "QuizDuel"("challengeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
