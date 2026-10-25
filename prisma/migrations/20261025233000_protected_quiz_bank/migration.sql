-- Add-only staging for a server-private, externally reviewed Quiz bank.
-- Never migrate production or set QUIZ_PROTECTED_BANK_ENABLED as part of CI.
-- No changes to Challenge, credit, user, judgment or existing Quiz rows.
CREATE TABLE "QuizProtectedQuestion" (
  "id" TEXT NOT NULL,
  "bankVersion" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "choicesJson" TEXT NOT NULL,
  "answerIndex" INTEGER NOT NULL,
  "reviewSignature" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizProtectedQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizProtectedQuestion_answerIndex_check"
     CHECK ("answerIndex" BETWEEN 0 AND 3),
  CONSTRAINT "QuizProtectedQuestion_reviewSignature_check"
     CHECK (length("reviewSignature") = 128),
  CONSTRAINT "QuizProtectedQuestion_version_check"
     CHECK (length("bankVersion") BETWEEN 12 AND 128)
);
CREATE INDEX "QuizProtectedQuestion_bankVersion_topic_retiredAt_idx"
  ON "QuizProtectedQuestion"("bankVersion","topic","retiredAt");
