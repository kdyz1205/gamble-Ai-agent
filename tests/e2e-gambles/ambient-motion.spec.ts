import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

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
  await page.goto(`${process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000"}/challenge/motion-regression/versus`);
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
