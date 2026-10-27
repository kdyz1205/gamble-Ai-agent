import { expect, test } from "@playwright/test";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

test("a successful HTTP status without a support receipt preserves the user's report", async ({ page }) => {
  await page.route("**/api/support/report", (route) => route.fulfill({ json: {} }));
  await page.goto(`${BASE}/support`);
  const form = page.locator("form").filter({ has: page.getByLabel("What happened?") });
  await form.getByLabel("Quest, profile, or proof link").fill("https://summoner.world/app/quest?id=fixture");
  await form.getByLabel("What happened?").fill("Please preserve this report when the receipt is missing.");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("alert")).toContainText("not confirmed");
  await expect(form.getByLabel("What happened?")).toHaveValue("Please preserve this report when the receipt is missing.");
  await expect(form.getByLabel("Quest, profile, or proof link")).not.toBeEmpty();
  await expect(form.getByRole("button", { name: "Send report" })).toBeEnabled();
});

test("pending support submission is single-owner and cannot erase edits made in flight", async ({ page }) => {
  let writes = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/support/report", async (route) => {
    writes++; await held;
    await route.fulfill({ json: { ok: true, reportId: "isolated-support-receipt" } });
  });
  await page.goto(`${BASE}/support`);
  const form = page.locator("form").filter({ has: page.getByLabel("What happened?") });
  await form.getByLabel("Request type").selectOption("block_user");
  await expect(form.getByLabel("Request type").locator('option:checked')).toHaveText("Request a user block");
  await form.getByLabel("What happened?").fill("Synthetic report for the in-flight submission boundary.");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(form.getByLabel("What happened?")).toBeDisabled();
  await expect(form.getByLabel("Request type")).toBeDisabled();
  // The native disabled button is not the only defense: a second submit event
  // also cannot create another request before the first one is acknowledged.
  await form.dispatchEvent("submit");
  await page.waitForTimeout(100);
  expect(writes).toBe(1);
  release();
  await expect(form.getByRole("status")).toContainText("Report received for review: isolated-support-receipt");
  await expect(form.getByLabel("What happened?")).toBeEmpty();
  await expect(form.getByLabel("What happened?")).toBeEnabled();
});
