import { expect, test } from "@playwright/test";

const BASE = process.env.SUM_WORLD_BASE_URL ?? process.env.TEST_BASE_URL ?? "http://127.0.0.1:3057";
const routes = ["/enter", "/summons", "/contracts/bind", "/duel/demo", "/rituals", "/judgment/demo"];
test.use({ channel: "chrome" });
test.setTimeout(150_000);

test("SUM identity, functional portal and primary summon path", async ({ page }) => {
  await page.goto(`${BASE}/enter`, { waitUntil: "networkidle" });
  await expect(page.locator('[data-design-version="sum-world-v3"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your world.");
  await page.getByRole("group", { name: "Choose a quest realm" }).getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".sw-portal")).toHaveAttribute("data-realm", "craft");
  await page.getByRole("link", { name: "Summon create quest", exact: true }).click();
  await expect(page).toHaveURL(/\/summons\?seed=craft/);
  await expect(page.getByRole("textbox", { name: "Describe your challenge" })).toHaveValue(/creative project/);
});

test("all major routes visibly render without horizontal overflow", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".ed-site,.ed-app,.ed-quest-poster,.quest-world-scene")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    }
  }
});

test("starting sparks are editable drafts, not published quests", async ({ page }) => {
  await page.goto(`${BASE}/summons?seed=unknown`, { waitUntil: "networkidle" });
  const input = page.getByRole("textbox", { name: "Describe your challenge" });
  await expect(input).toHaveValue("");
  await expect(page.getByRole("button", { name: "Summon", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /A little further, together/ }).click();
  await expect(input).toHaveValue(/3 rallies/);
  await page.locator(".quest-terms summary").click();
  await page.getByRole("spinbutton").fill("0");
  await page.getByRole("button", { name: "72 hours", exact: true }).click();
  await expect(page.locator(".quest-terms summary")).toContainText("0 credits");
  await expect(page.locator(".quest-terms summary")).toContainText("72 hours");
  expect(new URL(page.url()).pathname).toBe("/summons");
});

test("Familiar roles and clearly marked example chronicle", async ({ page }) => {
  await page.goto(`${BASE}/rituals`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".sw-familiar-display")).toHaveAttribute("data-familiar-role", "Review");
  await expect(page.locator(".sw-familiar-role")).toContainText("Ambiguous proof");
  await page.goto(`${BASE}/judgment/demo`, { waitUntil: "networkidle" });
  await expect(page.locator(".sw-chronicle-card")).toContainText("EXAMPLE ONLY");
  await expect(page.locator("main")).not.toContainText("98%");
  await expect(page.getByRole("button", { name: "Share this example" })).toBeEnabled();
});

test("mobile navigation, skip link and legacy profile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/enter`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Skip to main content");
  await page.keyboard.press("Enter");
  await expect(page.locator("#world-introduction")).toBeFocused();
  await page.goto(`${BASE}/summons`, { waitUntil: "networkidle" });
  await page.locator(".quest-mobile-dock").getByRole("link", { name: "Familiars", exact: true }).click();
  await expect(page).toHaveURL(/\/rituals$/);
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/me(?:\?|$)/);
});
