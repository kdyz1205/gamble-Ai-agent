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

function textContainsToken(text, token) {
  return text.includes(token) || (token.includes("æ") && text.includes("中文"));
}

function slug(value) {
  return value.replace(/\W+/g, "_") || "home";
}

async function assertNoRawErrors(proof, route, text) {
  const found = rawErrorPatterns.filter((pattern) => text.includes(pattern));
  requireCheck(proof, `${route}_no_raw_errors`, found.length === 0, { found });
}

async function checkRoute(proof, page, route, expected, labelPrefix = "") {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  let text = await bodyText(page);
  for (let attempt = 0; attempt < 24; attempt++) {
    if (expected.every((token) => textContainsToken(text, token))) break;
    if (text.trim() && !/Loading|Checking|Refreshing|Asking/i.test(text)) break;
    await page.waitForTimeout(500);
    text = await bodyText(page);
  }
  const routeKey = `${labelPrefix}${slug(route)}`;
  await assertNoRawErrors(proof, routeKey, text);
  for (const token of expected) {
    const found = textContainsToken(text, token);
    requireCheck(
      proof,
      `${routeKey}_has_${slug(token)}`,
      found,
      { token, snippet: text.slice(0, 800) },
    );
  }
  return text;
}

async function runCoreNavSuite(proof, page, labelPrefix = "") {
  await checkRoute(proof, page, "/", [
    "Bet anything you can prove.",
    "TRY ONE",
    "Solo proof",
    "Answer challenge",
    "Push-up video",
    "Plank hold",
    "MORE LOOPS",
    "Auto detects EN/ZH.",
    "English",
    "中文",
  ], labelPrefix);

  await checkRoute(proof, page, "/markets", [
    "CONTROL ROOM",
    "Refresh",
    "+ New challenge",
  ], labelPrefix);
  await page.getByRole("button", { name: /Refresh|Refreshing/ }).click();
  await page.waitForTimeout(500);
  await assertNoRawErrors(proof, `${labelPrefix}markets_after_refresh`, await bodyText(page));
  await page.getByRole("link", { name: /\+ New challenge/ }).click();
  await page.waitForURL(`${base}/`, { timeout: 20_000 });
  requireCheck(proof, `${labelPrefix}markets_new_challenge_returns_home`, page.url() === `${base}/`, { url: page.url() });

  await checkRoute(proof, page, "/radar", [
    "Challenge Radar",
    "My challenges",
    "Create",
  ], labelPrefix);
  await page.getByRole("link", { name: "My challenges" }).click();
  await page.waitForURL(`${base}/markets`, { timeout: 20_000 });
  requireCheck(proof, `${labelPrefix}radar_my_challenges_link`, page.url() === `${base}/markets`, { url: page.url() });

  await checkRoute(proof, page, "/me", [
    "Sign in to view your profile.",
    "Go home",
  ], labelPrefix);

  await checkRoute(proof, page, "/join/not-a-real-challenge-id", [
    "Can't find this challenge.",
    "Create a new challenge",
    "Back to challenge manager",
  ], labelPrefix);
  await page.getByRole("link", { name: "Back to challenge manager" }).click();
  await page.waitForURL(`${base}/markets`, { timeout: 20_000 });
  requireCheck(proof, `${labelPrefix}missing_join_back_to_manager`, page.url() === `${base}/markets`, { url: page.url() });

  await checkRoute(proof, page, "/challenge/not-a-real-challenge-id", [
    "This challenge or page is not available.",
    "Back to challenge manager",
    "Create new challenge",
  ], labelPrefix);
  await page.getByRole("link", { name: "Back to challenge manager" }).click();
  await page.waitForURL(`${base}/markets`, { timeout: 20_000 });
  requireCheck(proof, `${labelPrefix}missing_challenge_back_to_manager`, page.url() === `${base}/markets`, { url: page.url() });

  await checkRoute(proof, page, "/market/not-a-real-challenge-id", [
    "This challenge or page is not available.",
    "Back to challenge manager",
  ], labelPrefix);

  await checkRoute(proof, page, "/events/not-a-real-event-id", [
    "This challenge or page is not available.",
    "Open radar",
  ], labelPrefix);

  await checkRoute(proof, page, "/challenge/not-a-real-challenge-id/versus", [
    "Sign in to enter the challenge",
    "My challenges",
    "Create challenge",
  ], labelPrefix);

  await checkRoute(proof, page, "/calculator", [
    "Will StepOne make money?",
    "Founder math",
  ], labelPrefix);
  await page.getByRole("button", { name: "Growth" }).click();
  await page.waitForTimeout(300);
  await assertNoRawErrors(proof, `${labelPrefix}calculator_after_preset`, await bodyText(page));
}

const proof = {
  base,
  checks: {},
};

let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await runCoreNavSuite(proof, page, "desktop_");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await runCoreNavSuite(proof, mobile, "mobile_");

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
