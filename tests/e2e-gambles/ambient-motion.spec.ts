import { expect, test } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3017";
const DECORATIONS = ".sum-familiar, .sum-quest-orb, .quest-world-scene__node";
test.use({ channel: "chrome" });

test("world decorations pause on visibility changes and resume; the portal remains usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 8 });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${BASE}/enter`);
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-ambient-motion", "running");
  const running = await page.locator(DECORATIONS).evaluateAll((nodes) => nodes.flatMap((node) => node.getAnimations()).filter((animation) => animation.playState === "running").length);
  expect(running).toBeGreaterThan(0);

  // Exercise the real visibility listener without relying on headless tab focus.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(root).toHaveAttribute("data-ambient-motion", "paused");
  await expect.poll(() => page.locator(DECORATIONS).evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).animationPlayState === "paused"))).toBe(true);
  const before = await page.locator(".quest-world-scene__node").first().evaluate((node) => Number(node.getAnimations()[0]?.currentTime));
  await page.waitForTimeout(350);
  const after = await page.locator(".quest-world-scene__node").first().evaluate((node) => Number(node.getAnimations()[0]?.currentTime));
  expect(Math.abs(after - before)).toBeLessThan(2);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(root).toHaveAttribute("data-ambient-motion", "running");
  await expect.poll(() => page.locator(".quest-world-scene__node").first().evaluate((node) => Number(node.getAnimations()[0]?.currentTime))).toBeGreaterThan(after + 50);
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  await expect(page).toHaveURL(/\/summons\?arrival=gateway/);
  console.log(JSON.stringify({ runningDecorations: running, hiddenAnimationTimeDeltaMs: after - before, resumed: true, portalNavigated: true }));
});

test("low-memory and reduced-motion clients keep decorative loops at rest", async ({ browser }) => {
  const lowMemory = await browser.newContext({ reducedMotion: "no-preference" });
  try {
    await lowMemory.addInitScript(() => Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 2 }));
    const page = await lowMemory.newPage();
    await page.goto(`${BASE}/enter`);
    await expect(page.locator("html")).toHaveAttribute("data-ambient-motion", "paused");
    await expect.poll(() => page.locator(DECORATIONS).evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).animationPlayState === "paused"))).toBe(true);
  } finally { await lowMemory.close(); }

  const reduced = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const page = await reduced.newPage();
    await page.goto(`${BASE}/enter`);
    await expect(page.locator("html")).toHaveAttribute("data-ambient-motion", "paused");
    await expect.poll(() => page.locator(DECORATIONS).evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).animationName === "none"))).toBe(true);
  } finally { await reduced.close(); }
});

test("arena particles respect reduced motion and resume when allowed", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 8 });
    const original = CanvasRenderingContext2D.prototype.clearRect;
    const state = window as unknown as { __particleFrames: number };
    state.__particleFrames = 0;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.className.includes("fixed inset-0")) state.__particleFrames += 1;
      return original.apply(this, args);
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}/challenge/motion-regression/versus`);
  await expect(page.getByRole("heading", { name: "Sign in to enter the arena" })).toBeVisible();
  const frames = () => page.evaluate(() => (window as unknown as { __particleFrames: number }).__particleFrames);
  await page.waitForTimeout(300);
  const reducedFrames = await frames();
  await page.waitForTimeout(300);
  expect(await frames()).toBe(reducedFrames);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(frames).toBeGreaterThan(reducedFrames);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  const stoppedFrames = await frames();
  await page.waitForTimeout(300);
  expect(await frames()).toBe(stoppedFrames);
});
