/**
 * Browser input-level regression for the SUM body scroll trap.
 * Exercises actual wheel and keyboard input; also touch swipe on mobile Chrome.
 * Read-only against the site (no API writes or user mutations).
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const BASE = process.env.SUM_SCROLL_BASE || "http://127.0.0.1:3000";
const ROUTES = (process.env.SUM_SCROLL_ROUTES || "/duel/demo,/enter,/summons,/contracts/bind,/rituals,/judgment/demo").split(",");
const VIEWPORTS = process.env.SUM_SCROLL_WIDTHS
  ? process.env.SUM_SCROLL_WIDTHS.split(",").map(Number)
  : [1440, 390];
const results = [];

async function snapshot(page) {
  return page.evaluate(() => ({
    top: Math.round(window.scrollY),
    extent: document.documentElement.scrollHeight - window.innerHeight,
    rootOverflow: getComputedStyle(document.documentElement).overflowY,
    bodyOverflow: getComputedStyle(document.body).overflowY,
    bodyScrollChaining: getComputedStyle(document.body).overscrollBehaviorY,
  }));
}

async function swipe(page, fromY, toY) {
  const cdp = await page.context().newCDPSession(page);
  const x = Math.round(page.viewportSize().width * .47);
  const pointer = y => [{ x, y: Math.round(y), id: 1, force: 1, radiusX: 3, radiusY: 3 }];
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pointer(fromY) });
    for (let i = 1; i <= 12; i++) {
      const y = fromY + (toY - fromY) * i / 12;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pointer(y) });
      await page.waitForTimeout(25);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
  } finally {
    await cdp.detach();
  }
}

async function test(page, route, width) {
  const response = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 35000 });
  assert.equal(response?.status(), 200, "route must load");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const first = await snapshot(page);
  assert(first.extent > 350, "route must be tall enough to test both directions");
  assert.equal(first.bodyScrollChaining, "auto", "body must allow vertical wheel chaining");

  await page.mouse.move(Math.round(width * .42), Math.round(page.viewportSize().height * .57));
  await page.mouse.wheel(0, 566);
  await page.waitForTimeout(400);
  const down = await snapshot(page);
  assert(down.top > 80, "wheel down was swallowed");

  await page.mouse.wheel(0, -270);
  await page.waitForTimeout(400);
  const up = await snapshot(page);
  assert(up.top + 50 < down.top, "wheel up was swallowed");

  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  const end = await snapshot(page);
  assert(end.top > Math.max(up.top + 30, first.extent * .66), "keyboard End did not reach bottom");
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const home = await snapshot(page);
  assert(home.top < 35, "keyboard Home did not return to top");

  const trace = { route, width, before: first, wheelDown: down.top, wheelUp: up.top, end: end.top, home: home.top };
  if (width <= 430) {
    await swipe(page, 610, 255);
    const fingerUp = await snapshot(page);
    assert(fingerUp.top > 45, "touch swipe up did not scroll page down");
    await swipe(page, 280, 645);
    const fingerDown = await snapshot(page);
    assert(fingerDown.top + 35 < fingerUp.top, "touch swipe down did not scroll page up");
    trace.touchDown = fingerUp.top;
    trace.touchUp = fingerDown.top;
  }
  return trace;
}

async function main() {
  let errors = 0;
  const browser = await chromium.launch({
    headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--disable-extensions","--disable-gpu"],
  });
  try {
    for (const width of VIEWPORTS) {
      const mobile = width <= 430;
      const page = await browser.newPage({
        viewport: { width, height: mobile ? 844 : 900 },
        isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce",
      });
      for (const route of ROUTES) {
        try {
          const trace = await test(page, route, width);
          results.push({ status: "pass", ...trace });
          console.log("PASS", width, route, JSON.stringify({
            wheel:[trace.wheelDown, trace.wheelUp], keys:[trace.end,trace.home],
            touch:mobile?[trace.touchDown,trace.touchUp]:null,
          }));
        } catch (e) {
          errors++;
          results.push({ status: "fail", width, route, reason: e.message });
          console.log("FAIL", width, route, e.message);
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  console.log("SCROLL_ACCEPTANCE", results.length - errors, "/", results.length, "failed", errors);
  if (process.env.SUM_SCROLL_REPORT) {
    require("node:fs").writeFileSync(process.env.SUM_SCROLL_REPORT, JSON.stringify(results, null, 2));
  }
  process.exitCode = errors ? 1 : 0;
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
