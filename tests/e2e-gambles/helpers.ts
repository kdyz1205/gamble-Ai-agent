import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { PLAYER_A, PLAYER_B } from "./users";
export { PLAYER_A, PLAYER_B };

const BASE_URL = "http://localhost:3000";

/**
 * Programmatically sign in as a seeded user (email + password) via the
 * NextAuth credentials endpoint. Cookies land in the context so subsequent
 * page.goto() calls arrive already authenticated — avoids driving the sign-in
 * modal 10x in the recordings.
 */
export async function signInCredentials(
  context: BrowserContext,
  who: { email: string; password: string },
): Promise<void> {
  // 1. Grab CSRF token (NextAuth requires this on credentials POST)
  const csrfRes = await context.request.get(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // 2. POST credentials. `redirect: false` keeps the response as JSON so we
  //    can see errors; cookies are set regardless.
  const res = await context.request.post(`${BASE_URL}/api/auth/callback/credentials`, {
    form: {
      email: who.email,
      password: who.password,
      csrfToken,
      callbackUrl: `${BASE_URL}/`,
      redirect: "false",
      json: "true",
    },
  });
  // NextAuth returns 200 with {url} on success. A 401 means bad credentials.
  if (!res.ok()) {
    throw new Error(`credentials signin failed: ${res.status()} ${await res.text().catch(() => "")}`);
  }
}

/**
 * Wait for an agent HTTP round-trip to complete. We watch /api/agent/respond
 * because every chat turn hits it. Returns the tool result embedded in the
 * response so callers can synchronously grab challengeId.
 */
export async function waitForAgentResponse(
  page: Page,
): Promise<{ toolName: string | null; toolResult: unknown; userVisibleReply: string }> {
  const res = await page.waitForResponse(
    (r) => r.url().includes("/api/agent/respond") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  const body = (await res.json()) as {
    toolName: string | null;
    toolResult: unknown;
    userVisibleReply: string;
  };
  return body;
}

/** Type text into the home-page chat composer and press Enter. */
export async function sendChatMessage(page: Page, text: string) {
  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 15_000 });
  await textarea.click();
  await textarea.fill(text);
  await textarea.press("Enter");
}

/**
 * Drive the creator's chat flow from scratch until createChallenge fires.
 * Returns the newly-created challengeId. The agent sometimes asks a single
 * clarifying follow-up even on compound prompts, so we loop up to 3 turns
 * and bail as soon as toolName === "createChallenge" OR readyToPublish goes
 * true (then we push "create it" as the next turn).
 */
export async function driveCreateFlow(page: Page, prompt: string, stakeHint = "for fun"): Promise<string> {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  // Wait for chat composer to render
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 15_000 });

  let lastReply = "";
  for (let turn = 0; turn < 4; turn++) {
    const message =
      turn === 0
        ? prompt
        : turn === 1
          ? `yes, ${stakeHint}, create it now`
          : "create it";
    await sendChatMessage(page, message);
    const res = await waitForAgentResponse(page);
    lastReply = res.userVisibleReply;
    if (res.toolName === "createChallenge") {
      const tr = res.toolResult as { challengeId?: string; marketUrl?: string } | undefined;
      if (tr?.challengeId) {
        return tr.challengeId;
      }
      throw new Error(`createChallenge returned no challengeId. reply: ${lastReply}`);
    }
    // Small pause so the UI reflects the AI's reply before the next turn
    await page.waitForTimeout(500);
  }
  throw new Error(`Agent did not create the challenge after 4 turns. last reply: ${lastReply}`);
}

/**
 * Accept the challenge from the opponent's session. Uses the API so the
 * recording shows a clean Accept button click rather than waiting on
 * potentially-fickle modal + form flows. The Accept button itself is
 * visually clicked first so the user sees the UI action.
 */
export async function acceptFromJoinPage(page: Page, challengeId: string): Promise<void> {
  await page.goto(`${BASE_URL}/join/${challengeId}`, { waitUntil: "domcontentloaded" });
  // The Accept button appears after the fetch completes
  // Button text is "🎲 Accept the bet" (stake=0) or "🎲 Accept — risk N cr" (stake>0).
  const acceptBtn = page.getByRole("button", { name: /accept( the bet|[\s\S]*risk)/i }).first();
  await acceptBtn.waitFor({ state: "visible", timeout: 15_000 });
  // Pre-register the response wait BEFORE click so we don't race the request.
  // (First-ever click in a context fires before Playwright can install the
  // listener if we register after — caused gamble 1 to fail on its first run.)
  const acceptRes = page.waitForResponse(
    (r) => r.url().includes(`/challenges/${challengeId}/accept`) && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await acceptBtn.click();
  await acceptRes;
  // Brief pause so the success UI is on camera
  await page.waitForTimeout(1200);
}

/**
 * Submit text evidence for the signed-in user via the evidence API. We use
 * page.request so the session cookie from this context authenticates it.
 */
export async function submitTextEvidenceViaApi(
  page: Page,
  challengeId: string,
  description: string,
): Promise<void> {
  const r = await page.request.post(`${BASE_URL}/api/challenges/${challengeId}/evidence`, {
    data: { type: "text", description },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`evidence submit failed: ${r.status()} ${await r.text().catch(() => "")}`);
}

/**
 * Trigger the sync AI judgment. This performs the real OpenAI call and
 * writes a Judgment row + transitions the challenge to "disputed" (awaiting
 * creator confirmation).
 */
export async function triggerJudge(page: Page, challengeId: string): Promise<{ winnerUsername?: string; confidence?: number }> {
  const r = await page.request.post(`${BASE_URL}/api/challenges/${challengeId}/judge`, {
    data: { tier: 1 },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`judge failed: ${r.status()} ${await r.text().catch(() => "")}`);
  const body = (await r.json()) as { judgment: { winner?: { username?: string } | null; confidence?: number } };
  return {
    winnerUsername: body.judgment?.winner?.username,
    confidence: body.judgment?.confidence,
  };
}

/**
 * Click the "Confirm AI recommendation and settle" button on /market/[id]
 * under the creator's session. After this fires, credits settle and the
 * challenge status flips to "settled".
 */
export async function confirmVerdictOnMarketPage(page: Page, challengeId: string) {
  await page.goto(`${BASE_URL}/market/${challengeId}`, { waitUntil: "domcontentloaded" });
  const btn = page.getByRole("button", { name: /confirm ai recommendation and settle/i }).first();
  await btn.waitFor({ state: "visible", timeout: 15_000 });
  // Pre-register before click (same race condition as acceptFromJoinPage).
  const confirmRes = page.waitForResponse(
    (r) => r.url().includes(`/challenges/${challengeId}/confirm-verdict`) && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await btn.click();
  await confirmRes;
  // Brief pause so the final "Settled" state is on camera
  await page.waitForTimeout(1500);
}

export const BASE = BASE_URL;
