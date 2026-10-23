/**
 * Read-only SUM design acceptance checks for visual refinement.
 * Captures responsive evidence and checks navigability without changing quests or credits.
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const base = process.env.SUM_VISUAL_BASE || "http://127.0.0.1:3079";
const out = process.env.SUM_VISUAL_OUT || path.join(process.cwd(), "output", "visual-refinement");
const widths = process.env.SUM_VISUAL_WIDTHS
  ? process.env.SUM_VISUAL_WIDTHS.split(",").map(Number)
  : process.env.SUM_VISUAL_QUICK ? [390, 1440] : [320, 390, 768, 1440];
fs.mkdirSync(out, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--disable-gpu"],
  });
  const report = { base, checks: [], capturedAt: new Date().toISOString() };
  let failures = 0;
  try {
    for (const width of widths) {
      const page = await browser.newPage({
        viewport: { width, height: width < 500 ? 844 : 950 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.message));
      const response = await page.goto(base + "/enter", { waitUntil: "commit", timeout: 30000 });
      await page.locator("h1").waitFor({ state: "visible", timeout: 20000 });
      await page.screenshot({
        path: path.join(out, "home-" + width + ".png"),
        animations: "disabled",
        fullPage: width === 390 || width === 1440,
        timeout: 30000,
      });
      const metrics = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        const hero = document.querySelector(".sum-award-hero");
        const portal = document.querySelector(".sum-gate");
        const header = document.querySelector(".sw-header");
        const button = document.querySelector('[data-testid="world-summon-cta"]');
        const body = document.body;
        const rect = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        };
        return {
          overflowPx: Math.max(document.documentElement.scrollWidth, body.scrollWidth) - innerWidth,
          h1: rect(h1),
          hero: rect(hero),
          portal: rect(portal),
          header: rect(header),
          primaryAction: rect(button),
          headingText: h1?.innerText,
          overflowingElements: Array.from(document.querySelectorAll("*"))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); })
            .slice(0, 12).map(el => ({ tag: el.tagName, className: typeof el.className === "string" ? el.className.slice(0, 100) : "", right: Math.round(el.getBoundingClientRect().right), left: Math.round(el.getBoundingClientRect().left) })),
          interactiveRealms: Array.from(document.querySelectorAll(".sum-gate__tabs button")).map(n => n.innerText.trim()),
        };
      });
      const checks = [];
      const check = (name, fn) => {
        try { fn(); checks.push({ name, passed: true }); }
        catch (err) { failures++; checks.push({ name, passed: false, error: err.message }); }
      };
      check("GET 200", () => assert.equal(response.status(), 200));
      check("No horizontal overflow", () => assert(metrics.overflowPx <= 1, "overflow " + metrics.overflowPx + "px"));
      check("Hero heading present", () => assert(metrics.h1?.height > 20));
      check("Action discoverable", () => assert(metrics.primaryAction?.width >= 100));
      check("Interactive realm selector", () => assert.equal(metrics.interactiveRealms.length, 3));
      check("No uncaught errors", () => assert.deepEqual(errors, []));
      report.checks.push({ width, metrics, checks, errors });
      console.log(width + "px", checks.map(x => x.passed ? "PASS" : "FAIL").join(" "), "overflow", metrics.overflowPx, "offenders", JSON.stringify(metrics.overflowingElements));
      fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(report, null, 2));
      if (width === 390) {
        const gate = page.getByTestId("sum-spatial-gate");
        const create = page.getByRole("button", { name: "Create", exact: true });
        await create.click();
        await page.waitForTimeout(400);
        if ((await gate.getAttribute("data-realm")) !== "craft") {
          console.log("HYDRATION_RACE: first Create click did not update the selection");
          failures++;
          await page.waitForTimeout(1500);
          await create.click();
        }
        const selectedRealm = await gate.getAttribute("data-realm");
        const href = await gate.getByRole("link", { name: "Summon create quest" }).getAttribute("href");
        if (selectedRealm !== "craft" || !href?.includes("seed=craft")) {
          failures++;
          console.log("FAIL mobile realm selection", selectedRealm, href);
        } else {
          console.log("PASS mobile realm switch changes the real navigation destination");
          await gate.getByRole("link", { name: "Summon create quest" }).click();
          console.log("NAVIGATION_AFTER_CLICK", page.url());
          await page.waitForURL(/\/summons\?seed=craft/, { waitUntil: "commit", timeout: 30000 });
          const editor = page.getByRole("textbox", { name: "Describe your challenge" });
          await editor.waitFor({ state: "visible", timeout: 20000 });
          assert((await editor.inputValue()).includes("creative project"), "selected realm must prefill the real editor");
          console.log("PASS selected realm opens the real, prefilled quest composer");
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(report, null, 2));
  console.log("SUM_VISUAL_QA", failures ? "FAILED" : "PASS", "failures=" + failures, "screenshots=" + out);
  process.exitCode = failures ? 1 : 0;
}
main().catch(err => { console.error(err.stack); process.exitCode = 1; });
