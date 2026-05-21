import { chromium } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "http://localhost:3000";

const rawErrorPatterns = [
  "API request failed (500)",
  "Unhandled Runtime Error",
  "Application error",
  "TypeError:",
  "ReferenceError:",
];

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`Click-flow smoke failed: ${name}`);
}

async function bodyText(page) {
  return page.locator("body").innerText({ timeout: 10_000 });
}

async function assertNoRawErrors(proof, route, text) {
  const found = rawErrorPatterns.filter((pattern) => text.includes(pattern));
  requireCheck(proof, `${route}_no_raw_errors`, found.length === 0, { found });
}

async function checkRoute(proof, page, route, expected) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
  const text = await bodyText(page);
  await assertNoRawErrors(proof, route.replace(/\W+/g, "_") || "home", text);
  for (const token of expected) {
    requireCheck(
      proof,
      `${route.replace(/\W+/g, "_") || "home"}_has_${token.replace(/\W+/g, "_")}`,
      text.includes(token),
      { token, snippet: text.slice(0, 800) },
    );
  }
  return text;
}

const proof = {
  base,
  checks: {},
};

let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await checkRoute(proof, page, "/", [
    "Turn any dare into a playable challenge.",
    "TAP TO START",
  ]);

  await checkRoute(proof, page, "/markets", [
    "MANAGE CHALLENGES",
    "Refresh",
    "+ New challenge",
  ]);
  await page.getByRole("button", { name: /Refresh|Refreshing/ }).click();
  await page.waitForTimeout(500);
  await assertNoRawErrors(proof, "markets_after_refresh", await bodyText(page));
  await page.getByRole("link", { name: /\+ New challenge/ }).click();
  await page.waitForURL(`${base}/`, { timeout: 20_000 });
  requireCheck(proof, "markets_new_challenge_returns_home", page.url() === `${base}/`, { url: page.url() });

  await checkRoute(proof, page, "/radar", [
    "Challenge Radar",
    "My challenges",
    "Create",
  ]);
  await page.getByRole("link", { name: "My challenges" }).click();
  await page.waitForURL(`${base}/markets`, { timeout: 20_000 });
  requireCheck(proof, "radar_my_challenges_link", page.url() === `${base}/markets`, { url: page.url() });

  await checkRoute(proof, page, "/me", [
    "Sign in to view your profile.",
    "Go home",
  ]);

  await checkRoute(proof, page, "/join/not-a-real-challenge-id", [
    "Can't find this challenge.",
    "Create a new challenge",
    "Back to challenge manager",
  ]);
  await page.getByRole("link", { name: "Back to challenge manager" }).click();
  await page.waitForURL(`${base}/markets`, { timeout: 20_000 });
  requireCheck(proof, "missing_join_back_to_manager", page.url() === `${base}/markets`, { url: page.url() });

  await checkRoute(proof, page, "/calculator", [
    "Will LuckyPlay make money?",
    "Founder math",
  ]);

  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  console.error(JSON.stringify(proof, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
