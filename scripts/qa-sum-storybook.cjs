/**
 * Read-only iPhone + web visual release gate for SUM Storybook.
 * No account mutation, order creation, proof upload, judgement or settlement.
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const BASE = process.env.SUM_STORYBOOK_BASE || "http://127.0.0.1:3082";
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.SUM_STORYBOOK_OUT || path.join(ROOT, "output", "storybook-qa");
const QUICK = Boolean(process.env.SUM_STORYBOOK_QUICK);
const VIEWPORTS = QUICK ? [390, 1440] : [320, 390, 768, 1440];
const ROUTES = QUICK
  ? ["/enter", "/summons", "/markets", "/me", "/rituals"]
  : ["/enter", "/summons", "/markets", "/me", "/rituals",
     "/contracts/bind", "/duel/demo", "/judgment/demo",
     "/reviews", "/privacy", "/terms", "/support", "/calculator"];
fs.mkdirSync(OUT, { recursive: true });
const report = { base: BASE, generatedAt: new Date().toISOString(), cases: [], failures: [] };

async function verify(label, fn) {
  try {
    const details = await fn();
    report.cases.push({ label, passed: true, details });
    console.log("PASS", label);
  } catch (err) {
    report.failures.push({ label, error: err.message });
    report.cases.push({ label, passed: false, error: err.message });
    console.log("FAIL", label, err.message);
  }
}
async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--disable-gpu", "--disable-extensions"],
  });
  try {
    for (const width of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width, height: width < 500 ? 844 : 950 },
        reducedMotion: "reduce", deviceScaleFactor: 1,
        isMobile: width <= 430, hasTouch: width <= 430,
      });
      const page = await context.newPage();
      const routes = width === 390 ? ROUTES : ["/enter", "/summons", "/markets", "/me", "/rituals"];
      for (const route of routes) {
        const label = route + " @" + width;
        await verify(label, async () => {
          const errors = [];
          const listener = err => errors.push(err.message);
          page.on("pageerror", listener);
          try {
            const response = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
            assert(response && response.status() === 200, "Expected HTTP 200, got " + (response?.status() || "none"));
            const data = await page.evaluate(() => {
              const dock = document.querySelector('[data-testid="sum-app-dock"]');
              const header = document.querySelector("h1");
              return {
                overflow: document.documentElement.scrollWidth - innerWidth,
                dockCount: document.querySelectorAll('[data-testid="sum-app-dock"]').length,
                dockVisible: dock ? getComputedStyle(dock).display !== "none" && dock.getBoundingClientRect().height > 0 : false,
                dockLabels: dock ? [...dock.querySelectorAll("a")].map(a => a.getAttribute("aria-label")) : [],
                dockSelected: dock ? [...dock.querySelectorAll("a[aria-current=page]")].map(a => a.getAttribute("href")) : [],
                title: document.title,
                h1: header?.innerText,
              };
            });
            assert(data.overflow <= 1, "horizontal overflow " + data.overflow + "px");
            assert(data.dockCount === 1, "shared app dock must appear exactly once");
            assert.equal(data.dockVisible, width < 960, "responsive app dock visibility");
            assert.equal(data.dockLabels.length, 5, "app nav needs five destinations");
            assert(errors.length === 0, "uncaught JavaScript errors: " + errors.join("; "));
            if (["/enter", "/summons", "/me", "/rituals"].includes(route)) {
              assert(data.h1?.length, "expected visible semantic page heading");
            }
            if (route === "/enter" || (width === 390 && ["/summons", "/me", "/markets", "/rituals"].includes(route))) {
              const file = path.join(OUT, route.slice(1).replace(/\W/g, "-") + "-" + width + ".png");
              await page.screenshot({ path: file, fullPage: width === 390, animations: "disabled", timeout: 30000 });
            }
            return data;
          } finally {
            page.off("pageerror", listener);
          }
        });
      }
      if (width === 390) {
        await verify("Mobile portal realm selection enters a real editable quest", async () => {
          await page.goto(BASE + "/enter", { waitUntil: "domcontentloaded" });
          const button = page.getByRole("button", { name: "Create", exact: true });
          await button.waitFor({ state: "visible" });
          await button.click();
          const gate = page.getByTestId("sum-spatial-gate");
          await page.waitForFunction(() => document.querySelector('[data-testid="sum-spatial-gate"]')?.getAttribute("data-realm") === "craft");
          assert.equal(await gate.getAttribute("data-realm"), "craft");
          await gate.getByRole("link", { name: "Summon create quest" }).click();
          await page.waitForURL(/\/summons\?seed=craft/, { waitUntil: "commit", timeout: 30000 });
          const editor = page.getByRole("textbox", { name: "Describe your challenge" });
          await editor.waitFor({ state: "visible", timeout: 20000 });
          assert((await editor.inputValue()).includes("creative project"), "editor should retain the chosen example");
          return { path: new URL(page.url()).pathname, excerpt: (await editor.inputValue()).slice(0, 60) };
        });
      }
      await context.close();
    }
    await verify("Capacitor fallback has branded offline text and usable recovery link", async () => {
      const html = fs.readFileSync(path.join(ROOT, "ios-shell", "index.html"), "utf8");
      assert(html.includes("Pico is opening") && html.includes('href="https://summoner.world/enter"'));
      return { ok: true };
    });
    await verify("App Store icon, splash and PWA assets have required dimensions", async () => {
      const sizes = [
        ["public/icon-192.png", 192], ["public/icon-512.png", 512],
        ["public/apple-touch-icon.png", 180],
        ["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024],
        ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", 2732],
        ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png", 2732],
        ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png", 2732],
      ];
      for (const [file, target] of sizes) {
        const metadata = await sharp(path.join(ROOT, file)).metadata();
        assert(metadata.width === target && metadata.height === target, file + " dimensions");
        assert(metadata.hasAlpha === false, file + " must be opaque to avoid app icon/transparency issue");
      }
      return sizes.map(([file, dimension]) => ({ file, dimension }));
    });
    await verify("Capacitor web assets copied into the native iOS bundle", async () => {
      const expected = fs.readFileSync(path.join(ROOT, "ios-shell/index.html"));
      const actual = fs.readFileSync(path.join(ROOT, "ios/App/App/public/index.html"));
      assert(expected.equals(actual), "Capacitor iOS public shell must match the updated local fallback");
      return { bytes: actual.length, matching: true };
    });
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "verification.json"), JSON.stringify(report, null, 2));
  console.log("STORYBOOK_QA", report.cases.length - report.failures.length, "/", report.cases.length,
              "failures", report.failures.length);
  process.exitCode = report.failures.length ? 1 : 0;
}
main().catch(err => { console.error(err.stack); process.exitCode = 1; });
