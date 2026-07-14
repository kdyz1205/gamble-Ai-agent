/**
 * Separate spec for 2 gambles run against PROD Neon DB instead of local
 * Supabase. Recordings go to gambles-recordings/neon-NN/ so the user can
 * compare side-by-side with the Supabase batch.
 *
 * PRE-REQ: before running, restart `npm run dev` with DATABASE_URL pointing
 * at the Neon pooler (see get_connection_string output), and re-run
 * seed-users.ts with that DATABASE_URL so player_a / player_b exist on Neon.
 *
 * POST: clean up the 2 created Challenge rows + CreditTx + Evidence +
 * Judgment + Participant + the 2 seeded Users on Neon — script does NOT
 * auto-clean (destructive data change), do it manually via Neon MCP after
 * reviewing results.
 */
import { test, expect, chromium, type Browser } from "@playwright/test";
import path from "path";
import fs from "fs";
import { BETS } from "./bets";
import {
  PLAYER_A,
  PLAYER_B,
  signInCredentials,
  driveCreateFlow,
  acceptFromJoinPage,
  submitTextEvidenceViaApi,
  triggerJudge,
  confirmVerdictOnMarketPage,
} from "./helpers";

const RECORDINGS_DIR = path.resolve(__dirname, "..", "..", "gambles-recordings");

// Use the 2 most-reliable bet scripts from the main set (both completed
// cleanly in under 35s on the Supabase run with confidence >= 0.95).
// Basketball 3pt for neon-01 (already landed on Neon), squats for neon-02
// (first omelette attempt hung at Accept — swap to a shorter prompt).
const NEON_BETS = [BETS[3], BETS[8]]; // basketball 3pt + 20 squats

async function runOneGamble(
  browser: Browser,
  idx: number,
  prompt: string,
  creatorEvidence: string,
  opponentEvidence: string,
) {
  const gambleLabel = `neon-${String(idx).padStart(2, "0")}`;
  const recordingDir = path.join(RECORDINGS_DIR, gambleLabel);
  fs.mkdirSync(recordingDir, { recursive: true });

  const ctxA = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: recordingDir, size: { width: 1280, height: 800 } },
  });
  const ctxB = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: recordingDir, size: { width: 1280, height: 800 } },
  });

  try {
    await signInCredentials(ctxA, PLAYER_A);
    await signInCredentials(ctxB, PLAYER_B);

    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    console.log(`[${gambleLabel}] prompt: ${prompt}`);
    const challengeId = await driveCreateFlow(pageA, prompt);
    console.log(`[${gambleLabel}] challengeId = ${challengeId}`);
    expect(challengeId).toMatch(/^[a-z0-9]{20,}$/);

    await pageA.waitForTimeout(1500);
    await acceptFromJoinPage(pageB, challengeId);
    await submitTextEvidenceViaApi(pageA, challengeId, creatorEvidence);
    await submitTextEvidenceViaApi(pageB, challengeId, opponentEvidence);

    const verdict = await triggerJudge(pageA, challengeId);
    console.log(`[${gambleLabel}] AI verdict: winner=${verdict.winnerUsername} confidence=${verdict.confidence}`);
    expect(verdict.winnerUsername).toBe(PLAYER_A.username);

    await confirmVerdictOnMarketPage(pageA, challengeId);

    await pageB.goto(`http://localhost:3000/market/${challengeId}`, { waitUntil: "domcontentloaded" });
    await pageB.waitForTimeout(2000);

    console.log(`[${gambleLabel}] ✅ settled  (NEON challengeId=${challengeId})`);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
}

NEON_BETS.forEach((bet, i) => {
  test(`neon-gamble ${i + 1}: ${bet.prompt.slice(0, 60)}`, async () => {
    const browser = await chromium.launch();
    try {
      await runOneGamble(browser, i + 1, bet.prompt, bet.creatorEvidence, bet.opponentEvidence);
    } finally {
      await browser.close();
    }
  });
});
