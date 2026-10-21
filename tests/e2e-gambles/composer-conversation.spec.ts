import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
test.use({ ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}), video: "off" });

test("real mobile conversation shows the missing rule and publishes the agreed free entry and custom deadline", async ({ browser }, info) => {
  test.setTimeout(150_000);
  const host = new URL(BASE).hostname;
  expect(["localhost", "127.0.0.1", "summoner.world"].includes(host)
    || /^stubborn-[a-z0-9]+-kdyz1205s-projects\.vercel\.app$/.test(host)).toBe(true);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  let requests = 0;
  try {
    const page = await context.newPage();
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/agent/respond") requests++; });
    const run = randomUUID().replaceAll("-", "");
    await page.goto(`${BASE}/summons`);
    const content = page.getByTestId("scene-transition-shell").locator(":scope > div").first();
    await expect(content).toHaveCSS("filter", "blur(0px)");
    await page.getByRole("button", { name: "Friend match", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Describe your challenge" })).toHaveValue(/badminton/);
    const input = page.locator("textarea").first();
    await input.fill("我和朋友打羽毛球，5个球定胜负");
    const beforeLogin = page.waitForResponse(r => new URL(r.url()).pathname === "/api/agent/respond" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Summon", exact: true }).click();
    expect((await beforeLogin).status()).toBe(401);
    const portal = page.locator(".auth-portal");
    await expect(portal.getByText("Join Summoner.world", { exact: true })).toBeVisible();
    await portal.getByPlaceholder("you@email.com").fill(`qa_conversation_${run}@example.invalid`);
    await portal.getByPlaceholder("What should we call you?").fill(`qa_ui_${run}`);
    await portal.getByPlaceholder("At least 6 characters").fill(randomUUID());
    await portal.getByRole("button", { name: "Enter the Quest World", exact: true }).click();
    await expect(portal).toHaveCount(0);
    await expect(input).toHaveValue("我和朋友打羽毛球，5个球定胜负");
    const usageAtLogin = await (await context.request.get(`${BASE}/api/ai/usage`)).json();
    expect(usageAtLogin.completedCalls).toBe(0);

    async function turn(text: string) {
      await input.fill(text);
      const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/agent/respond" && r.request().method() === "POST");
      await page.getByRole("button", { name: "Summon", exact: true }).click();
      const r = await response;
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    }
    const ambiguous = await turn("我和朋友打羽毛球，5个球定胜负");
    expect(ambiguous.agentAction).toBe("ask_followup");
    expect(ambiguous.draftState.proposition).toBeTruthy();
    const log = page.getByRole("log", { name: "Challenge conversation" });
    await expect(log).toContainText(ambiguous.userVisibleReply);
    await expect(page.getByRole("button", { name: /Publish.*quest|Publish & escrow/ })).toHaveCount(0);
    expect((await turn("总共打5个回合")).draftState.readyToPublish).toBe(true);
    await turn("change stake to 50 credits");
    await expect(page.getByRole("button", { name: "Publish & escrow 50 credits", exact: true })).toBeVisible();
    await turn("make it free");
    await expect(page.getByRole("button", { name: "Publish free quest", exact: true })).toBeVisible();
    const timed = await turn("change proof window to 1 minute");
    expect(timed.draftState.timeWindow).toBe("1 minute");
    await page.locator("summary").filter({ hasText: "Quest terms" }).click();
    await expect(page.locator('input[type="number"]')).toHaveValue("0");
    await expect(page.getByRole("button", { name: "1 minute", exact: true })).toHaveAttribute("data-selected", "true");
    await page.locator("summary").filter({ hasText: "Quest terms" }).click();
    await expect(log).toContainText("make it free");
    await expect(log).toContainText("总共打5个回合");
    const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
    const saved = {
      ownerId: session.user.id, savedAt: Date.now(), input: "",
      settings: { stake: "0", opponentMode: "Invite only", proofWindow: "1 minute" }, draft: timed.draftState,
      turns: [{ role: "user", content: "make it free" }, { role: "ai", content: timed.userVisibleReply }],
    };
    await page.evaluate(value => sessionStorage.setItem("summoner:composer:auth-return:v1", JSON.stringify(value)), saved);
    await page.reload();
    await expect(content).toHaveCSS("filter", "blur(0px)");
    await expect(page.getByRole("button", { name: "Publish free quest", exact: true })).toBeVisible();
    await expect(log).toContainText("make it free");
    expect(await page.evaluate(() => sessionStorage.getItem("summoner:composer:auth-return:v1"))).toBeNull();
    const before = await (await context.request.get(`${BASE}/api/tokens`)).json();
    const usageBefore = await (await context.request.get(`${BASE}/api/ai/usage`)).json();
    expect(usageBefore).toEqual(usageAtLogin);
    const publication = page.waitForResponse(r => new URL(r.url()).pathname === "/api/agent/respond" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Publish free quest", exact: true }).click();
    const published = await publication;
    expect(published.status(), await published.text()).toBe(200);
    const result = await published.json();
    expect(result.toolError).toBeFalsy();
    const id = result.toolResult.challengeId;
    expect(id).toBeTruthy();
    const detail = await context.request.get(`${BASE}/api/challenges/${id}`);
    expect(detail.status()).toBe(200);
    const { challenge } = await detail.json();
    expect(challenge.stake).toBe(0);
    expect(challenge.status).toBe("open");
    // Server timestamps measure the agreed window, without browser actionability
    // waits, client/server clock skew or network transit changing the oracle.
    const serverWindow = new Date(challenge.deadline).getTime() - new Date(challenge.createdAt).getTime();
    expect(serverWindow).toBeGreaterThanOrEqual(55_000);
    expect(serverWindow).toBeLessThanOrEqual(61_000);
    const after = await (await context.request.get(`${BASE}/api/tokens`)).json();
    expect(after.offChain.credits).toBe(before.offChain.credits);
    expect(after.transactions.filter((row: { challengeId: string; amount: number }) => row.challengeId === id).every((row: { amount: number }) => row.amount === 0)).toBe(true);
    expect(await (await context.request.get(`${BASE}/api/ai/usage`)).json()).toEqual(usageBefore);
    await page.getByRole("link", { name: "Open Quest", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/market/${id}|/challenge/${id}`));
    await page.goto(`${BASE}/quests`);
    await expect(page.getByTestId(`quest-card-${id}`)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Quest world navigation" }).filter({ visible: true });
    expect(await nav.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")))).toEqual(["/summons", "/quests", "/quests?view=proof", "/quests?view=results", "/me"]);
    await assertNoOverflow(page);
    await page.screenshot({ path: info.outputPath("real-mobile-quest-list.png"), fullPage: true });
    await info.attach("real-conversation-receipt", { contentType: "application/json", body: Buffer.from(JSON.stringify({
      base: BASE, challengeId: id, http: published.status(), stake: challenge.stake, deadline: challenge.deadline,
      creditsBefore: before.offChain.credits, creditsAfter: after.offChain.credits, actualRequests: requests,
      missingQuestionVisible: true, conversationEditsPreserved: true, noAdditionalProviderCalls: true,
    })) });
  } finally { await context.close(); }
});

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
