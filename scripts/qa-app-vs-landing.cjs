/**
 * Read-only app/landing separation smoke. No account writes, uploads, stakes,
 * challenge publication or settlement. Run against preview or local Next.
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const base = (process.env.SUM_IOS_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const executablePath = process.platform === "win32"
  ? (process.env.SUM_IOS_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe")
  : undefined;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const width of [320, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));

      const gateway = await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
      assert.equal(gateway.status(), 200, "Public website root must work");
      assert.equal(await page.getByTestId("sum-marketing-site").count(), 1,
        "The domain root must render the website, not a product redirect");
      assert.equal(await page.locator("[data-testid=ios-tabbar]").count(), 0, "Landing is not the app");
      assert.equal(await page.locator("[data-testid=sum-app-dock]").count(), 0, "Marketing has no game tab bar");
      const launch = page.getByTestId("world-summon-cta");
      const publicLinks = await page.locator('[data-testid="sum-marketing-site"] a')
        .evaluateAll(nodes=>nodes.map(node=>node.getAttribute("href")));
      assert(!publicLinks.some(href=>/^\/(summons|markets|rituals|judgment)(?:\/|\?|$)/.test(href||"")),
        "Website cards must not launch a legacy competing client");
      assert.equal(await launch.getAttribute("href"), "/app", "Gateway should launch the separate app");

      await launch.click();
      await page.waitForURL(/\/app\/today\/?$/, { timeout: 45000 });
      assert.equal(await page.locator("[data-testid=ios-full-app]").count(), 1, "Web app frame");
      assert.equal(await page.getByTestId("ios-full-app").getAttribute("data-product-surface"),"web-app");
      assert.equal(await page.locator("[data-testid=ios-tabbar]").count(), 1, "Single app dock");
      assert.equal(await page.locator(".sw-hero").count(), 0, "No marketing hero inside app");
      assert.equal(await page.locator("[data-testid=ios-start-quest]").getAttribute("href"), "/app/create");
      assert.equal(await page.locator('nav[aria-label="Choose a game mode"] a').count(), 4);
      const focus = await page.locator("[data-testid=ios-start-quest]").boundingBox();
      assert(focus && focus.y < 844, "Primary real action must appear on first mobile screen");
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert(dimensions.document <= dimensions.viewport + 1, "App dashboard must not scroll sideways");

      for (const route of ["/app/discover", "/app/create", "/app/picos"]) {
        const result = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 45000 });
        assert.equal(result.status(), 200, route);
        assert.equal(await page.locator("[data-testid=ios-tabbar]").count(), 1, "Single dock on " + route);
        assert.equal(await page.locator(".sw-hero,.ios-discover-hero,.ios-create-hero").count(), 0, "No landing billboard on " + route);
        const size = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(size <= 1, route + " horizontal overflow=" + size);
      }
      assert.equal(await page.getByRole("link", { name: "Home" }).count(), 1);
      await page.getByRole("link", { name: "Home" }).click();
      await page.waitForURL(/\/app\/today\/?$/, { timeout: 45000 });
      assert.deepEqual(errors, [], "No browser runtime errors");
      console.log("PASS app-vs-landing width=" + width + " (gateway -> real app, 5 tab dock, 4 play modes)");
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error("FAIL app-vs-landing", error.stack || error); process.exitCode = 1; });
