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

  const res = await fetch(url, { ...options, headers, redirect: options.redirect || "manual" });
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
    const err = new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { res, data, text };
}

async function requestAllowError(jar, path, options = {}) {
  try {
    const out = await request(jar, path, options);
    return { ok: true, status: out.res.status, data: out.data };
  } catch (error) {
    return { ok: false, status: error.status ?? 0, data: error.data, message: error.message };
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
    password: "TestPass123!archive",
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
  if (!session?.user?.id) throw new Error(`No session established for ${email}`);
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

async function createPublicChallenge(jar, stamp) {
  return postJson(jar, "/api/challenges", {
    title: `Archive manager challenge ${stamp}`,
    description: "E2E challenge created only to prove archive and restore behavior.",
    marketType: "challenge",
    proposition: "This challenge can be archived without deleting audit history.",
    type: "General",
    stake: 0,
    stakeToken: "credits",
    deadline: "2 hours",
    rules: "Creator can archive this row to remove clutter while preserving the challenge record.",
    evidenceType: "self_report",
    settlementMode: "manual_review",
    aiReview: false,
    isPublic: true,
    visibility: "public",
    discoveryLat: 34.05,
    discoveryLng: -118.24,
  });
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  deploymentUrl: base,
  commitSha: currentCommitSha(),
  stamp,
  checks: {},
  cleanup: null,
};

let creator = null;
let challengeId = null;
let browser = null;

try {
  creator = await register(`codex.archive.${stamp}@example.com`, `archive_${stamp.slice(-6)}`);
  proof.account = {
    id: "[redacted]",
    email: redactEmail(creator.email),
    username: creator.username,
  };

  const created = await createPublicChallenge(creator.jar, stamp);
  challengeId = created.challenge.id;
  proof.challenge = {
    id: challengeId,
    title: created.challenge.title,
    initialStatus: created.challenge.status,
    initialVisibility: created.challenge.visibility,
    initialIsPublic: created.challenge.isPublic,
  };

  const listedBefore = await getJson(creator.jar, "/api/challenges?mine=true&limit=50");
  const discoveredBefore = await getJson(null, "/api/challenges/discover?lat=34.05&lng=-118.24&limit=50");
  requireCheck(proof, "visible_in_default_board_before_archive", listedBefore.challenges?.some((c) => c.id === challengeId), { count: listedBefore.challenges?.length ?? 0 });
  requireCheck(proof, "visible_in_public_discovery_before_archive", discoveredBefore.challenges?.some((c) => c.id === challengeId), { count: discoveredBefore.challenges?.length ?? 0 });

  const archived = await postJson(creator.jar, `/api/challenges/${challengeId}/archive`, { archived: true });
  proof.archive = {
    visibility: archived.challenge.visibility,
    isPublic: archived.challenge.isPublic,
    status: archived.challenge.status,
  };
  requireCheck(proof, "archive_preserves_status", archived.challenge.status === created.challenge.status, proof.archive);
  requireCheck(proof, "archive_sets_visibility_archived", archived.challenge.visibility === "archived" && archived.challenge.isPublic === false, proof.archive);

  const defaultAfterArchive = await getJson(creator.jar, "/api/challenges?mine=true&limit=50");
  const archivedList = await getJson(creator.jar, "/api/challenges?mine=true&includeArchived=true&limit=50");
  const discoveredAfterArchive = await getJson(null, "/api/challenges/discover?lat=34.05&lng=-118.24&limit=50");
  requireCheck(proof, "archived_hidden_from_default_board", !defaultAfterArchive.challenges?.some((c) => c.id === challengeId), { count: defaultAfterArchive.challenges?.length ?? 0 });
  requireCheck(proof, "archived_visible_when_requested", archivedList.challenges?.some((c) => c.id === challengeId && c.visibility === "archived"), { count: archivedList.challenges?.length ?? 0 });
  requireCheck(proof, "archived_hidden_from_public_discovery", !discoveredAfterArchive.challenges?.some((c) => c.id === challengeId), { count: discoveredAfterArchive.challenges?.length ?? 0 });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(creator.jar.playwrightCookies());
  const page = await context.newPage();
  page.on("dialog", async (dialog) => {
    proof.restoreConfirmDialog = dialog.message();
    await dialog.accept();
  });
  await page.goto(`${base}/markets`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Show archived" }).click();
  await page.getByText(created.challenge.title, { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
  const archivedCard = page.locator("article").filter({ hasText: created.challenge.title }).first();
  await archivedCard.getByRole("button", { name: "Restore" }).click();
  await page.getByText("Restored to your private challenge board.", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  requireCheck(proof, "ui_can_show_archived_and_restore", true, { title: created.challenge.title });
  await browser.close();
  browser = null;

  const restored = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.restore = {
    visibility: restored.challenge.visibility,
    isPublic: restored.challenge.isPublic,
    status: restored.challenge.status,
  };
  requireCheck(proof, "restore_is_private_not_public", restored.challenge.visibility === "private" && restored.challenge.isPublic === false, proof.restore);

  const defaultAfterRestore = await getJson(creator.jar, "/api/challenges?mine=true&limit=50");
  const discoveredAfterRestore = await getJson(null, "/api/challenges/discover?lat=34.05&lng=-118.24&limit=50");
  requireCheck(proof, "restored_visible_in_default_board", defaultAfterRestore.challenges?.some((c) => c.id === challengeId), { count: defaultAfterRestore.challenges?.length ?? 0 });
  requireCheck(proof, "restored_stays_out_of_public_discovery", !discoveredAfterRestore.challenges?.some((c) => c.id === challengeId), { count: discoveredAfterRestore.challenges?.length ?? 0 });

  proof.cleanup = await deleteJson(creator.jar, `/api/challenges/${challengeId}`);
  requireCheck(proof, "cleanup_deleted_empty_row", proof.cleanup?.ok === true && proof.cleanup?.deletedId === challengeId, proof.cleanup);
  proof.archiveFlowReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  if (browser) await browser.close().catch(() => null);
  proof.error = { message: error?.message, status: error?.status, data: error?.data };
  if (creator && challengeId) {
    proof.cleanup = await requestAllowError(creator.jar, `/api/challenges/${challengeId}`, { method: "DELETE" });
  }
  proof.archiveFlowReady = false;
  console.error(JSON.stringify(proof, null, 2));
  process.exit(1);
}
