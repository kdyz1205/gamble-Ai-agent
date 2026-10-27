import { expect, test, type Page } from "@playwright/test";

// Actual production components with controlled HTTP replies. These isolate
// browser races; the separate real-database journey validates server behavior.
const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const creator = "fullstack_ui_creator_20261027";
const roomA = "fullstack_ui_room_a_20261027", roomB = "fullstack_ui_room_b_20261027";
const questions = [0, 1, 2].map((i) => ({ id: `fixture-question-${i}`, prompt: `Question fixture ${i + 1}`, choices: ["First", "Second", "Third", "Fourth"] }));
const view = (id: string, status: "open" | "live" | "cancelled" | "completed" = "live") => ({
  id, title: `Regression room ${id}`, topic: "science", bankVersion: "quiz-curated-mcq-v1",
  status, challengeStatus: status === "completed" ? "settled" : status,
  stakeCredits: 0, stakesEnabled: false, creatorUsername: "fixture_creator", opponentUsername: "fixture_opponent",
  isCreator: true, playerUserId: creator, accepted: true, canJoin: false,
  expiresAt: new Date(Date.now() + 600_000).toISOString(), answerCommitment: "a".repeat(64),
  resolutionHash: status === "completed" ? "b".repeat(64) : null,
  questions: status === "open" || status === "cancelled" ? null : questions,
  ownSubmitted: status === "completed", opponentSubmitted: status === "completed",
  result: status === "completed" ? {
    version: "quiz-resolution-v1", bankVersion: "quiz-curated-mcq-v1", questionIds: questions.map((q) => q.id),
    correctAnswers: questions.map((q) => ({ id: q.id, answer: 0 })), answerCommitment: "a".repeat(64),
    scores: [{ userId: creator, score: 3, answerHash: "c".repeat(64), answers: [0, 0, 0] },
      { userId: "fixture_opponent", score: 3, answerHash: "d".repeat(64), answers: [0, 0, 0] }],
    winnerId: null, outcome: "tie", creditsTransferred: 0, escrowCredits: 0, expiresAt: null,
  } : null,
  receiptVersion: "quiz-duel-read-v1",
});
async function prepare(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    user: { id: creator, email: "fixture@example.invalid", name: "fixture_creator", username: "fixture_creator" },
    expires: "2099-01-01T00:00:00.000Z",
  } }));
  await page.route("**/api/ai/runtime", (route) => route.fulfill({ json: { capabilities: {
    text: { providerId: "fixture", transport: "fixture", configured: false },
    speech: { providerId: "fixture", transport: "fixture", configured: false },
    quiz: { enabled: true }, quizGrading: { providerId: "rules", model: "fixture", externalAiCalls: 0 },
    subscriptionSharing: { availableInThisApp: false },
  } } }));
  await page.route("**/api/quiz/history", (route) => route.fulfill({ status: 503, json: { error: "History fixture is outside this client-race test" } }));
}

test("an old Quiz polling response cannot reopen a successfully cancelled invitation", async ({ page }) => {
  await prepare(page);
  let reads = 0, cancelled = false;
  let release: () => void = () => {};
  let pending: () => void = () => {};
  const pendingRead = new Promise<void>((resolve) => { pending = resolve; });
  const releaseRead = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/quiz/${roomA}`, async (route) => {
    const snapshot = view(roomA, cancelled ? "cancelled" : "open");
    reads++;
    if (reads === 2) { pending(); await releaseRead; }
    await route.fulfill({ json: { quiz: snapshot } });
  });
  await page.route(`**/api/quiz/${roomA}/cancel`, async (route) => {
    cancelled = true;
    await route.fulfill({ json: { quiz: view(roomA, "cancelled") } });
  });
  await page.goto(`${BASE}/app/quiz?id=${roomA}`);
  await expect(page.getByTestId("quiz-cancel-invite")).toBeVisible();
  await pendingRead;
  await page.getByTestId("quiz-cancel-invite").click();
  await expect(page.getByTestId("quiz-cancelled")).toBeVisible();
  await page.evaluate(() => {
    const phase = document.querySelector('[data-testid="ios-quiz-arena"]')!;
    (window as unknown as { quizRegressionPhases: string[] }).quizRegressionPhases = [];
    new MutationObserver(() => {
      (window as unknown as { quizRegressionPhases: string[] }).quizRegressionPhases.push(phase.getAttribute("data-phase") ?? "missing");
    }).observe(phase, { attributes: true, attributeFilter: ["data-phase"] });
  });
  const oldReply = page.waitForResponse((response) => response.url().endsWith(`/api/quiz/${roomA}`));
  release();
  await oldReply;
  // Allow the deliberately stale response to reach React before reading the
  // transition log; auto-retrying an assertion could mask a brief regression.
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as unknown as { quizRegressionPhases: string[] }).quizRegressionPhases)).not.toContain("open");
  expect(await page.getByTestId("ios-quiz-arena").getAttribute("data-phase")).toBe("cancelled");
});

test("client-side rematch navigation clears answers from the previous room", async ({ page }) => {
  await prepare(page);
  let finished = false;
  await page.route(`**/api/quiz/${roomA}`, (route) => route.fulfill({ json: { quiz: view(roomA, finished ? "completed" : "live") } }));
  await page.route(`**/api/quiz/${roomA}/answer`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ answers: [0, 0, 0] });
    finished = true;
    await route.fulfill({ json: { quiz: view(roomA, "completed") } });
  });
  await page.route("**/api/quiz", (route) => route.fulfill({ status: 201, json: { challengeId: roomB, status: "open", reused: false } }));
  await page.route(`**/api/quiz/${roomB}`, (route) => route.fulfill({ json: { quiz: view(roomB) } }));
  await page.goto(`${BASE}/app/quiz?id=${roomA}`);
  await expect(page.locator(".ios-quiz-question")).toHaveCount(3);
  for (let i = 0; i < 3; i++) await page.locator(".ios-quiz-question").nth(i).getByRole("radio").first().check();
  await page.getByTestId("quiz-submit-answers").click();
  await expect(page.getByTestId("quiz-final-verdict")).toBeVisible();
  await page.getByRole("link", { name: "Start another free Quiz" }).click();
  await expect(page.getByTestId("quiz-create-form")).toBeVisible();
  await page.getByTestId("quiz-create-submit").click();
  await expect(page).toHaveURL(new RegExp(`id=${roomB}$`));
  await expect(page.locator(".ios-quiz-question")).toHaveCount(3);
  await expect(page.locator('.ios-quiz-question input:checked')).toHaveCount(0);
  await expect(page.getByTestId("quiz-submit-answers")).toBeDisabled();
});

test("a slow Quiz read is not duplicated by the polling interval", async ({ page }) => {
  await prepare(page);
  let reads = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/quiz/${roomA}`, async (route) => {
    reads++; await held;
    await route.fulfill({ json: { quiz: view(roomA) } });
  });
  await page.goto(`${BASE}/app/quiz?id=${roomA}`);
  await expect.poll(() => reads).toBe(1);
  await page.waitForTimeout(3500);
  expect(reads).toBe(1);
  release();
  await expect(page.locator(".ios-quiz-question")).toHaveCount(3);
});

test("failed Quiz configuration can be retried without signing out or reloading", async ({ page }) => {
  await prepare(page);
  let reads = 0, unavailable = true;
  await page.route("**/api/ai/runtime", async (route) => {
    reads++;
    if (unavailable) return route.fulfill({ status: 503, json: { error: "Temporary configuration outage" } });
    await route.fallback();
  });
  await page.goto(`${BASE}/app/quiz`);
  await expect(page.getByRole("alert").filter({ hasText: "Temporary configuration outage" })).toBeVisible();
  const previousReads = reads;
  unavailable = false;
  await page.getByRole("button", { name: "Retry Quiz configuration" }).click();
  await expect(page.getByTestId("quiz-create-form")).toBeVisible();
  expect(reads).toBe(previousReads + 1);
});
