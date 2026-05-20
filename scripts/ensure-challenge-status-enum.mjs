import { Client } from "pg";

const STATUSES = [
  "draft",
  "generated_spec",
  "creator_confirmed",
  "waiting_for_opponent",
  "opponent_accepted",
  "escrow_locked",
  "evidence_window_open",
  "creator_submitted",
  "opponent_submitted",
  "ai_reviewing",
  "ai_verdict_ready",
  "dispute_window_open",
  "finalized",
  "settled",
  "opponent_declined",
  "cancelled",
  "expired",
  "evidence_missing",
  "evidence_invalid",
  "ai_inconclusive",
  "manual_review_required",
  "disputed",
  "refunded",
  "voided",
  "open",
  "matched",
  "live",
  "judging",
  "pending_settlement",
  "resolved",
  "void",
  "funded",
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("[status-enum] DATABASE_URL missing; skipping enum sync.");
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "livenessPrompt" TEXT`);
    await client.query(`ALTER TABLE "Judgment" ADD COLUMN IF NOT EXISTS "metricsJson" TEXT`);
    console.log("[status-enum] ensured liveness/judgment metric columns.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "UserDailyQuota" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "dateKey" TEXT NOT NULL,
        "specUsed" INTEGER NOT NULL DEFAULT 0,
        "judgeUsed" INTEGER NOT NULL DEFAULT 0,
        "videoJudgeUsed" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "UserDailyQuota_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UserDailyQuota_userId_dateKey_key" ON "UserDailyQuota" ("userId", "dateKey")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "UserDailyQuota_dateKey_idx" ON "UserDailyQuota" ("dateKey")`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'UserDailyQuota_userId_fkey'
        ) THEN
          ALTER TABLE "UserDailyQuota"
          ADD CONSTRAINT "UserDailyQuota_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
    console.log("[status-enum] ensured UserDailyQuota table and indexes.");

    const typeResult = await client.query(
      "SELECT 1 FROM pg_type WHERE typname = $1",
      ["ChallengeStatus"],
    );
    if (typeResult.rowCount === 0) {
      console.log("[status-enum] ChallengeStatus enum not present; status column is likely text.");
      return;
    }

    for (const status of STATUSES) {
      await client.query(`ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS '${status}'`);
    }
    console.log(`[status-enum] ensured ${STATUSES.length} ChallengeStatus values.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[status-enum] failed", error);
  process.exit(1);
});
