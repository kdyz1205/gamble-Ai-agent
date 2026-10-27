import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Pool } from "pg";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3017";
test.use({ ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}), video: "on" });

test("registered friends stake five credits, submit real text proof, wait deadline and consent to exactly one settlement", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  test.skip(!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "postgresql://missing").hostname), "Explicit isolated local PostgreSQL required");
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const a = await browser.newContext({ reducedMotion: "reduce", recordVideo: { dir: testInfo.outputPath("creator-video") } });
  const b = await browser.newContext({ reducedMotion: "reduce", recordVideo: { dir: testInfo.outputPath("opponent-video") } });
  const userIds: string[] = [];
  let challengeId = "";
  async function register(context: BrowserContext, label: string) {
    const page = await context.newPage();
    const email = `journey-${label}-${runId}@example.invalid`;
    const username = `journey_${label}_${runId}`;
    await page.goto(`${BASE}/summons`);
    await page.locator("textarea").first().fill("badminton first to 3 points");
    await page.getByRole("button", { name: "Summon", exact: true }).click();
    const portal = page.locator(".auth-portal");
    await expect(portal.getByText("Join Summoners World", { exact: true })).toBeVisible();
    await portal.getByPlaceholder("you@email.com").fill(email);
    await portal.getByPlaceholder("What should we call you?").fill(username);
    await portal.getByPlaceholder("At least 6 characters").fill(randomUUID());
    const registration = page.waitForResponse(response => response.url().includes("/api/auth/callback/credentials") && response.request().method() === "POST");
    await portal.getByRole("button", { name: "Enter the Quest World", exact: true }).click();
    const response = await registration;
    expect(response.ok(), await response.text()).toBe(true);
    await expect(portal).toHaveCount(0);
    const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
    expect(session.user.email).toBe(email);
    expect(session.user.credits).toBe(50);
    userIds.push(session.user.id);
    const bonus = (await db.query('SELECT type,amount,"balanceAfter","idempotencyKey" FROM "CreditTx" WHERE "userId"=$1', [session.user.id])).rows;
    expect(bonus).toHaveLength(1);
    expect(bonus[0]).toMatchObject({ type: "bonus", amount: 50, balanceAfter: 50, idempotencyKey: `signup:bonus:${session.user.id}` });
    return { id: session.user.id as string, username, email, page };
  }
  async function balances() {
    return (await db.query('SELECT id,credits FROM "User" WHERE id=ANY($1::text[]) ORDER BY id', [userIds])).rows;
  }
  async function ledger() {
    return (await db.query('SELECT "userId",type,amount,"balanceAfter","idempotencyKey" FROM "CreditTx" WHERE "challengeId"=$1 ORDER BY "createdAt",id', [challengeId])).rows;
  }
  async function consent(page: Page) {
    const pending = page.waitForResponse(response => response.url().includes(`/challenges/${challengeId}/verdict-response`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Accept result", exact: true }).click();
    const response = await pending;
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  try {
    const creator = await register(a, "creator");
    const opponent = await register(b, "opponent");
    const title = `Personal check-in quest ${runId}`;
    // Custom agreed text rule uses the existing authenticated creation contract;
    // no model response or direct database fixture creates the quest or verdict.
    const created = await a.request.post(`${BASE}/api/challenges`, { data: {
      title, type: "General", stake: 5, evidenceType: "text", deadline: "1 minute", isPublic: false, visibility: "invite_only",
      proposition: "Each player posts a personal check-in message before the deadline.",
      rules: "Post one personal text check-in before the deadline. If exactly one player submits valid text proof by the deadline, that player wins by default. If neither submits, void the quest. Both players must accept the result before credits settle.",
    } });
    expect(created.status(), await created.text()).toBe(201);
    const { challenge } = await created.json();
    challengeId = challenge.id;
    const deadline = new Date(challenge.deadline).getTime();
    expect(deadline).toBeGreaterThan(Date.now());
    expect(deadline - Date.now()).toBeLessThanOrEqual(60_000);
    expect(challenge.isPublic).toBe(false);
    expect(challenge.stake).toBe(5);
    expect((await balances()).find(row => row.id === creator.id).credits).toBe(45);
    await opponent.page.goto(`${BASE}/join/${challengeId}`);
    const accepting = opponent.page.waitForResponse(response => response.url().includes(`/challenges/${challengeId}/accept`) && response.request().method() === "POST");
    await opponent.page.getByRole("button", { name: "Accept Quest", exact: true }).click();
    expect((await accepting).ok()).toBe(true);
    expect((await balances()).map(row => row.credits)).toEqual([45, 45]);
    await creator.page.goto(`${BASE}/challenge/${challengeId}`);
    const proof = `I checked in personally at ${new Date().toISOString()}. Quest ${runId}.`;
    await creator.page.getByPlaceholder("Describe what you did.", { exact: false }).fill(proof);
    const submitting = creator.page.waitForResponse(response => response.url().includes(`/challenges/${challengeId}/evidence`) && response.request().method() === "POST");
    await creator.page.getByRole("button", { name: "Submit proof", exact: true }).click();
    const submitted = await submitting;
    expect(submitted.ok(), await submitted.text()).toBe(true);
    expect((await db.query('SELECT "userId",type,description FROM "Evidence" WHERE "challengeId"=$1', [challengeId])).rows).toEqual([{ userId: creator.id, type: "text", description: proof }]);
    expect(Date.now()).toBeLessThan(deadline);
    const earlyJudge = await a.request.post(`${BASE}/api/challenges/${challengeId}/judge`, { data: { tier: 1 } });
    expect(earlyJudge.status()).toBe(409);
    expect((await earlyJudge.json()).error).toContain("Both participants must submit proof before early judgment");
    expect(await ledger()).toHaveLength(2);
    expect((await balances()).map(row => row.credits)).toEqual([45, 45]);
    await expect(creator.page.getByRole("button", { name: /Ask Familiar for result/ })).toHaveCount(0);
    await opponent.page.goto(`${BASE}/challenge/${challengeId}`);
    await expect(opponent.page.getByRole("button", { name: "Submit proof", exact: true })).toBeVisible();
    const versus = await a.newPage();
    await versus.goto(`${BASE}/challenge/${challengeId}/versus`);
    await expect(versus.getByRole("button", { name: /Ask Familiar \(/ })).toHaveCount(0);
    console.log(JSON.stringify({ phase: "real-proof-submitted-awaiting-deadline", challengeId, deadline: challenge.deadline, balances: [45, 45], earlyJudgeStatus: 409 }));

    // Actual wall-clock expiry: no SQL date/status updates, reload, or mock clock.
    await creator.page.bringToFront();
    const judgeButton = creator.page.getByRole("button", { name: "Ask Familiar for result · 0 cr", exact: true });
    await expect(judgeButton).toBeVisible({ timeout: Math.max(10_000, deadline - Date.now() + 10_000) });
    expect(Date.now()).toBeGreaterThanOrEqual(deadline);
    await versus.bringToFront();
    await expect(versus.getByRole("button", { name: "Ask Familiar (0 cr)", exact: true })).toBeVisible({ timeout: 5_000 });
    await opponent.page.bringToFront();
    await expect(opponent.page.getByRole("button", { name: "Submit proof", exact: true })).toHaveCount(0);
    await creator.page.bringToFront();
    const judging = creator.page.waitForResponse(response => response.url().includes(`/challenges/${challengeId}/judge`) && response.request().method() === "POST");
    await judgeButton.click();
    const judged = await judging;
    expect(judged.ok(), await judged.text()).toBe(true);
    const recommendation = await judged.json();
    expect(recommendation.judgment).toMatchObject({ winnerId: creator.id, method: "rules", aiModel: "Deadline rule" });
    expect(recommendation.creditsUsed).toBe(0);
    expect(recommendation.settlement.success).toBe(false);
    await expect(creator.page.getByRole("button", { name: "Accept result", exact: true })).toBeVisible();
    expect((await balances()).map(row => row.credits)).toEqual([45, 45]);
    const first = await consent(creator.page);
    expect(first.settled).toBe(false);
    expect(first.waitingForUserIds).toContain(opponent.id);
    expect((await balances()).map(row => row.credits)).toEqual([45, 45]);
    expect((await ledger()).filter(row => ["win", "loss", "refund"].includes(row.type))).toHaveLength(0);
    const repeatedFirst = await a.request.post(`${BASE}/api/challenges/${challengeId}/verdict-response`, { data: { decision: "accepted" } });
    expect(repeatedFirst.ok()).toBe(true);
    expect((await repeatedFirst.json()).settled).toBe(false);
    expect(await ledger()).toHaveLength(2);
    await opponent.page.goto(`${BASE}/challenge/${challengeId}`);
    const final = await consent(opponent.page);
    expect(final.settled).toBe(true);
    const finalBalances = await balances();
    expect(finalBalances.find(row => row.id === creator.id).credits).toBe(55);
    expect(finalBalances.find(row => row.id === opponent.id).credits).toBe(45);
    const paidLedger = await ledger();
    expect(paidLedger).toHaveLength(4);
    expect(paidLedger.filter(row => row.type === "win")).toEqual([expect.objectContaining({ userId: creator.id, amount: 10, balanceAfter: 55, idempotencyKey: `settlement:${challengeId}` })]);
    expect(paidLedger.filter(row => row.type === "loss")).toEqual([expect.objectContaining({ userId: opponent.id, amount: 0, balanceAfter: 45 })]);
    const retries = await Promise.all([a.request.post(`${BASE}/api/challenges/${challengeId}/verdict-response`, { data: { decision: "accepted" } }), b.request.post(`${BASE}/api/challenges/${challengeId}/verdict-response`, { data: { decision: "accepted" } })]);
    expect(retries.every(response => response.ok())).toBe(true);
    expect(await ledger()).toEqual(paidLedger);
    expect(await balances()).toEqual(finalBalances);
    const receipt = opponent.page.getByTestId("result-receipt-card");
    await expect(receipt.getByText("Quest Settled", { exact: true })).toBeVisible();
    await expect(receipt.getByText(creator.username, { exact: true })).toBeVisible();
    await expect(receipt.getByText("Deadline rule", { exact: true })).toBeVisible();
    await expect(receipt.getByText("Rule-based · no AI call", { exact: true })).toBeVisible();
    await expect(opponent.page.getByRole("button", { name: "Share Receipt", exact: true })).toBeVisible();
    await expect(creator.page.getByTestId("result-receipt-card").getByText("Quest Settled", { exact: true })).toBeVisible({ timeout: 12_000 });
    await expect(creator.page.getByText("55 cr", { exact: true })).toBeVisible({ timeout: 12_000 });
    expect((await db.query('SELECT COUNT(*)::int AS count FROM "AuditLog" WHERE "challengeId"=$1 AND action=$2', [challengeId, "ai.call.reserved"])).rows[0].count).toBe(0);
    const signupLedger = (await db.query('SELECT "userId",type,amount,"balanceAfter","idempotencyKey" FROM "CreditTx" WHERE "userId"=ANY($1::text[]) AND type=$2', [userIds, "bonus"])).rows;
    const evidenceRows = (await db.query(`SELECT "userId",type,description,("createdAt" AT TIME ZONE 'UTC') AS "createdAt" FROM "Evidence" WHERE "challengeId"=$1`, [challengeId])).rows;
    expect(evidenceRows).toHaveLength(1);
    expect(new Date(evidenceRows[0].createdAt).getTime()).toBeLessThanOrEqual(deadline);
    const artifact = { runId, challengeId, creationMethod: "Authenticated challenge API for custom text rules; no chat parsing", creator: { id: creator.id, email: creator.email }, opponent: { id: opponent.id, email: opponent.email }, deadline: challenge.deadline, proof, evidenceRows, signupLedger, recommendation: recommendation.judgment, finalBalances, creditLedger: paidLedger, repeatedConsentUnchanged: true, providerCalls: 0 };
    const receiptPath = testInfo.outputPath("positive-stake-journey.json");
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, JSON.stringify(artifact, null, 2));
    await opponent.page.screenshot({ path: testInfo.outputPath("settled-receipt.png"), fullPage: true, animations: "disabled" });
    await testInfo.attach("actual-journey-receipts", { path: receiptPath, contentType: "application/json" });
    console.log(JSON.stringify({ runId, challengeId, result: "settled", creatorCredits: 55, opponentCredits: 45, proofRows: 1, linkedLedgerRows: 4, providerCalls: 0, realDeadlineWait: true, artifact: receiptPath }));
  } finally {
    // Keep real QA registrations and end-to-end ledger evidence available for review.
    await a.close(); await b.close(); await db.end();
  }
});
