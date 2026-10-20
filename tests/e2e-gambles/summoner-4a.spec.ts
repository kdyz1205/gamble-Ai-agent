import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3037";
const SCREENSHOTS = join(process.cwd(), "output", "summoner-4a-20261020");
const routes = [
  ["/summons", /challenging your friend/i],
  ["/contracts/bind", /everyone sees the same quest/i],
  ["/duel/demo", /bring the quest proof together/i],
  ["/rituals", /familiar/i],
  ["/judgment/demo", /result you can actually understand/i],
] as const;

test.use({ channel: "chrome" });
test.beforeAll(() => mkdirSync(SCREENSHOTS, { recursive: true }));
test.setTimeout(150_000);

test("desktop entry: editorial story, visible CTA, no clipping, working portal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto(`${BASE}/enter`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Say it.");
  await expect(page.getByRole("heading", { name: /from a friendly dare to a clear result/i })).toBeVisible();
  await expect(page.locator(".gateway-story__step")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Enter World" })).toBeVisible();
  await expect(page.getByRole("link", { name: /skip to main content/i })).toHaveCount(1);
  await page.screenshot({ path: join(SCREENSHOTS, "landing-desktop.png"), fullPage: true, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Enter World" }).click();
  await expect(page).toHaveURL(/\/summons\?arrival=gateway/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("all six active routes: page content and shared navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [path, title] of routes) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), path).toContainText(title);
    await expect(page.getByRole("navigation", { name: "Quest world navigation" }).first()).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${path}`).toBeLessThanOrEqual(2);
  }
  await page.goto(`${BASE}/judgment/demo`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/illustrative demo, not a real participant/i)).toBeVisible();
  await page.screenshot({ path: join(SCREENSHOTS, "results-desktop.png"), fullPage: true, animations: "disabled" });
});

test("mobile entry and results: legible, keyboard-friendly navigation, no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/enter", "/judgment/demo"]) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `mobile overflow at ${path}`).toBeLessThanOrEqual(2);
    await page.screenshot({ path: join(SCREENSHOTS, path === "/enter" ? "landing-mobile.png" : "results-mobile.png"), fullPage: true, animations: "disabled" });
  }
  await expect(page.getByRole("navigation", { name: "Quest world navigation" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "Results", exact: true }).last()).toBeVisible();
});

test("legacy profile is routed to the existing account page", async ({ page }) => {
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await expect(page).toHaveURL(/\/me(?:\?|$)/);
});
