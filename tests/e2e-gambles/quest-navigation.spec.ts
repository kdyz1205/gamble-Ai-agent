import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import type { ChallengeData } from "../../src/lib/api-client";

// Read-only cloud verification against already-owned QA accounts. No quest,
// proof, credit, judge, settlement or database mutations are performed.
test.use({ channel: "chrome", video: "off", trace: "off", viewport: { width: 390, height: 844 } });
test("primary navigation opens actual owned quests, proof and results with recoverable list errors", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const base = process.env.TEST_BASE_URL;
  expect(base, "An explicitly acknowledged candidate URL is required").toBeTruthy();
  expect(/^stubborn-[a-z0-9]+-kdyz1205s-projects\.vercel\.app$/.test(new URL(base!).hostname) || ["localhost", "127.0.0.1"].includes(new URL(base!).hostname)).toBe(true);
  const checkpoint = JSON.parse(await readFile(".vercel/qa-cloud-chat-resume.json", "utf8")) as { accounts: { a: { email: string; password: string } } };
  const anonymous = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  try {
    const page = await anonymous.newPage();
    let mineRequests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/challenges" && new URL(request.url()).searchParams.get("mine") === "true") mineRequests++; });
    await page.goto(`${base}/quests`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Sign in to see your quests" })).toBeVisible();
    expect(mineRequests).toBe(0);
    await page.getByRole("button", { name: "Sign in", exact: true }).press("Enter");
    await expect(page.getByText("Join Summoner.world", { exact: true })).toBeVisible();
  } finally { await anonymous.close(); }

  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  try {
    const { csrfToken } = await (await context.request.get(`${base}/api/auth/csrf`)).json();
    const signedIn = await context.request.post(`${base}/api/auth/callback/credentials`, { form: {
      csrfToken, action: "login", email: checkpoint.accounts.a.email, password: checkpoint.accounts.a.password,
      callbackUrl: `${base}/quests`, json: "true",
    } });
    expect(signedIn.status()).toBe(200);
    expect((await (await context.request.get(`${base}/api/auth/session`)).json()).user?.id).toBeTruthy();
    const response = await context.request.get(`${base}/api/challenges?mine=true&limit=50`);
    expect(response.status()).toBe(200);
    const actual = await response.json() as { challenges: ChallengeData[]; total: number };
    expect(actual.challenges.length, "The owned QA account must retain its real completed challenge").toBeGreaterThan(0);
    const page = await context.newPage();
    let failedOnce = false;
    await page.route("**/api/challenges?*", async route => {
      if (!failedOnce && new URL(route.request().url()).searchParams.get("mine") === "true") {
        failedOnce = true;
        await route.fulfill({ status: 503, json: { error: "Fixture list transport failure" } });
      } else await route.continue();
    });
    await page.goto(`${base}/quests`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("alert")).toContainText("Fixture list transport failure");
    await page.getByRole("button", { name: "Try again", exact: true }).press("Enter");
    await expect(page.getByTestId(`quest-card-${actual.challenges[0].id}`)).toBeVisible();
    await page.unroute("**/api/challenges?*");
    const primary = page.getByRole("navigation", { name: "Quest world navigation" }).filter({ visible: true });
    const hrefs = await primary.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")));
    expect(hrefs).toEqual(["/summons", "/quests", "/quests?view=proof", "/quests?view=results", "/me"]);
    const counts: Record<string, number> = {};
    for (const view of ["all", "proof", "results"]) {
      const href = view === "all" ? "/quests" : `/quests?view=${view}`;
      await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });
      const expected = actual.challenges.filter(quest => view === "all" || (view === "proof" ? ["live", "judging"] : ["settled", "cancelled", "disputed", "pending_settlement"]).includes(quest.status));
      await expect(page.getByText(`${actual.challenges.length} of ${actual.total} quests loaded · ${expected.length} in this view`, { exact: true })).toBeVisible();
      await expect(page.locator('[data-testid^="quest-card-"]')).toHaveCount(expected.length);
      await expect(page.getByRole("navigation", { name: "Filter your quests" }).locator('[aria-current="page"]')).toHaveAttribute("href", href);
      for (const quest of expected) {
        const card = page.getByTestId(`quest-card-${quest.id}`);
        await expect(card.getByRole("heading")).toHaveText(quest.title);
        await expect(card.getByRole("link", { name: "Open quest", exact: true })).toHaveAttribute("href", `/challenge/${quest.id}`);
        const size = await card.getByRole("link", { name: "Open quest", exact: true }).boundingBox();
        expect(size?.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      counts[view] = expected.length;
    }
    const result = actual.challenges.find(quest => ["settled", "cancelled", "disputed", "pending_settlement"].includes(quest.status));
    expect(result).toBeTruthy();
    await page.getByTestId(`quest-card-${result!.id}`).getByRole("link", { name: "Open quest", exact: true }).press("Enter");
    await expect(page).toHaveURL(`${base}/challenge/${result!.id}`);
    await expect(page.getByRole("heading", { name: result!.title, exact: true }).first()).toBeVisible();
    await testInfo.attach("real-quest-navigation", { contentType: "application/json", body: Buffer.from(JSON.stringify({ result: "PASS", base, total: actual.total, counts, openedQuestId: result!.id, failedTransportRecovered: failedOnce, writes: "authentication only; no product mutations", providerCalls: 0 })) });
    console.log(JSON.stringify({ result: "PASS", counts, openedQuestId: result!.id, providerCalls: 0 }));
  } catch (error) { console.error(error); throw error; }
  finally { await context.close(); }
});
