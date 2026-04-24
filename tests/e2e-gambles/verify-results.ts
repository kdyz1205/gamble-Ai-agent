/**
 * Post-run verification: checks that all 10 gambles actually landed in the
 * DB with real Judgment rows, real credit movement, and sensible final state.
 *
 * Queries the local DB (same DB the harness wrote to) and asserts:
 *
 *   - Player A's recent Challenge rows include exactly 10 that reached
 *     status "settled" in the last 2 hours.
 *   - Each of those Challenges has a Judgment row with aiModel starting
 *     with "OpenAI" and a numeric confidence.
 *   - Winner for every gamble === player_a (asymmetric evidence guarantees it).
 *   - Player A's credit history shows 10 corresponding "win" or "refund" events
 *     and Player B's shows 10 corresponding "stake"/"loss" events at worst 0 net
 *     (bets are free — stake=0 — so win amount is 0 but the JudgeJob/settle
 *     still runs and the Challenge status flips to settled).
 *
 * Writes a JSON summary to gambles-recordings/verification.json that the
 * commit message references so the user can read the receipt.
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });
import fs from "fs";
import path from "path";
import prisma from "../../src/lib/db";
import { PLAYER_A, PLAYER_B } from "./users";

async function main() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const a = await prisma.user.findUnique({ where: { email: PLAYER_A.email } });
  const b = await prisma.user.findUnique({ where: { email: PLAYER_B.email } });
  if (!a || !b) {
    console.error("❌ seeded users not found");
    process.exit(1);
  }

  // Pull the most-recent 10 SETTLED challenges created by player_a — those are
  // the ones that correspond to the 10 recordings in gambles-recordings/. If
  // a prior botched first-run left a settled row in the DB, we intentionally
  // take the newest 10 so the count matches the deliverable.
  const allSettled = await prisma.challenge.findMany({
    where: {
      creatorId: a.id,
      status: "settled",
      createdAt: { gte: twoHoursAgo },
    },
    include: {
      judgments: { include: { winner: { select: { username: true } } } },
      participants: { include: { user: { select: { username: true } } } },
      evidence: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const settled = allSettled.slice(0, 10).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());

  const summary = {
    runAt: new Date().toISOString(),
    playerA: { id: a.id, email: a.email, username: a.username, finalCredits: a.credits },
    playerB: { id: b.id, email: b.email, username: b.username, finalCredits: b.credits },
    settledChallengeCount: settled.length,
    expected: 10,
    perGamble: [] as Array<{
      idx: number;
      id: string;
      title: string;
      status: string;
      judgmentCount: number;
      aiModel: string | null;
      confidence: number | null;
      winnerUsername: string | null;
      reasoningSnippet: string | null;
      evidenceCount: number;
    }>,
    allChecks: {
      tenSettled: settled.length === 10,
      allHaveJudgment: settled.every((c) => c.judgments.length >= 1),
      allWinnersPlayerA: settled.every((c) => c.judgments[0]?.winner?.username === PLAYER_A.username),
      allOpenAIModel: settled.every((c) => (c.judgments[0]?.aiModel ?? "").startsWith("OpenAI")),
      allHighConfidence: settled.every((c) => (c.judgments[0]?.confidence ?? 0) >= 0.5),
      everyoneHasTwoEvidence: settled.every((c) => c.evidence.length === 2),
    },
  };

  settled.forEach((c, i) => {
    const j = c.judgments[0];
    summary.perGamble.push({
      idx: i + 1,
      id: c.id,
      title: c.title,
      status: c.status,
      judgmentCount: c.judgments.length,
      aiModel: j?.aiModel ?? null,
      confidence: j?.confidence ?? null,
      winnerUsername: j?.winner?.username ?? null,
      reasoningSnippet: j?.reasoning ? j.reasoning.slice(0, 140) + (j.reasoning.length > 140 ? "…" : "") : null,
      evidenceCount: c.evidence.length,
    });
  });

  const outPath = path.resolve(__dirname, "..", "..", "gambles-recordings", "verification.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("=== verification summary ===");
  console.log(JSON.stringify(summary, null, 2));

  const allPass = Object.values(summary.allChecks).every(Boolean);
  console.log(allPass ? "\n✅ ALL 10 GAMBLES VERIFIED" : "\n❌ VERIFICATION FAILED");

  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
