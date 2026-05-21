import { execFileSync } from "node:child_process";

const base = process.env.E2E_BASE_URL || "http://localhost:3000";

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

function getJson(jar, path) {
  return request(jar, path).then((out) => out.data);
}

async function register(email, username) {
  const jar = new Jar(username);
  const csrf = (await getJson(jar, "/api/auth/csrf")).csrfToken;
  const form = new URLSearchParams({
    email,
    password: "TestPass123!referral",
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

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  deploymentUrl: base,
  commitSha: currentCommitSha(),
  stamp,
  checks: {},
};

try {
  const inviter = await register(`codex.ref.inviter.${stamp}@example.com`, `ref_inv_${stamp.slice(-6)}`);
  const invitee = await register(`codex.ref.invitee.${stamp}@example.com`, `ref_new_${stamp.slice(-6)}`);

  const inviterBefore = await getJson(inviter.jar, "/api/credits");
  const inviteeBefore = await getJson(invitee.jar, "/api/credits");
  const claimed = await postJson(invitee.jar, "/api/referrals/claim", {
    ref: inviter.username,
    source: "invite",
    campaign: "beta_launch",
    landingUrl: `${base}/?ref=${inviter.username}&utm_source=invite&utm_campaign=beta_launch`,
  });
  const duplicate = await postJson(invitee.jar, "/api/referrals/claim", {
    ref: inviter.username,
    source: "invite",
    campaign: "beta_launch",
  });
  const selfClaim = await postJson(inviter.jar, "/api/referrals/claim", {
    ref: inviter.username,
  });
  const inviterAfter = await getJson(inviter.jar, "/api/credits");
  const inviteeAfter = await getJson(invitee.jar, "/api/credits");

  const inviterBonus = inviterAfter.transactions.find((tx) => tx.type === "bonus" && String(tx.description || "").includes(`Referral referrer bonus: ${invitee.username}`));
  const inviteeBonus = inviteeAfter.transactions.find((tx) => tx.type === "bonus" && String(tx.description || "").includes(`Referral invitee bonus: invited by ${inviter.username}`));

  proof.accounts = {
    inviter: { id: "[redacted]", email: redactEmail(inviter.email), username: inviter.username },
    invitee: { id: "[redacted]", email: redactEmail(invitee.email), username: invitee.username },
  };
  proof.claim = claimed;
  proof.duplicate = duplicate;
  proof.selfClaim = selfClaim;
  proof.balances = {
    inviterBefore: inviterBefore.credits,
    inviterAfter: inviterAfter.credits,
    inviteeBefore: inviteeBefore.credits,
    inviteeAfter: inviteeAfter.credits,
  };
  proof.ledger = {
    inviterBonus: inviterBonus ? { amount: inviterBonus.amount, balanceAfter: inviterBonus.balanceAfter, description: inviterBonus.description } : null,
    inviteeBonus: inviteeBonus ? { amount: inviteeBonus.amount, balanceAfter: inviteeBonus.balanceAfter, description: inviteeBonus.description } : null,
  };

  requireCheck(
    proof,
    "referral_claim_succeeds",
    claimed.claimed === true && claimed.bonus === 10 && claimed.referrer?.username === inviter.username,
    claimed,
  );
  requireCheck(
    proof,
    "both_balances_increase_by_10",
    inviterAfter.credits === inviterBefore.credits + 10 && inviteeAfter.credits === inviteeBefore.credits + 10,
    proof.balances,
  );
  requireCheck(
    proof,
    "bonus_ledger_rows_exist",
    inviterBonus?.amount === 10 && inviteeBonus?.amount === 10,
    proof.ledger,
  );
  requireCheck(
    proof,
    "duplicate_claim_blocked",
    duplicate.claimed === false && duplicate.reason === "already_claimed",
    duplicate,
  );
  requireCheck(
    proof,
    "self_referral_blocked",
    selfClaim.claimed === false && selfClaim.reason === "self_referral_blocked",
    selfClaim,
  );

  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = error.message;
  console.error(JSON.stringify(proof, null, 2));
  throw error;
}
