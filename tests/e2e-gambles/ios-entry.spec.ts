import { expect, test } from "@playwright/test";

type AgentPostBody = {
  message?: string;
  conversationHistory?: unknown[];
  draftState?: { readyToPublish?: boolean };
};

test.describe("iOS entry shell", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });

  test("exposes install metadata and keeps the gateway usable on iPhone", async ({ page, request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()["content-type"]).toContain("manifest");
    const manifest = await manifestResponse.json();
    expect(manifest.start_url).toBe("/enter");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/apple-touch-icon.png", sizes: "180x180" }),
      ]),
    );

    const iconResponse = await request.get("/apple-touch-icon.png");
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");

    await page.goto("/enter");

    await expect(page.locator("link[rel='manifest']")).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator("link[rel='apple-touch-icon']")).toHaveAttribute("href", "/apple-touch-icon.png");

    const handle = page.getByTestId("gateway-handle");
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyOverflowX: window.getComputedStyle(document.body).overflowX,
      standaloneCapable: document
        .querySelector("meta[name='apple-mobile-web-app-capable']")
        ?.getAttribute("content"),
    }));

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.innerWidth).toBe(390);
    expect(metrics.bodyOverflowX).toBe("hidden");
    expect(metrics.standaloneCapable).toBe("yes");
  });

  test("opens the summons composer from a touch hold without burying the pact input", async ({ page }) => {
    await page.goto("/enter");

    const handle = page.getByTestId("gateway-handle");
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();

    const navigation = page.waitForURL(/\/summons(?:\?|$)/, { timeout: 10_000 });
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2_150);
    await page.mouse.up();

    await navigation;

    const input = page.getByPlaceholder(/First to win 3 badminton rallies/);
    await expect(input).toBeVisible();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
    }));

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    await expect
      .poll(async () => {
        const inputBox = await input.boundingBox();
        return inputBox ? inputBox.y + inputBox.height : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(metrics.viewportHeight - 16);
  });

  test("submits a pact prompt from the iPhone composer and shows the agent response", async ({ page }) => {
    const post: { body: AgentPostBody | null } = { body: null };

    await page.route("**/api/agent/respond", async (route) => {
      post.body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userVisibleReply: "Draft ready: sprint duel, video proof, zero-credit stake.",
          agentAction: "show_draft",
          draftPatch: { title: "Sprint duel" },
          toolName: null,
          toolArgs: null,
          draftState: {
            title: "Sprint duel",
            proposition: "Alex beats Ben in a 100m sprint",
            participants: null,
            stake: 0,
            stakeType: "none",
            evidenceType: "video",
            judgeRule: "Fastest video evidence wins",
            timeWindow: "24 hours",
            safetyNotes: [],
            readyToPublish: true,
          },
        }),
      });
    });

    await page.goto("/summons");

    await page.getByPlaceholder(/First to win 3 badminton rallies/).fill("I challenge Ben to a 100m sprint");
    await page.getByRole("button", { name: "Summon", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Sprint duel" })).toBeVisible();
    await expect(page.getByText("Alex beats Ben in a 100m sprint", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Ready to send", { exact: true })).toBeVisible();
    expect(post.body).not.toBeNull();
    if (!post.body) throw new Error("agent request body was not captured");
    const body = post.body;
    expect(body.message).toContain("I challenge Ben to a 100m sprint");
    expect(body.message).toContain("stake 50 credits");
    expect(body.message).toContain("opponent Invite only");
    expect(body.message).toContain("proof window 24 hours");
    expect(body.conversationHistory).toEqual([]);
    expect(body.draftState?.readyToPublish).toBe(false);
  });

  test("opens auth when an iPhone pact submit needs a signed-in user", async ({ page }) => {
    await page.route("**/api/agent/respond", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    await page.goto("/summons");

    await page.getByPlaceholder(/First to win 3 badminton rallies/).fill("I challenge Ben to a 100m sprint");
    await page.getByRole("button", { name: "Summon", exact: true }).click();

    await expect(page.getByText("Sign in to continue")).toBeVisible();
    await expect(page.getByText("Join Summoner.world")).toBeVisible();
  });

  test("opens App Review support from the iPhone entry shell and submits a report", async ({ page }) => {
    let reportBody: { kind?: string; target?: string; reason?: string; contact?: string } | null = null;

    await page.route("**/api/support/report", async (route) => {
      reportBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, reportId: "report_test_1" }),
      });
    });

    await page.goto("/enter");

    await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
    await page.getByRole("link", { name: "Support" }).click();
    await page.waitForURL("**/support");

    await expect(page.getByRole("heading", { name: "Support and Safety" })).toBeVisible();
    await expect(page.getByLabel("Request type")).toHaveValue("report_content");
    await page.getByLabel("Quest, profile, or proof link").fill("https://summoner.world/market/review-target");
    await page.getByLabel("What happened?").fill("This challenge contains unsafe pressure and should be reviewed.");
    await page.getByLabel("Contact email").fill("reviewer@example.com");
    await page.getByRole("button", { name: "Send report" }).click();

    await expect(page.getByText("Report received: report_test_1")).toBeVisible();
    expect(reportBody).toEqual({
      kind: "report_content",
      target: "https://summoner.world/market/review-target",
      reason: "This challenge contains unsafe pressure and should be reviewed.",
      contact: "reviewer@example.com",
    });
  });
});
