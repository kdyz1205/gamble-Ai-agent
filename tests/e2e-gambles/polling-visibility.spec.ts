import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3017";
const baseline = process.env.POLLING_BASELINE === "1";
test.use({ channel: "chrome", video: "off" });

test("quest polling pauses while hidden, resumes immediately, stops cancelled, and serializes slow requests", async ({ browser }) => {
  test.setTimeout(150_000);
  test.skip(!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "postgresql://missing").hostname), "Isolated local fixture DB required");
  const suffix = randomUUID();
  const userId = `poll-user-${suffix}`;
  const challengeId = `poll-quest-${suffix}`;
  const email = `poll-${suffix}@example.invalid`;
  const password = randomUUID();
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  try {
    await db.query('INSERT INTO "User" (id,email,username,"passwordHash",credits,"updatedAt") VALUES ($1,$2,$3,$4,0,NOW())', [userId, email, `poll-${suffix}`, await hash(password, 8)]);
    await db.query('INSERT INTO "Challenge" (id,"creatorId",title,type,status,stake,"updatedAt") VALUES ($1,$2,$3,$4,$5,0,NOW())', [challengeId, userId, "Polling verification quest", "General", "live"]);
    await db.query('INSERT INTO "Participant" (id,"challengeId","userId",role,status) VALUES ($1,$2,$3,$4,$5)', [`part-${suffix}`, challengeId, userId, "creator", "accepted"]);
    const csrf = await (await context.request.get(`${BASE}/api/auth/csrf`)).json();
    expect((await context.request.post(`${BASE}/api/auth/callback/credentials`, { form: { email, password, csrfToken: csrf.csrfToken, callbackUrl: BASE, json: "true" } })).ok()).toBe(true);
    const page = await context.newPage();
    const isDetail = (url: string) => new URL(url).pathname === `/api/challenges/${challengeId}`;
    let requests = 0;
    page.on("request", request => { if (isDetail(request.url()) && request.method() === "GET") requests += 1; });
    await page.goto(`${BASE}/challenge/${challengeId}/versus`);
    await expect(page.getByRole("heading", { name: "Polling verification quest" })).toBeVisible();
    const visibleStart = requests;
    await page.waitForTimeout(10_800);
    const visibleRequests = requests - visibleStart;
    expect(visibleRequests).toBeGreaterThanOrEqual(2);
    // Dispatch the browser visibility API event deterministically. This tests
    // real page networking, not hardware temperature or OS tab throttling.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hiddenStart = requests;
    await page.waitForTimeout(10_800);
    const hiddenRequests = requests - hiddenStart;
    if (!baseline) expect(hiddenRequests).toBe(0);
    const resumeStart = requests;
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    if (!baseline) await expect.poll(() => requests - resumeStart, { timeout: 1_500 }).toBeGreaterThan(0);
    await db.query('UPDATE "Challenge" SET status=$2 WHERE id=$1', [challengeId, "cancelled"]);
    await page.waitForTimeout(6_000);
    const cancelledStart = requests;
    await page.waitForTimeout(10_800);
    const cancelledRequests = requests - cancelledStart;
    if (!baseline) expect(cancelledRequests).toBe(0);
    console.log(JSON.stringify({ phase: baseline ? "baseline" : "optimized", visibleRequests, hiddenRequests, cancelledRequests, intervalWindowMs: 10_800 }));

    await db.query('UPDATE "Challenge" SET status=$2 WHERE id=$1', [challengeId, "live"]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Polling verification quest" })).toBeVisible();
    let inFlight = 0;
    let maximumInFlight = 0;
    let delayedRequests = 0;
    let measuring = true;
    await page.route(`**/api/challenges/${challengeId}`, async route => {
      inFlight += 1;
      delayedRequests += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      try {
        const response = await route.fetch();
        await page.waitForTimeout(7_000);
        await route.fulfill({ response });
      } catch (error) {
        if (measuring) throw error;
      } finally { inFlight -= 1; }
    });
    await page.waitForTimeout(24_000);
    if (!baseline) expect(maximumInFlight).toBe(1);
    expect(delayedRequests).toBeGreaterThanOrEqual(2);
    console.log(JSON.stringify({ phase: baseline ? "baseline-slow" : "optimized-slow", delayedRequests, maximumInFlight, responseDelayMs: 7_000 }));
    measuring = false;
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
  } finally {
    await context.close();
    await db.query('DELETE FROM "Challenge" WHERE id=$1', [challengeId]);
    await db.query('DELETE FROM "User" WHERE id=$1', [userId]);
    await db.end();
  }
});
