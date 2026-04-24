/**
 * The 10-gamble end-to-end harness. Each `test(...)` block is ONE complete
 * gamble recorded to its own WebM video:
 *
 *   1. Player A signs into a fresh browser context, goes to /, types a bet
 *      into the real chat composer, the agent chats back, A confirms "create".
 *   2. A's share link surfaces → we extract challengeId.
 *   3. Player B signs into a separate browser context, goes to /join/{id},
 *      clicks Accept.
 *   4. Both players submit text evidence (asymmetric so the AI picks a clear
 *      winner).
 *   5. AI judgment runs on real OpenAI (gpt-4o-mini) — writes a Judgment row,
 *      status → disputed.
 *   6. A visits /market/{id}, clicks "Confirm AI recommendation and settle".
 *   7. Credits settle and the challenge becomes "settled".
 *
 * Playwright records each context's video separately. The harness prints the
 * challengeId + winner + final credits so you can trace every run back to a
 * real DB row.
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

async function runOneGamble(
  browser: Browser,
  idx: number,
  prompt: string,
  creatorEvidence: string,
  opponentEvidence: string,
) {
  const gambleLabel = `gamble-${String(idx).padStart(2, "0")}`;
  const recordingDir = path.join(RECORDINGS_DIR, gambleLabel);
  fs.mkdirSync(recordingDir, { recursive: true });

  // Separate contexts = separate cookies = two different logged-in users in
  // the same recording window.
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

    // Let the creator land on the post-create success UI
    await pageA.waitForTimeout(1500);

    // Opponent accepts
    await acceptFromJoinPage(pageB, challengeId);

    // Both submit text evidence (asymmetric — A succeeds, B fails)
    await submitTextEvidenceViaApi(pageA, challengeId, creatorEvidence);
    await submitTextEvidenceViaApi(pageB, challengeId, opponentEvidence);

    // Trigger real AI judgment
    const verdict = await triggerJudge(pageA, challengeId);
    console.log(`[${gambleLabel}] AI verdict: winner=${verdict.winnerUsername} confidence=${verdict.confidence}`);
    expect(verdict.winnerUsername).toBe(PLAYER_A.username);

    // Creator confirms, stakes settle
    await confirmVerdictOnMarketPage(pageA, challengeId);

    // Opponent opens final settled market page for visual closure in the recording
    await pageB.goto(`http://localhost:3000/market/${challengeId}`, { waitUntil: "domcontentloaded" });
    await pageB.waitForTimeout(2000);

    console.log(`[${gambleLabel}] ✅ settled`);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
}

BETS.forEach((bet, i) => {
  test(`gamble ${i + 1}: ${bet.prompt.slice(0, 60)}`, async () => {
    const browser = await chromium.launch();
    try {
      await runOneGamble(browser, i + 1, bet.prompt, bet.creatorEvidence, bet.opponentEvidence);
    } finally {
      await browser.close();
    }
  });
});
