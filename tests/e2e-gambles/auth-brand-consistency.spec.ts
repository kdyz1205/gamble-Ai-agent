import { expect, test } from "@playwright/test";

/**
 * Focused layout checks for the three entry surfaces of Summoners World.
 * They require a running local Next server; no account or DB mutation.
 */
test.use({
  baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
  channel: process.env.SUM_AUTH_SYSTEM_CHROME === "1" ? "chrome" : undefined,
});

test.describe("Summoners World entry, auth and recovery", () => {
  test("landing page exposes a consistent sign-in portal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/enter");
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/signin$/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome back, Summoner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  test("mobile login does not show the application dock over the modal", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/auth/signin");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".sum-app-dock")).toHaveCount(0);
    await expect(page.locator(".auth-portal")).toHaveCSS("border-radius", "28px");
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Close sign-in" }).click();
    await expect(page).toHaveURL(/\/enter$/);
    expect(pageErrors).toEqual([]);
  });

  test("failed Google callback renders branded recovery, not an empty or generic error", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/auth/error?error=OAuthCallback");
    await expect(page.getByRole("heading", { name: "Google sign-in could not finish." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try signing in again" })).toHaveAttribute("href", "/auth/signin");
    await expect(page.locator(".sum-app-dock")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
