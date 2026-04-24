import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the 10-gamble E2E harness.
 *
 * We record one video per test (per gamble) and save them to
 * gambles-recordings/ so the user can review all 10 flows in the repo.
 *
 * Runs serially (workers=1) so the recordings don't interleave and so we
 * don't stampede the agent endpoint with parallel LLM calls.
 */
export default defineConfig({
  testDir: "./tests/e2e-gambles",
  testIgnore: ["**/seed-users.ts", "**/bets.ts", "**/helpers.ts", "**/users.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 5 * 60 * 1000, // 5 min per gamble (agent + judgment can be slow on cold starts)
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "./tests/e2e-gambles/.playwright",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1280, height: 800 },
    video: "on",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
