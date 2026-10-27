import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
async function prepare(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/csrf", (route) => route.fulfill({ json: { csrfToken: "isolated-ui-csrf-fixture" } }));
  await page.route("**/api/auth/providers", (route) => route.fulfill({ json: {
    credentials: { id: "credentials", name: "credentials", type: "credentials", signinUrl: `${BASE}/api/auth/signin/credentials`, callbackUrl: `${BASE}/api/auth/callback/credentials` },
    google: { id: "google", name: "Google", type: "oauth", signinUrl: `${BASE}/api/auth/signin/google`, callbackUrl: `${BASE}/api/auth/callback/google` },
  } }));
}
async function fill(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("you@email.com").fill("ui-regression@example.invalid");
  await dialog.locator('input[type="password"]').fill("fixture-password-not-a-real-account");
}

test("an HTTP failure without a NextAuth error parameter never displays successful sign-in", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/auth/callback/credentials", (route) => route.fulfill({
    status: 503, json: { url: `${BASE}/app/today` },
  }));
  await page.goto(`${BASE}/auth/signin`);
  await fill(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Sign-in did not complete");
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await expect(page.getByText("You're in! Your quest world is ready.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
});

test("closing sign-in invalidates a delayed completion instead of navigating the user back", async ({ page }) => {
  await prepare(page);
  let release: () => void = () => {};
  let started: () => void = () => {};
  const callbackStarted = new Promise<void>((resolve) => { started = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/auth/callback/credentials", async (route) => {
    started(); await held;
    await route.fulfill({ json: { url: `${BASE}/app/today` } });
  });
  await page.goto(`${BASE}/auth/signin`);
  await fill(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await callbackStarted;
  await page.getByRole("button", { name: "Close sign-in" }).click();
  await expect(page).toHaveURL(BASE + "/enter");
  const returned = page.waitForResponse("**/api/auth/callback/credentials");
  release();
  await returned;
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe("/enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("successful sign-in preserves a same-origin Quest destination", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/auth/callback/credentials", (route) => route.fulfill({ json: { url: `${BASE}/app/today` } }));
  const target = "/app/quiz?id=auth_return_fixture_20261027";
  await page.goto(`${BASE}/auth/signin?callbackUrl=${encodeURIComponent(BASE + target)}`);
  await fill(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(BASE + target);
});

test("legacy authentication endpoints return explicit non-success responses over HTTP", async ({ request }) => {
  for (const name of ["login", "register"]) {
    const response = await request.post(`${BASE}/api/auth/${name}`, {
      data: "{", headers: { "content-type": "application/json" },
    });
    expect(response.status()).toBe(410);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toMatchObject({ code: "AUTH_USE_NEXTAUTH", signInPath: "/auth/signin" });
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});
