import { expect, test } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3047";
const routes = ["/enter", "/summons", "/contracts/bind", "/duel/demo", "/rituals", "/judgment/demo"];
test.use({ channel: "chrome" });

test("editorial landing is a new composition and the primary CTA works", async ({ page }) => {
  await page.goto(`${BASE}/enter`);
  await expect(page.locator('[data-design-version="editorial-v2"]')).toBeVisible();
  await expect(page.locator("h1")).toContainText("Less scrolling.");
  await expect(page.locator(".quest-world-scene")).toHaveCount(0);
  await page.getByRole("link", { name: "Make your first quest" }).click();
  await expect(page).toHaveURL(/\/summons$/);
  await expect(page.getByRole("textbox", { name: "Describe your challenge" })).toBeVisible();
});

test("all six pages share the new navigation and visible content", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of routes) {
    const response = await page.goto(`${BASE}${route}`);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".ed-desktop-nav")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), route).toBeLessThanOrEqual(1);
  }
});

test("mobile pages do not overflow", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(`${BASE}${route}`);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${route} ${width}`).toBeLessThanOrEqual(1);
    }
  }
});

test("sample idea updates the existing composer without publishing", async ({ page }) => {
  await page.goto(`${BASE}/summons`);
  await page.getByRole("button", { name: "Meet me on the court" }).click();
  await expect(page.getByRole("textbox", { name: "Describe your challenge" })).toHaveValue(/first to win 3 rallies/i);
  await expect(page.getByRole("button", { name: "Summon", exact: true })).toBeEnabled();
});

test("example results are not presented as verified real results", async ({ page }) => {
  await page.goto(`${BASE}/judgment/demo`);
  await expect(page.getByText("EXAMPLE ONLY · NOT A VERIFIED RESULT")).toBeVisible();
  await expect(page.getByText("98%", { exact: true })).toHaveCount(0);
  await page.goto(`${BASE}/profile`);
  await expect(page).toHaveURL(/\/me(?:\?|$)/);
});
