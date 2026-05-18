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
