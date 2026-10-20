import "dotenv/config";

import { randomUUID } from "node:crypto";

import { hash } from "bcryptjs";

import { expect, test, type BrowserContext } from "@playwright/test";

import { Pool } from "pg";



const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3017";

test.use({ ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });

test("zero-credit friends publish and accept through UI; expired no-proof quest yields void and mutual-consent receipt", async ({ browser }) => {

  test.skip(!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? ""), "Requires explicit isolated local PostgreSQL fixture database");

  test.setTimeout(300_000);

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

  const password = randomUUID();

  const passwordHash = await hash(password, 8);

  const db = new Pool({ connectionString: process.env.DATABASE_URL });

  async function createPlayer(label: string) {

    const id = `browser${label}${suffix}`;

    const email = `browser-${label}-${suffix}@example.invalid`;

    const username = `browser_${label}_${suffix}`;

    await db.query('INSERT INTO "User" (id,email,username,"passwordHash",credits,"updatedAt") VALUES ($1,$2,$3,$4,0,NOW())', [id, email, username, passwordHash]);

    return { id, email, username };

  }

  const creator = await createPlayer("a");

  const opponent = await createPlayer("b");

  const a = await browser.newContext({ reducedMotion: "reduce" });

  const b = await browser.newContext({ reducedMotion: "reduce" });

  async function signIn(context: BrowserContext, email: string) {

    const { csrfToken } = await (await context.request.get(`${BASE}/api/auth/csrf`)).json();

    const response = await context.request.post(`${BASE}/api/auth/callback/credentials`, { form: { email, password, csrfToken, callbackUrl: `${BASE}/summons`, json: "true" } });

    expect(response.ok()).toBe(true);

    const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();

    expect(session.user.email).toBe(email);

    await context.addInitScript(() => { localStorage.setItem("oracle_llm_provider", "openai"); localStorage.setItem("oracle_llm_model", "gpt-4o-mini"); });

  }

  try {

    await signIn(a, creator.email); await signIn(b, opponent.email);

    const pageA = await a.newPage(); const pageB = await b.newPage();

    await pageA.goto(`${BASE}/summons`);

    await pageA.locator("summary").filter({ hasText: "Quest terms" }).click();

    await pageA.locator('input[type="number"]').fill("0");

    await pageA.locator("textarea").first().fill("badminton first to 3 points");

    const draftResponse = pageA.waitForResponse((res) => res.url().includes("/api/agent/respond") && res.request().method() === "POST");

    await pageA.getByRole("button", { name: "Summon", exact: true }).click();

    expect((await draftResponse).status()).toBe(200);

    const publishedResponse = pageA.waitForResponse((res) => res.url().includes("/api/agent/respond") && res.request().method() === "POST");

    await pageA.getByRole("button", { name: "Publish free quest", exact: true }).click();

    const publishResult = await publishedResponse;

    expect(publishResult.ok(), await publishResult.text()).toBe(true);

    const published = await publishResult.json();

    const challengeId = published.toolResult.challengeId as string;

    expect(challengeId).toBeTruthy();

    const stored = (await db.query('SELECT * FROM "Challenge" WHERE id=$1', [challengeId])).rows[0];

    expect(stored.stake).toBe(0);

    expect(stored.evidenceType).toBe("video");

    const anonymous = await browser.newContext();

    try { expect((await anonymous.request.get(`${BASE}/api/ai/usage`)).status()).toBe(401); }

    finally { await anonymous.close(); }

    const overlong = await a.request.post(`${BASE}/api/agent/respond`, { data: { message: "x".repeat(8001), conversationHistory: [], draftState: {} } });

    expect(overlong.status()).toBe(413);

    for (const context of [a, b]) {

      const usageResponse = await context.request.get(`${BASE}/api/ai/usage`);

      expect(usageResponse.status()).toBe(200);

      expect(usageResponse.headers()["cache-control"]).toContain("no-store");

      const usage = await usageResponse.json();

      expect(usage.reservedCalls).toBe(0); expect(usage.completedCalls).toBe(0); expect(usage.receipts).toHaveLength(0);

    }

    // A synthetic usage receipt belongs only to its actor. It records a test

    // error event, never a successful model call or a financial transaction.

    const receiptId = `privacy${suffix}`;

    await db.query('INSERT INTO "AuditLog" (id,action,"actorUserId",payload) VALUES ($1,$2,$3,$4)', [receiptId, "ai.call.completed", creator.id, JSON.stringify({ requestId: receiptId, outcome: "failed", usage: null, purpose: "privacy.test" })]);

    const ownUsage = await (await a.request.get(`${BASE}/api/ai/usage`)).json();

    const otherUsage = await (await b.request.get(`${BASE}/api/ai/usage`)).json();

    expect(ownUsage.receipts.map((row: { id: string }) => row.id)).toContain(receiptId);

    expect(otherUsage.receipts.map((row: { id: string }) => row.id)).not.toContain(receiptId);

    await db.query('DELETE FROM "AuditLog" WHERE id=$1', [receiptId]);



    await pageB.goto(`${BASE}/join/${challengeId}`);

    const acceptResponse = pageB.waitForResponse((res) => res.url().includes(`/challenges/${challengeId}/accept`) && res.request().method() === "POST");

    await pageB.getByRole("button", { name: "Accept Quest", exact: true }).click();

    expect((await acceptResponse).ok()).toBe(true);

    // Real providers currently reject requests for insufficient balance. Exercise

    // the deterministic expired/no-proof rule, without fabricating an AI verdict.

    // SQL supplies only the expired judging precondition normally set by cron.

    await db.query(`UPDATE "Challenge" SET deadline=NOW()-INTERVAL '1 minute', status='judging' WHERE id=$1`, [challengeId]);

    await pageA.goto(`${BASE}/challenge/${challengeId}`);

    const judgmentResponse = pageA.waitForResponse((res) => res.url().includes(`/challenges/${challengeId}/judge`) && res.request().method() === "POST", { timeout: 120_000 });

    await pageA.getByRole("button", { name: "Ask Familiar for result · 0 cr", exact: true }).click();

    const judgment = await judgmentResponse;

    expect(judgment.ok(), await judgment.text()).toBe(true);

    expect((await judgment.json()).judgment.winnerId).toBeNull();

    for (const page of [pageA, pageB]) {

      await page.goto(`${BASE}/challenge/${challengeId}`);

      const consentResponse = page.waitForResponse((res) => res.url().includes(`/challenges/${challengeId}/verdict-response`) && res.request().method() === "POST");

      await page.getByRole("button", { name: "Accept result", exact: true }).click();

      const consent = await consentResponse;
      expect(consent.ok(), await consent.text()).toBe(true);

    }

    await pageA.reload();

    await expect(pageA.getByText("Quest Settled", { exact: true })).toBeVisible({ timeout: 30_000 });

    await expect(pageA.getByRole("button", { name: "Share Receipt", exact: true })).toBeVisible();

    await expect(pageA.getByRole("button", { name: "Accept quest", exact: true })).toHaveCount(0);

    await expect(pageA.getByText(/Creator · No proof submitted/)).toBeVisible();

    await expect(pageA.getByText(/Challenger · No proof submitted/)).toBeVisible();

    await expect(pageA.getByTestId("result-receipt-card").getByText("Deadline rule", { exact: true })).toBeVisible();

    await expect(pageA.getByTestId("result-receipt-card").getByText("Rule-based · no AI call", { exact: true })).toBeVisible();

    await expect(pageA.locator(".verdict-enter")).toBeVisible();
    await expect(pageA.getByText(/% confidence|OpenAI|gpt-4o-mini/)).toHaveCount(0);

    await expect(pageA.getByText("Waiting", { exact: true })).toHaveCount(0);

    const final = (await db.query('SELECT * FROM "Challenge" WHERE id=$1', [challengeId])).rows[0];

    final.verdictResponses = (await db.query('SELECT * FROM "VerdictResponse" WHERE "challengeId"=$1', [challengeId])).rows;

    final.judgments = (await db.query('SELECT * FROM "Judgment" WHERE "challengeId"=$1', [challengeId])).rows;

    final.creditTxs = (await db.query('SELECT * FROM "CreditTx" WHERE "challengeId"=$1', [challengeId])).rows;

    expect(final.status).toBe("settled"); expect(final.verdictResponses).toHaveLength(2); expect(final.judgments).toHaveLength(1); expect(final.creditTxs).toHaveLength(0);

    expect((await db.query('SELECT credits FROM "User" WHERE id=$1', [creator.id])).rows[0].credits).toBe(0);

    expect((await db.query('SELECT credits FROM "User" WHERE id=$1', [opponent.id])).rows[0].credits).toBe(0);

    await pageA.screenshot({ path: `test-results/quest-browser-receipt-${suffix}.png`, fullPage: true, animations: "disabled" });

    console.log(JSON.stringify({ challengeId, result: final.status, consentCount: final.verdictResponses.length, creditTransactions: final.creditTxs.length }));



    // Missing proof must use the deadline-rule path, never enter paid async work.

    const asyncChallengeId = `async${suffix}`;

    await db.query(`INSERT INTO "Challenge" (id,"creatorId",title,description,type,status,stake,deadline,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,0,NOW()-INTERVAL '1 minute',NOW())`, [asyncChallengeId, creator.id, "Expired async zero-credit fixture", "No proof, deterministic void", "General", "judging"]);

    await db.query('INSERT INTO "Participant" (id,"challengeId","userId",role,status) VALUES ($1,$2,$3,$4,$5),($6,$2,$7,$8,$5)', [`asynca${suffix}`, asyncChallengeId, creator.id, "creator", "accepted", `asyncb${suffix}`, opponent.id, "opponent"]);

    const asyncResponse = await a.request.post(`${BASE}/api/challenges/${asyncChallengeId}/judge/async`, { data: { tier: 1 } });

    expect(asyncResponse.status(), await asyncResponse.text()).toBe(409);
    expect((await asyncResponse.json()).error).toContain("Background review needs valid proof from both players");
    expect((await db.query('SELECT count(*)::int AS count FROM "JudgeJob" WHERE "challengeId"=$1', [asyncChallengeId])).rows[0].count).toBe(0);
    expect((await db.query('SELECT count(*)::int AS count FROM "CreditTx" WHERE "challengeId"=$1', [asyncChallengeId])).rows[0].count).toBe(0);
    expect((await db.query('SELECT count(*)::int AS count FROM "Judgment" WHERE "challengeId"=$1', [asyncChallengeId])).rows[0].count).toBe(0);
    expect((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [asyncChallengeId])).rows[0].status).toBe("judging");
    expect((await db.query('SELECT count(*)::int AS count FROM "AuditLog" WHERE "challengeId"=$1 AND action=$2', [asyncChallengeId, "ai.call.reserved"])).rows[0].count).toBe(0);

    // CI explicitly disables AI. Exercise eligible intake and real after()/polling
    // failure rather than inventing a completed recommendation. Never call a paid
    // provider when this browser spec is run outside that disabled environment.
    if (process.env.AI_ENABLED === "false") {
      const created = await a.request.post(`${BASE}/api/challenges`, { data: {
        title: `Eligible async proof ${suffix}`, stake: 0, evidenceType: "text", deadline: "2 hours",
        visibility: "invite_only", isPublic: false,
        rules: "Both players submit their own written answer. Compare the actual answers and explain the result.",
      } });
      expect(created.status(), await created.text()).toBe(201);
      const eligibleId = (await created.json()).challenge.id as string;
      expect((await b.request.post(`${BASE}/api/challenges/${eligibleId}/accept`)).status()).toBe(200);
      for (const [context, answer] of [[a, "Creator answer: seven"], [b, "Opponent answer: nine"]] as const) {
        const submitted = await context.request.post(`${BASE}/api/challenges/${eligibleId}/evidence`, { data: { type: "text", description: `${answer}. ${suffix}` } });
        expect(submitted.status(), await submitted.text()).toBe(201);
      }
      expect((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [eligibleId])).rows[0].status).toBe("judging");
      const failedJobs: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const admitted = await a.request.post(`${BASE}/api/challenges/${eligibleId}/judge/async`, { data: { tier: 1, providerId: "openai", model: "gpt-4o-mini" } });
        expect(admitted.status(), await admitted.text()).toBe(202);
        const { jobId, reused } = await admitted.json();
        expect(reused).toBe(false);
        expect(failedJobs).not.toContain(jobId);
        failedJobs.push(jobId);
        let result: { status: string; error?: string; result?: unknown } | undefined;
        await expect.poll(async () => {
          const polled = await a.request.get(`${BASE}/api/judge-jobs/${jobId}`);
          expect(polled.status()).toBe(200);
          result = await polled.json();
          return result!.status;
        }, { timeout: 60_000 }).toBe("failed");
        expect(result!.error).toContain("AI usage limit reached");
        expect(result!.result).toBeNull();
        expect(await (await b.request.get(`${BASE}/api/judge-jobs/${jobId}`)).json()).toEqual(result);
        expect(await (await a.request.get(`${BASE}/api/judge-jobs/${jobId}`)).json()).toEqual(result);
      }
      expect((await db.query('SELECT status FROM "JudgeJob" WHERE "challengeId"=$1', [eligibleId])).rows).toEqual([{ status: "failed" }, { status: "failed" }]);
      expect((await db.query('SELECT count(*)::int AS count FROM "Judgment" WHERE "challengeId"=$1', [eligibleId])).rows[0].count).toBe(0);
      expect((await db.query('SELECT count(*)::int AS count FROM "CreditTx" WHERE "challengeId"=$1', [eligibleId])).rows[0].count).toBe(0);
      expect((await db.query('SELECT count(*)::int AS count FROM "AuditLog" WHERE "challengeId"=$1 AND action=$2', [eligibleId, "ai.call.reserved"])).rows[0].count).toBe(0);
      expect((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [eligibleId])).rows[0].status).toBe("judging");
      console.log(JSON.stringify({ eligibleId, failedJobs, asyncStatus: "failed", reason: "AI explicitly disabled", completedVerdicts: 0, providerCalls: 0 }));
    } else {
      console.log("SKIP eligible async inference failure: requires explicit AI_ENABLED=false on test runner and server");
    }
    expect((await db.query('SELECT credits FROM "User" WHERE id=ANY($1::text[])', [[creator.id, opponent.id]])).rows.map((row: { credits: number }) => row.credits)).toEqual([0, 0]);

  } finally {

    await a.close(); await b.close();

    const ids = (await db.query('SELECT id FROM "Challenge" WHERE "creatorId"=$1', [creator.id])).rows.map((row: {id: string}) => row.id);

    await db.query('DELETE FROM "AuditLog" WHERE "challengeId"=ANY($1::text[]) OR "actorUserId"=ANY($2::text[])', [ids, [creator.id, opponent.id]]);

    await db.query('DELETE FROM "ActivityEvent" WHERE "challengeId"=ANY($1::text[]) OR "userId"=ANY($2::text[])', [ids, [creator.id, opponent.id]]);

    await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [[creator.id, opponent.id]]);

    await db.end();

  }

});
