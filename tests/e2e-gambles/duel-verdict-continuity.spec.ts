import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const ID = "synthetic_duel_verdict_continuity_20261103";
const PLAYER = "duel_player_a";
const OPPONENT = "duel_player_b";

function duel(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: ID, title: "Synthetic badminton duel", description: "Contract fixture, not a real challenge",
    creatorId: PLAYER, creator: { id: PLAYER, username: "Creator" }, type: "Sport",
    status, stake: 5, stakeToken: "credits", evidenceType: "text", settlementMode: "credits",
    rules: "One verified game", visibility: "invite_only", isPublic: false, maxParticipants: 2,
    createdAt: "2026-10-28T00:00:00Z", deadline: "2027-01-01T12:00:00Z",
    participants: [
      { id: "participant_a", role: "creator", status: "accepted", user: { id: PLAYER, username: "Creator", image: null } },
      { id: "participant_b", role: "opponent", status: "accepted", user: { id: OPPONENT, username: "Opponent", image: null } },
    ],
    evidence: [
      { id: "evidence_a", userId: PLAYER, type: "text", description: "Creator proof", url: null },
      { id: "evidence_b", userId: OPPONENT, type: "text", description: "Opponent proof", url: null },
    ],
    judgments: [{ id: "judgment_1", winnerId: PLAYER, winner: { id: PLAYER, username: "Creator" },
      method: "rules", aiModel: "Rules", reasoning: "One game was verified.", confidence: null, status: "complete" }],
    verdictResponses: [], reviewCase: null, ...overrides,
  };
}

async function setup(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/auth/session", route => route.fulfill({
    json: { user: { id: PLAYER, name: "Creator", credits: 40, email: "creator@example.invalid" },
      expires: "2027-01-01T00:00:00Z" },
  }));
}

test.use({ viewport: { width: 390, height: 844 }, video: "off",
  ...(process.env.CI ? {} : { channel: "chrome" }),
});
test.setTimeout(55_000);

test("disputed duel displays proposed result and lets the player accept, without promising credit payout", async ({ page }) => {
  await setup(page);
  let challenge = duel("disputed");
  let requests = 0;
  await page.route(`**/api/challenges/${ID}`, route => route.fulfill({ json: { challenge } }));
  await page.route(`**/api/challenges/${ID}/verdict-response`, async route => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ decision: "accepted" });
    challenge = duel("settled", { verdictResponses: [
      { userId: PLAYER, decision: "accepted", updatedAt: "2026-11-03T00:00:00Z" },
      { userId: OPPONENT, decision: "accepted", updatedAt: "2026-11-03T00:00:00Z" },
    ] });
    await route.fulfill({ json: { settled: true, status: "settled", waitingForUserIds: [], reviewCase: null } });
  });
  await page.goto(`${BASE}/challenge/${ID}/versus`);
  await expect(page.getByText("Player Decision Required", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proposed winner: @Creator" })).toBeVisible();
  await expect(page.getByText("Not settled — no reward confirmed")).toBeVisible();
  await expect(page.getByTestId("duel-verdict-review").getByRole("button", { name: "Accept result" })).toBeVisible();
  await expect(page.getByText("Winner reward")).toHaveCount(0);
  await page.getByTestId("duel-verdict-review").getByRole("button", { name: "Accept result" }).click();
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByText("Quest Settled", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Winner: @Creator" })).toBeVisible();
  await expect(page.getByText("Complete — see credit history")).toBeVisible();
  await expect(page.getByTestId("duel-verdict-review")).toHaveCount(0);
  await page.screenshot({ path: "tests/e2e-gambles/.playwright/duel-settled-mobile.png", fullPage: true });
});

test("pending settlement is not mislabelled draft or credited early", async ({ page }) => {
  await setup(page);
  await page.route(`**/api/challenges/${ID}`, route => route.fulfill({ json: { challenge: duel("pending_settlement") } }));
  await page.goto(`${BASE}/challenge/${ID}/versus`);
  await expect(page.getByText("Settlement Pending", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proposed winner: @Creator" })).toBeVisible();
  await expect(page.getByText("Not settled — no reward confirmed")).toBeVisible();
  await expect(page.getByTestId("duel-verdict-review")).toHaveCount(0);
});

test("void duel never invents a winner reward after settlement", async ({ page }) => {
  await setup(page);
  await page.route(`**/api/challenges/${ID}`, route => route.fulfill({
    json: { challenge: duel("settled", { judgments: [{ id: "j_void", winnerId: null,
      winner: null, method: "rules", aiModel: "Deadline rule", reasoning: "No evidence", confidence: null, status: "complete" }] }) },
  }));
  await page.goto(`${BASE}/challenge/${ID}/versus`);
  await expect(page.getByRole("heading", { name: "Final result: No winner (tie / void)" })).toBeVisible();
  await expect(page.getByText("Complete — see credit history")).toBeVisible();
  await expect(page.getByText("Winner reward")).toHaveCount(0);
});

test("private proof and result stay hidden even if a response contains stale sensitive rows", async ({ page }) => {
  await setup(page);
  const challenge = duel("disputed", { proofAccess: "players_only", evidence: [
    { id: "private_a", userId: PLAYER, type: "video", url: "https://example.invalid/private-video.mp4", description: "PRIVATE_VIDEO_DESCRIPTION" },
  ], judgments: [{ id: "private_j", winnerId: PLAYER, winner: { username: "PRIVATE_WINNER_NAME" },
    reasoning: "PRIVATE_REVIEW_REASON", method: "manual", confidence: null }] });
  await page.route(`**/api/challenges/${ID}`, route => route.fulfill({ json: { challenge } }));
  await page.goto(`${BASE}/challenge/${ID}/versus`);
  await expect(page.getByTestId("private-proof-access")).toBeVisible();
  for (const sensitive of ["PRIVATE_VIDEO_DESCRIPTION", "PRIVATE_WINNER_NAME", "PRIVATE_REVIEW_REASON", "private-video.mp4"]) {
    await expect(page.getByText(sensitive, { exact: false })).toHaveCount(0);
  }
  await expect(page.getByTestId("duel-verdict-review")).toHaveCount(0);
  await expect(page.locator('a[href*="private-video.mp4"]')).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`critical duel copy stays readable on the dark surface at ${width}px`, async ({ page }, info) => {
    await setup(page);
    await page.setViewportSize({ width, height: 844 });
    await page.route(`**/api/challenges/${ID}`, route => route.fulfill({ json: { challenge: duel("disputed") } }));
    await page.goto(`${BASE}/challenge/${ID}/versus`);
    await expect(page.getByRole("heading", { name: "Synthetic badminton duel", exact: true })).toBeVisible();
    await expect(page.getByTestId("duel-verdict-review")).toBeVisible();
    const contrast = await page.evaluate(() => {
      const heading = document.querySelector("h1")!;
      const surface = heading.closest(".min-h-screen")!;
      const samples = [heading, ...surface.querySelectorAll(".text-text-secondary")];
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const rgba = (color: string) => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      };
      const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
        const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      }).reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0);
      const background = rgba(getComputedStyle(surface).backgroundColor);
      return samples.map(node => {
        const color = rgba(getComputedStyle(node).color), alpha = color[3] / 255;
        const text = color.slice(0, 3).map((v, i) => v * alpha + background[i] * (1 - alpha));
        const a = luminance(text), b = luminance(background);
        return { text: node.textContent?.trim().slice(0, 80), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
    });
    expect(contrast.length).toBeGreaterThan(2);
    for (const sample of contrast) expect(sample.ratio, `Low-contrast duel copy: ${sample.text}`).toBeGreaterThanOrEqual(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await info.attach("duel-copy-contrast", { contentType: "application/json", body: Buffer.from(JSON.stringify(contrast)) });
    await page.screenshot({ path: info.outputPath(`duel-review-${width}px.png`), fullPage: true });
  });
}
