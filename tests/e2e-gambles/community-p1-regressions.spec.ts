import { expect, test } from "@playwright/test";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

test("community explains recorded events without exposing internal labels or inventing victory", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/feed?*", route => route.fulfill({ json: { total: 2, events: [
    { id: "fixture_recommendation", type: "challenge_verdict_recommended", createdAt: "2026-10-27T10:00:00.000Z", user: null,
      message: "Provider leaked-model-id raw_internal_code", challenge: { id: "read_only_visual", title: "A friendly badminton challenge", type: "General", status: "disputed", stake: 0 } },
    { id: "fixture_member", type: "user_joined", createdAt: "2026-10-27T11:00:00.000Z", user: { id: "member", username: "qa_real_member", image: null },
      message: "qa_real_member joined ChallengeAI", challenge: null },
  ] } }));
  await page.goto(BASE + "/app/community");
  await expect(page.locator(".ios-feed-card")).toHaveCount(2);
  await expect(page.locator(".ios-feed-card").first()).toContainText("Referee recommendation");
  await expect(page.locator(".ios-feed-card").first()).toContainText("current review and result status");
  await expect(page.locator(".ios-feed")).not.toContainText("leaked-model-id");
  await expect(page.locator(".ios-feed")).not.toContainText("challenge_verdict_recommended");
  await expect(page.locator(".ios-feed")).not.toContainText("ChallengeAI");
  await expect(page.locator(".ios-feed")).not.toContainText("wins");
  await expect(page.locator(".ios-feed-card").nth(1)).toContainText("qa_real_member joined Summoners World.");
  await expect(page.getByRole("link", { name: /A friendly badminton challenge/ })).toHaveAttribute("href", "/app/quest?id=read_only_visual&returnTo=%2Fapp%2Fcommunity");
});

test("an empty community after test isolation remains an honest empty state", async ({ page }) => {
  await page.route("**/api/feed?*", route => route.fulfill({ json: { events: [], total: 0 } }));
  await page.goto(BASE + "/app/community");
  await expect(page.getByRole("heading", { name: "Your community starts small." })).toBeVisible();
  await expect(page.locator(".ios-feed-card")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explore Quests" })).toHaveAttribute("href", "/app/discover");
});
