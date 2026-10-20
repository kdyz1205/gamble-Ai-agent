import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3017";
test.use({ ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}), video: "off", trace: "off" });

test("creator cancels through UI, retains history and receives exactly one recorded stake refund", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const host = new URL(BASE).hostname;
  expect(["localhost", "127.0.0.1", "summoner.world"].includes(host)
    || /^stubborn-[a-z0-9]+-kdyz1205s-projects\.vercel\.app$/.test(host)).toBe(true);
  const run = randomUUID().replaceAll("-", "");
  const context = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const { csrfToken } = await (await context.request.get(`${BASE}/api/auth/csrf`)).json();
    const registered = await context.request.post(`${BASE}/api/auth/callback/credentials`, { form: {
      csrfToken, action: "register", email: `qa_cancel_${run}@example.invalid`, username: `qa_cancel_${run}`,
      password: randomUUID(), callbackUrl: BASE, json: "true",
    } });
    expect(registered.ok(), await registered.text()).toBe(true);
    expect((await (await context.request.get(`${BASE}/api/auth/session`)).json()).user?.id).toBeTruthy();
    const tokens = async () => (await context.request.get(`${BASE}/api/tokens`)).json();
    const before = await tokens();
    const created = await context.request.post(`${BASE}/api/challenges`, { data: {
      title: `QA cancellation ${run}`, stake: 5, evidenceType: "text", visibility: "invite_only", isPublic: false,
      deadline: "2 hours", rules: "Each player writes their agreed answer. Equal answers tie.",
    } });
    expect(created.status(), await created.text()).toBe(201);
    const { challenge } = await created.json();
    expect((await tokens()).offChain.credits).toBe(before.offChain.credits - 5);
    const page = await context.newPage();
    await page.goto(`${BASE}/market/${challenge.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Cancel this quest", exact: true }).click();
    await expect(page.getByText("Your quest history stays available.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Keep quest", exact: true }).click();
    expect((await (await context.request.get(`${BASE}/api/challenges/${challenge.id}`)).json()).challenge.status).toBe("open");
    await page.getByRole("button", { name: "Cancel this quest", exact: true }).click();
    const response = page.waitForResponse(res => new URL(res.url()).pathname === `/api/challenges/${challenge.id}` && res.request().method() === "DELETE");
    await page.getByRole("button", { name: "Yes, cancel quest", exact: true }).click();
    const cancelled = await response;
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    expect(await cancelled.json()).toMatchObject({ ok: true, status: "cancelled", retained: true, refundedStake: 5, reused: false });
    await expect(page.getByRole("status")).toContainText("Quest cancelled. Your quest record and history are preserved.");
    await expect(page.getByRole("status")).toContainText("5 credits returned to your balance.");
    await expect(page.getByRole("button", { name: "Cancel this quest", exact: true })).toHaveCount(0);
    const after = await tokens();
    expect(after.offChain.credits).toBe(before.offChain.credits);
    const linked = after.transactions.filter((row: { challengeId: string }) => row.challengeId === challenge.id);
    expect(linked).toHaveLength(2);
    expect(linked.filter((row: { type: string; amount: number }) => row.type === "stake" && row.amount === -5)).toHaveLength(1);
    expect(linked.filter((row: { type: string; amount: number }) => row.type === "refund" && row.amount === 5)).toHaveLength(1);
    const retry = await context.request.delete(`${BASE}/api/challenges/${challenge.id}`);
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({ retained: true, status: "cancelled", refundedStake: 0, reused: true });
    expect(await tokens()).toEqual(after);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toContainText("Quest cancelled.");
    const retained = (await (await context.request.get(`${BASE}/api/challenges/${challenge.id}`)).json()).challenge;
    expect(retained.status).toBe("cancelled");
    expect(retained.participants).toHaveLength(1);
    await testInfo.attach("quest-cancellation-receipt", { contentType: "application/json", body: Buffer.from(JSON.stringify({
      challengeId: challenge.id, status: retained.status, retained: true, creditsBefore: before.offChain.credits,
      creditsAfter: after.offChain.credits, linkedLedger: linked, retryRefund: 0, providerCalls: 0,
    })) });
  } finally { await context.close(); }
});
