import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const fixtureId = "visual_p1_read_only_fixture_20261027";
const longTitle = "QA long title " + "484d7b7c33c74098b7c6df0eed545e46".repeat(4);

// Actual React screens/CSS, controlled read-only responses to exercise long user
// content and all invitation labels without creating production users or Quests.
async function fixture(page: Page, status = "disputed", title = longTitle, visibility = "public") {
  await page.route("**/api/auth/session", route => route.fulfill({ json: {} }));
  await page.route(`**/api/challenges/${fixtureId}`, route => route.fulfill({ json: { challenge: {
    id: fixtureId, title, description: "Evidence URL: https://example.invalid/" + "proof".repeat(60),
    creatorId: "visual_fixture_creator", creator: { id: "visual_fixture_creator", username: "host".repeat(35) },
    status, type: "General", visibility, isPublic: visibility === "public", stake: 0, evidenceType: "text",
    rules: "No money or rewards in this layout fixture.", proposition: title,
    arbiter: "ai", maxParticipants: 2, deadline: "2027-01-01T12:00:00.000Z", participants: [],
    evidence: [], judgments: [], _count: { evidence: 0, judgments: 0 }, createdAt: "2026-10-27T00:00:00.000Z",
  } } }));
}
async function hydrated(page: Page) {
  await expect(page.getByTestId("ios-full-app")).toHaveAttribute("data-hydrated", "true");
  await page.evaluate(() => document.fonts.ready);
}
async function noOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({
    viewport: innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    app: document.querySelector(".ios-app")?.getBoundingClientRect().toJSON(),
  }));
  expect(bounds.document, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewport + 1);
}

/** Contrast for a measured solid surface, compositing transparent child layers.
 * Used only on the explicit opaque control/card surfaces below, not image areas.
 * Numeric gates: text >= 4.5:1, meaningful icons >= 3:1 (W3C WCAG 2.2 1.4.3/1.4.11).
 */
async function contrast(locator: Locator) {
  return locator.evaluate(element => {
    const rgb = (value: string): number[] => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
      return [values[0], values[1], values[2], values[3] ?? 1];
    };
    const over = (front: number[], back: number[]): number[] => {
      const a = front[3] + back[3] * (1 - front[3]);
      return [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / (a || 1)).concat(a);
    };
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
    let bg = [255, 255, 255, 1];
    for (const node of chain) bg = over(rgb(getComputedStyle(node).backgroundColor), bg);
    const color = getComputedStyle(element).color;
    const fg = over(rgb(color), bg);
    const luminance = (channels: number[]) => channels.slice(0, 3).map(v => {
      const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }).reduce((n, x, i) => n + x * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(fg), b = luminance(bg);
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), color, background: bg };
  });
}

for (const width of [320, 390, 1440]) {
  test(`long titles stay readable without clipping at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.goto(`${BASE}/app/quest?id=${fixtureId}`);
    await hydrated(page);
    const title = page.locator(".ios-quest-description h1");
    await expect(title).toHaveText(longTitle);
    await page.screenshot({ path: testInfo.outputPath(`long-title-${width}.png`), fullPage: true });
    await noOverflow(page);
    expect(await title.evaluate(el => getComputedStyle(el).overflowX)).not.toBe("hidden");
    expect(await title.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    for (const route of ["quest-created", "quest-complete", "join"]) {
      await page.goto(`${BASE}/app/${route}?id=${fixtureId}`);
      await hydrated(page);
      if (route === "quest-created") await expect(page.locator(".ios-centered-description")).toHaveText(longTitle);
      else if (route === "quest-complete") await expect(page.getByRole("heading", { name: "The result isn't final." })).toBeVisible();
      else await expect(page.locator(".ios-quest-invite h1")).toHaveText(longTitle);
      await noOverflow(page);
    }
  });
}

test("Chinese and URL titles wrap in real Quest and result layouts", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const title of ["每一天都可以认真完成自己的真实挑战".repeat(12), "https://example.invalid/" + "unbroken".repeat(28)]) {
    await page.unrouteAll();
    await fixture(page, "settled", title);
    await page.goto(`${BASE}/app/quest?id=${fixtureId}`);
    await hydrated(page);
    await expect(page.locator(".ios-quest-description h1")).toHaveText(title);
    await noOverflow(page);
    await page.goto(`${BASE}/app/quest-complete?id=${fixtureId}`);
    await expect(page.locator(".ios-quest-detail-card h2")).toHaveText(title);
    await noOverflow(page);
  }
});

for (const width of [390, 1440]) {
  test(`night controls, helper text and navigation retain contrast at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${BASE}/app/settings`);
    await hydrated(page);
    await page.getByLabel("App theme", { exact: true }).selectOption("night");
    await expect(page.getByTestId("ios-full-app")).toHaveClass(/ios-app--night/);
    await page.screenshot({ path: testInfo.outputPath(`night-settings-${width}.png`), fullPage: true });
    for (const selector of [".ios-back svg", ".ios-header__avatar svg"]) {
      const measured = await contrast(page.locator(selector));
      expect(measured.ratio, `${selector} ${JSON.stringify(measured)}`).toBeGreaterThanOrEqual(3);
    }
    for (const selector of [".ios-settings-group .ios-helper", ".ios-setting small", ".ios-setting select", ".ios-tab > span:last-child"]) {
      const nodes = page.locator(selector);
      for (let i = 0; i < await nodes.count(); i++) {
        const measured = await contrast(nodes.nth(i));
        expect(measured.ratio, `${selector}[${i}] ${JSON.stringify(measured)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    await noOverflow(page);
    // Verify preference persistence, not just an injected dark CSS class.
    await page.locator(".ios-header__avatar").click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByTestId("ios-full-app")).toHaveClass(/ios-app--night/);
    await page.goto(`${BASE}/app/settings`);
    await expect(page.getByLabel("App theme", { exact: true })).toHaveValue("night");
    await page.getByLabel("App theme", { exact: true }).selectOption("light");
    await expect(page.getByTestId("ios-full-app")).not.toHaveClass(/ios-app--night/);
    await page.reload();
    await expect(page.getByLabel("App theme", { exact: true })).toHaveValue("light");
    for (const selector of [".ios-back svg", ".ios-header__avatar svg"]) {
      expect((await contrast(page.locator(selector))).ratio).toBeGreaterThanOrEqual(3);
    }
  });
}

test("invitation visibility never claims a disputed/cancelled Quest is open", async ({ page }) => {
  for (const status of ["open", "live", "disputed", "cancelled", "settled"]) {
    await page.unrouteAll();
    await fixture(page, status, "A real status, not a permission claim");
    await page.goto(`${BASE}/app/join?id=${fixtureId}`);
    await expect(page.getByTestId("ios-quest-invite")).toBeVisible();
    await expect(page.locator(".ios-quest-invite__eyebrow")).toContainText("PUBLIC");
    await expect(page.locator(".ios-quest-invite__eyebrow")).not.toContainText("OPEN");
    await expect(page.getByTestId("ios-invitation-state")).toContainText(status.replaceAll("_", " "));
    if (status !== "open") {
      await expect(page.getByText(`This Quest is ${status} and cannot accept a new player.`)).toBeVisible();
      await expect(page.getByTestId("ios-accept-quest")).toHaveCount(0);
    }
  }
  await page.unrouteAll();
  await fixture(page, "open", "Private invitation", "invite_only");
  await page.goto(`${BASE}/app/join?id=${fixtureId}`);
  await expect(page.locator(".ios-quest-invite__eyebrow")).toContainText("PRIVATE");
});
