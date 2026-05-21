import { execFileSync } from "node:child_process";

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
    password: "TestPass123!discover",
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

async function createDiscoveryChallenge(jar, stamp, label, deadline) {
  return postJson(jar, "/api/challenges", {
    title: `Discovery filter ${label} ${stamp}`,
    description: "E2E challenge created only to prove public discovery filtering.",
    marketType: "challenge",
    proposition: "This row tests whether Join Nearby shows only currently playable challenges.",
    type: "General",
    stake: 0,
    stakeToken: "credits",
    deadline,
    rules: "Discovery should hide no-deadline and expired rows from public nearby join lists.",
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
  cleanup: [],
};

const createdIds = [];
let creatorAccount = null;
let cleanupDone = false;

try {
  const creator = await register(`codex.discovery.${stamp}@example.com`, `discover_${stamp.slice(-6)}`);
  creatorAccount = creator;
  proof.account = {
    id: "[redacted]",
    email: redactEmail(creator.email),
    username: creator.username,
  };

  const noDeadline = await createDiscoveryChallenge(creator.jar, stamp, "no-deadline", undefined);
  const expired = await createDiscoveryChallenge(creator.jar, stamp, "expired", "0 minutes");
  const active = await createDiscoveryChallenge(creator.jar, stamp, "active", "2 hours");
  for (const row of [noDeadline, expired, active]) createdIds.push(row.challenge.id);

  proof.created = {
    noDeadline: { id: noDeadline.challenge.id, deadline: noDeadline.challenge.deadline },
    expired: { id: expired.challenge.id, deadline: expired.challenge.deadline },
    active: { id: active.challenge.id, deadline: active.challenge.deadline },
  };

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const discovered = await getJson(null, "/api/challenges/discover?lat=34.05&lng=-118.24&limit=50");
  const ids = new Set((discovered.challenges || []).map((challenge) => challenge.id));
  proof.discovery = {
    discoveryLevel: discovered.discoveryLevel,
    levelMessage: discovered.levelMessage,
    returnedCount: discovered.challenges?.length ?? 0,
    createdIdsReturned: createdIds.filter((id) => ids.has(id)),
  };

  requireCheck(
    proof,
    "active_public_future_deadline_is_discoverable",
    ids.has(active.challenge.id),
    { activeId: active.challenge.id },
  );
  requireCheck(
    proof,
    "no_deadline_public_challenge_is_hidden",
    !ids.has(noDeadline.challenge.id),
    { noDeadlineId: noDeadline.challenge.id },
  );
  requireCheck(
    proof,
    "expired_public_challenge_is_hidden",
    !ids.has(expired.challenge.id),
    { expiredId: expired.challenge.id },
  );

  for (const id of createdIds) {
    try {
      await deleteJson(creator.jar, `/api/challenges/${id}`);
      proof.cleanup.push({ id, deleted: true });
    } catch (error) {
      proof.cleanup.push({ id, deleted: false, error: error.message });
    }
  }
  cleanupDone = true;

  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = error.message;
  if (creatorAccount && !cleanupDone) {
    for (const id of createdIds) {
      try {
        await deleteJson(creatorAccount.jar, `/api/challenges/${id}`);
        proof.cleanup.push({ id, deleted: true });
      } catch (cleanupError) {
        proof.cleanup.push({ id, deleted: false, error: cleanupError.message });
      }
    }
  }
  console.error(JSON.stringify(proof, null, 2));
  throw error;
}
