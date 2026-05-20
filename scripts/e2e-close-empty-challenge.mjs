import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "https://gamble-ai-agent.vercel.app";

class Jar {
  constructor(name) {
    this.name = name;
    this.map = new Map();
  }

  store(res) {
    const cookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
    for (const line of cookies) {
      const first = line?.split(";")[0];
      if (!first) continue;
      const idx = first.indexOf("=");
      if (idx > 0) this.map.set(first.slice(0, idx), first.slice(idx + 1));
    }
  }

  header() {
    return [...this.map.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  playwrightCookies() {
    return [...this.map.entries()].map(([name, value]) => ({
      name,
      value,
      url: base,
    }));
  }
}

async function request(jar, path, options = {}) {
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const headers = { ...(options.headers || {}) };
  const cookie = jar?.header();
  if (cookie) headers.cookie = cookie;

  const res = await fetch(url, {
    ...options,
    headers,
    redirect: options.redirect || "manual",
  });
  jar?.store(res);

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    return request(jar, new URL(res.headers.get("location"), url).href, { method: "GET" });
  }

  if (!res.ok) {
    const err = new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data.slice(0, 400) : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { res, data, text };
}

async function requestAllowingError(jar, path, options = {}) {
  try {
    const out = await request(jar, path, options);
    return { ok: true, status: out.res.status, data: out.data };
  } catch (error) {
    return {
      ok: false,
      status: error.status ?? 0,
      data: error.data,
      message: error.message,
    };
  }
}

function postJson(jar, path, body) {
  return request(jar, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((out) => out.data);
}

function deleteJson(jar, path) {
  return request(jar, path, { method: "DELETE" }).then((out) => out.data);
}

function getJson(jar, path) {
  return request(jar, path).then((out) => out.data);
}

async function register(email, username) {
  const jar = new Jar(username);
  const csrf = (await getJson(jar, "/api/auth/csrf")).csrfToken;
  const form = new URLSearchParams({
    email,
    password: "TestPass123!close",
    username,
    action: "register",
    csrfToken: csrf,
    callbackUrl: base,
    json: "true",
  });
  await request(jar, "/api/auth/callback/credentials?json=true", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const session = await getJson(jar, "/api/auth/session");
  if (!session?.user?.id) {
    throw new Error(`No session established for ${email}`);
  }
  return { jar, session, email, username };
}

function currentCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return process.env.E2E_COMMIT_SHA || null;
  }
}

function redactEmail(email) {
  const [, domain] = email.split("@");
  return `redacted@${domain || "example.com"}`;
}

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`E2E check failed: ${name}`);
}

async function createCloseableChallenge(jar, stamp, stake, label, options = {}) {
  return postJson(jar, "/api/challenges", {
    title: `Close empty challenge ${label} ${stamp}`,
    description: "E2E challenge created only to prove empty challenge management and close behavior.",
    marketType: "challenge",
    proposition: "This empty challenge can be closed before anyone joins.",
    type: "Fitness",
    stake,
    stakeToken: "credits",
    deadline: "2 hours",
    rules: "No opponent has joined. Creator can close it and receive a stake refund.",
    evidenceType: "self_report",
    settlementMode: "manual_review",
    aiReview: false,
    isPublic: options.isPublic ?? true,
    visibility: options.visibility ?? "public",
  });
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  deploymentUrl: base,
  commitSha: currentCommitSha(),
  stamp,
  checks: {},
};

let browser = null;

try {
  const creator = await register(`codex.close.creator.${stamp}@example.com`, `close_${stamp.slice(-6)}`);
  proof.account = {
    id: "[redacted]",
    email: redactEmail(creator.email),
    username: creator.username,
  };

  const beforeCredits = await getJson(creator.jar, "/api/credits");
  const created = await createCloseableChallenge(creator.jar, stamp, 1, "ui");
  const challengeId = created.challenge.id;
  const title = created.challenge.title;
  proof.challenge = { id: challengeId, title, stake: created.challenge.stake, status: created.challenge.status };

  const afterCreateCredits = await getJson(creator.jar, "/api/credits");
  requireCheck(
    proof,
    "stake_charged_on_create",
    afterCreateCredits.credits === beforeCredits.credits - 1,
    { before: beforeCredits.credits, afterCreate: afterCreateCredits.credits },
  );

  const listedBefore = await getJson(creator.jar, "/api/challenges?mine=true&limit=50");
  requireCheck(
    proof,
    "challenge_visible_before_close",
    listedBefore.challenges?.some((challenge) => challenge.id === challengeId),
    { listedCount: listedBefore.challenges?.length ?? 0 },
  );

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(creator.jar.playwrightCookies());
  const page = await context.newPage();
  page.on("dialog", async (dialog) => {
    proof.confirmDialog = dialog.message();
    await dialog.accept();
  });

  await page.goto(`${base}/challenge/${challengeId}`, { waitUntil: "networkidle" });
  await page.getByText("Manage challenge", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Close empty challenge" }).waitFor({ state: "visible", timeout: 20_000 });
  requireCheck(
    proof,
    "detail_manage_panel_close_visible",
    true,
    { challengeId },
  );

  await page.goto(`${base}/markets`, { waitUntil: "networkidle" });
  await page.getByText(title, { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
  const card = page.locator("article").filter({ hasText: title }).first();
  await card.getByRole("button", { name: /^Close$/ }).click();
  await page.getByText("Closed. 1 credits refunded.", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  await card.waitFor({ state: "detached", timeout: 20_000 }).catch(async () => {
    await page.waitForTimeout(500);
    const stillVisible = await card.isVisible().catch(() => false);
    if (stillVisible) throw new Error("Closed challenge card is still visible in /markets");
  });

  const detailAfterClose = await requestAllowingError(creator.jar, `/api/challenges/${challengeId}`);
  const afterCloseList = await getJson(creator.jar, "/api/challenges?mine=true&limit=50");
  const afterCloseCredits = await getJson(creator.jar, "/api/credits");
  const closeTx = Array.isArray(afterCloseCredits.transactions)
    ? afterCloseCredits.transactions.find((tx) => tx.type === "refund" && tx.amount === 1 && String(tx.description || "").includes("closed empty market"))
    : null;

  requireCheck(
    proof,
    "detail_404_after_close",
    detailAfterClose.status === 404,
    { status: detailAfterClose.status, response: detailAfterClose.data },
  );
  requireCheck(
    proof,
    "challenge_removed_from_my_list",
    !afterCloseList.challenges?.some((challenge) => challenge.id === challengeId),
    { listedCount: afterCloseList.challenges?.length ?? 0 },
  );
  requireCheck(
    proof,
    "stake_refunded_after_close",
    afterCloseCredits.credits === beforeCredits.credits,
    { before: beforeCredits.credits, afterCreate: afterCreateCredits.credits, afterClose: afterCloseCredits.credits },
  );
  requireCheck(
    proof,
    "refund_ledger_row_visible",
    Boolean(closeTx),
    closeTx
      ? {
          id: closeTx.id,
          type: closeTx.type,
          amount: closeTx.amount,
          balanceAfter: closeTx.balanceAfter,
          challengeId: closeTx.challengeId,
          description: closeTx.description,
        }
      : null,
  );

  const apiCreated = await createCloseableChallenge(creator.jar, stamp, 0, "api");
  const apiClose = await deleteJson(creator.jar, `/api/challenges/${apiCreated.challenge.id}`);
  const apiDetailAfterClose = await requestAllowingError(creator.jar, `/api/challenges/${apiCreated.challenge.id}`);
  requireCheck(
    proof,
    "api_delete_returns_success",
    apiClose.ok === true && apiClose.deletedId === apiCreated.challenge.id,
    apiClose,
  );
  requireCheck(
    proof,
    "api_deleted_challenge_is_gone",
    apiDetailAfterClose.status === 404,
    { status: apiDetailAfterClose.status },
  );

  const opponent = await register(`codex.close.opponent.${stamp}@example.com`, `close_opp_${stamp.slice(-6)}`);
  const joinedBeforeCreator = await getJson(creator.jar, "/api/credits");
  const joinedBeforeOpponent = await getJson(opponent.jar, "/api/credits");
  const joinedCreated = await createCloseableChallenge(creator.jar, stamp, 1, "joined", {
    isPublic: false,
    visibility: "invite_only",
  });
  await postJson(opponent.jar, `/api/challenges/${joinedCreated.challenge.id}/accept`, {
    acceptedRuleContract: true,
  });
  const joinedDelete = await requestAllowingError(creator.jar, `/api/challenges/${joinedCreated.challenge.id}`, {
    method: "DELETE",
  });
  const joinedDetail = await getJson(creator.jar, `/api/challenges/${joinedCreated.challenge.id}`);
  requireCheck(
    proof,
    "joined_challenge_delete_blocked",
    joinedDelete.status === 409 && String(joinedDelete.data?.error || "").includes("participant"),
    { status: joinedDelete.status, response: joinedDelete.data },
  );
  requireCheck(
    proof,
    "joined_challenge_still_exists",
    joinedDetail.challenge?.id === joinedCreated.challenge.id && joinedDetail.challenge.participants?.length >= 2,
    {
      id: joinedDetail.challenge?.id,
      status: joinedDetail.challenge?.status,
      participants: joinedDetail.challenge?.participants?.length ?? 0,
    },
  );
  const joinedAfterAcceptCreator = await getJson(creator.jar, "/api/credits");
  const joinedAfterAcceptOpponent = await getJson(opponent.jar, "/api/credits");
  requireCheck(
    proof,
    "joined_stakes_locked_before_cancel",
    joinedAfterAcceptCreator.credits === joinedBeforeCreator.credits - 1 &&
      joinedAfterAcceptOpponent.credits === joinedBeforeOpponent.credits - 1,
    {
      creatorBefore: joinedBeforeCreator.credits,
      creatorAfterAccept: joinedAfterAcceptCreator.credits,
      opponentBefore: joinedBeforeOpponent.credits,
      opponentAfterAccept: joinedAfterAcceptOpponent.credits,
    },
  );
  await page.goto(`${base}/challenge/${joinedCreated.challenge.id}`, { waitUntil: "networkidle" });
  await page.getByText("Manage challenge", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Cancel and refund" }).waitFor({ state: "visible", timeout: 20_000 });
  requireCheck(
    proof,
    "detail_manage_panel_joined_cancel_visible",
    true,
    { challengeId: joinedCreated.challenge.id },
  );
  await page.getByRole("button", { name: "Cancel and refund" }).click();
  await page.getByText("Refunded", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
  const joinedAfterCancel = await getJson(creator.jar, `/api/challenges/${joinedCreated.challenge.id}`);
  const joinedAfterCancelCreator = await getJson(creator.jar, "/api/credits");
  const joinedAfterCancelOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorRefundTx = Array.isArray(joinedAfterCancelCreator.transactions)
    ? joinedAfterCancelCreator.transactions.find((tx) => tx.challengeId === joinedCreated.challenge.id && tx.type === "refund" && tx.amount === 1)
    : null;
  const opponentRefundTx = Array.isArray(joinedAfterCancelOpponent.transactions)
    ? joinedAfterCancelOpponent.transactions.find((tx) => tx.challengeId === joinedCreated.challenge.id && tx.type === "refund" && tx.amount === 1)
    : null;
  requireCheck(
    proof,
    "joined_cancel_refunded_status",
    joinedAfterCancel.challenge?.status === "refunded",
    { status: joinedAfterCancel.challenge?.status },
  );
  requireCheck(
    proof,
    "joined_cancel_refunded_balances",
    joinedAfterCancelCreator.credits === joinedBeforeCreator.credits &&
      joinedAfterCancelOpponent.credits === joinedBeforeOpponent.credits,
    {
      creatorBefore: joinedBeforeCreator.credits,
      creatorAfterCancel: joinedAfterCancelCreator.credits,
      opponentBefore: joinedBeforeOpponent.credits,
      opponentAfterCancel: joinedAfterCancelOpponent.credits,
    },
  );
  requireCheck(
    proof,
    "joined_cancel_refund_ledger_rows",
    Boolean(creatorRefundTx && opponentRefundTx),
    {
      creatorRefundTx: creatorRefundTx ? { id: creatorRefundTx.id, amount: creatorRefundTx.amount, balanceAfter: creatorRefundTx.balanceAfter } : null,
      opponentRefundTx: opponentRefundTx ? { id: opponentRefundTx.id, amount: opponentRefundTx.amount, balanceAfter: opponentRefundTx.balanceAfter } : null,
    },
  );

  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  console.error(JSON.stringify(proof, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
