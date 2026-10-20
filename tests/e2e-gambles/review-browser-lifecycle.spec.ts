import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type BrowserContext } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
test.use({ ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}), video: "off" });

test("player requests review and an independent reviewer refunds actual stakes once through the review portal", async ({ browser }, info) => {
  test.setTimeout(240_000);
  // Reviewer authorization is an explicit local QA fixture, never a cloud role grant.
  expect(["localhost", "127.0.0.1"]).toContain(new URL(BASE).hostname);
  const dbURL = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  expect(["localhost", "127.0.0.1"]).toContain(dbURL.hostname);
  expect(dbURL.pathname).toBe("/summoner_verification");
  const db = new Pool({ connectionString: dbURL.href });
  const contexts: BrowserContext[] = [];
  const run = randomUUID().replaceAll("-", "").slice(0, 16);
  let reviewerId = "";
  async function register(label: string) {
    const context = await browser.newContext({ reducedMotion: "reduce" }); contexts.push(context);
    const { csrfToken } = await (await context.request.get(`${BASE}/api/auth/csrf`)).json();
    const response = await context.request.post(`${BASE}/api/auth/callback/credentials`, { form: {
      csrfToken, action: "register", email: `qa_review_${label}_${run}@example.invalid`, username: `qa_review_${label}_${run}`,
      password: randomUUID(), callbackUrl: BASE, json: "true",
    } });
    expect(response.ok(), await response.text()).toBe(true);
    const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
    expect(session.user?.id).toBeTruthy();
    expect((await db.query('SELECT credits FROM "User" WHERE id=$1', [session.user.id])).rows).toEqual([{ credits: 50 }]);
    return { context, id: session.user.id as string, page: await context.newPage() };
  }
  try {
    const creator = await register("creator"), opponent = await register("opponent"), reviewer = await register("moderator");
    reviewerId = reviewer.id;
    expect((await reviewer.context.request.get(`${BASE}/api/reviews`)).status()).toBe(403);
    await db.query('UPDATE "User" SET "isReviewer"=true WHERE id=$1', [reviewerId]);
    const title = `QA manual review ${run}`;
    const created = await creator.context.request.post(`${BASE}/api/challenges`, { data: {
      title, stake: 5, evidenceType: "text", deadline: "1 minute", isPublic: false, visibility: "invite_only",
      rules: "Each player submits one personal text check-in before the deadline. If only one player submits proof by the deadline, that player wins by default. Both players may request independent review before settlement.",
    } });
    expect(created.status(), await created.text()).toBe(201);
    const { challenge } = await created.json();
    const id = challenge.id as string, deadline = new Date(challenge.deadline).getTime();
    expect(deadline).toBeGreaterThan(Date.now());
    const balances = async () => (await db.query('SELECT id,credits FROM "User" WHERE id=ANY($1::text[]) ORDER BY id', [[creator.id, opponent.id]])).rows;
    const ledger = async () => (await db.query('SELECT "userId",type,amount,"balanceAfter","idempotencyKey" FROM "CreditTx" WHERE "challengeId"=$1 ORDER BY "createdAt",id', [id])).rows;
    expect((await opponent.context.request.post(`${BASE}/api/challenges/${id}/accept`)).status()).toBe(200);
    expect((await balances()).map(row => row.credits)).toEqual([45, 45]);
    await creator.page.goto(`${BASE}/challenge/${id}`);
    const proof = `Personal check-in for independent review ${run}.`;
    await creator.page.getByPlaceholder("Describe what you did.", { exact: false }).fill(proof);
    const submitting = creator.page.waitForResponse(r => new URL(r.url()).pathname === `/api/challenges/${id}/evidence` && r.request().method() === "POST");
    await creator.page.getByRole("button", { name: "Submit proof", exact: true }).click();
    expect((await submitting).status()).toBe(201);
    expect(Date.now()).toBeLessThan(deadline);
    // Real wall-clock expiry and production rules; no SQL deadline/status/verdict fabrication.
    const judge = creator.page.getByRole("button", { name: "Ask Familiar for result · 0 cr", exact: true });
    await expect(judge).toBeVisible({ timeout: Math.max(10_000, deadline - Date.now() + 15_000) });
    expect(Date.now()).toBeGreaterThanOrEqual(deadline);
    const judging = creator.page.waitForResponse(r => new URL(r.url()).pathname === `/api/challenges/${id}/judge` && r.request().method() === "POST");
    await judge.click();
    const judged = await judging;
    expect(judged.status(), await judged.text()).toBe(200);
    expect(await judged.json()).toMatchObject({ judgment: { winnerId: creator.id, method: "rules" }, creditsUsed: 0 });
    const controls = creator.page.getByTestId("verdict-review-controls");
    await controls.getByRole("button", { name: "Request review", exact: true }).click();
    const reason = `Please review the actual check-in proof and refund both players by agreement. ${run}`;
    await controls.getByLabel("What should the reviewer re-check?").fill(reason);
    const requesting = creator.page.waitForResponse(r => new URL(r.url()).pathname === `/api/challenges/${id}/verdict-response` && r.request().method() === "POST");
    await controls.getByRole("button", { name: "Freeze settlement and open review", exact: true }).click();
    const requested = await requesting;
    expect(requested.status(), await requested.text()).toBe(200);
    await expect(controls.getByTestId("review-case-status")).toContainText("Review pending");
    expect((await balances()).map(row => row.credits)).toEqual([45, 45]);
    expect(await ledger()).toHaveLength(2);
    const detail = (await (await creator.context.request.get(`${BASE}/api/challenges/${id}`)).json()).challenge;
    const reviewId = detail.reviewCase.id as string;
    expect((await creator.context.request.post(`${BASE}/api/reviews/${reviewId}/resolve`, { data: { resolution: "refund", notes: "A participant cannot act as independent reviewer." } })).status()).toBe(403);
    await reviewer.page.goto(`${BASE}/reviews`);
    const card = reviewer.page.getByTestId("review-card").filter({ hasText: title });
    await expect(card).toContainText(proof);
    await expect(card).toContainText(reason);
    const notes = `Independent QA reviewer read the submitted proof and requests refund of each recorded stake. ${run}`;
    await card.getByLabel("Reviewer reasoning").fill(notes);
    const resolving = reviewer.page.waitForResponse(r => new URL(r.url()).pathname === `/api/reviews/${reviewId}/resolve` && r.request().method() === "POST");
    await card.getByRole("button", { name: "Refund everyone", exact: true }).click();
    const resolved = await resolving;
    expect(resolved.status(), await resolved.text()).toBe(200);
    expect(await resolved.json()).toMatchObject({ resolved: true, settled: true });
    await expect(card).toHaveCount(0);
    const finalBalances = await balances(), finalLedger = await ledger();
    expect(finalBalances.map(row => row.credits)).toEqual([50, 50]);
    expect(finalLedger).toHaveLength(4);
    expect(finalLedger.filter(row => row.type === "refund").map(row => row.amount)).toEqual([5, 5]);
    expect(finalLedger.reduce((sum, row) => sum + row.amount, 0)).toBe(0);
    const final = (await (await creator.context.request.get(`${BASE}/api/challenges/${id}`)).json()).challenge;
    expect(final.status).toBe("settled"); expect(final.reviewCase.status).toBe("resolved");
    expect(final.judgments[0]).toMatchObject({ method: "manual", winnerId: null, reasoning: notes });
    await creator.page.reload();
    const receipt = creator.page.getByTestId("result-receipt-card");
    await expect(receipt).toContainText("Quest Settled");
    await expect(receipt).toContainText("Human review");
    await expect(receipt).toContainText(notes);
    const retry = await reviewer.context.request.post(`${BASE}/api/reviews/${reviewId}/resolve`, { data: { resolution: "refund", notes } });
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({ resolved: true, settled: true });
    expect(await ledger()).toEqual(finalLedger); expect(await balances()).toEqual(finalBalances);
    const calls = (await db.query('SELECT count(*)::int AS count FROM "AuditLog" WHERE "actorUserId"=ANY($1::text[]) AND action=$2', [[creator.id, opponent.id, reviewer.id], "ai.call.reserved"])).rows[0].count;
    expect(calls).toBe(0);
    await info.attach("real-review-browser-receipt", { contentType: "application/json", body: Buffer.from(JSON.stringify({ challengeId: id, reviewId, realDeadline: challenge.deadline, reviewerFixture: "local-only isReviewer grant on own registered account", finalBalances, finalLedger, retryUnchanged: true, providerCalls: calls })) });
  } finally {
    if (reviewerId) await db.query('UPDATE "User" SET "isReviewer"=false WHERE id=$1', [reviewerId]);
    await Promise.all(contexts.map(context => context.close())); await db.end();
  }
});
