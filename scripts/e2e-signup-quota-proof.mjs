import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const base = process.env.E2E_BASE_URL || "https://gamble-ai-agent.vercel.app";
const expectedSignupBonus = Number.parseInt(process.env.E2E_EXPECT_SIGNUP_BONUS || "50", 10);
const expectedSpecLimit = Number.parseInt(process.env.E2E_EXPECT_DAILY_SPEC_LIMIT || "10", 10);
const expectedJudgeLimit = Number.parseInt(process.env.E2E_EXPECT_DAILY_JUDGE_LIMIT || "3", 10);
const expectedVideoJudgeLimit = Number.parseInt(process.env.E2E_EXPECT_DAILY_VIDEO_JUDGE_LIMIT || "2", 10);

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

function getJson(jar, path) {
  return request(jar, path).then((out) => out.data);
}

async function register(email, username) {
  const jar = new Jar(username);
  const csrf = (await getJson(jar, "/api/auth/csrf")).csrfToken;
  const form = new URLSearchParams({
    email,
    password: "TestPass123!quota",
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

function redactEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!domain) return "[redacted]";
  return `${local.slice(0, 8)}...[redacted]@${domain}`;
}

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`E2E check failed: ${name}`);
}

async function currentCommitSha() {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"], { windowsHide: true });
    return stdout.trim();
  } catch {
    return process.env.E2E_COMMIT_SHA || null;
  }
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  deploymentUrl: base,
  commitSha: await currentCommitSha(),
  stamp,
  expected: {
    signupBonus: expectedSignupBonus,
    dailyQuota: {
      spec: expectedSpecLimit,
      judge: expectedJudgeLimit,
      videoJudge: expectedVideoJudgeLimit,
    },
  },
  checks: {},
};

try {
  const user = await register(`codex.quota.${stamp}@example.com`, `quota_${stamp.slice(-6)}`);
  const credits = await getJson(user.jar, "/api/credits");
  const bonusTx = Array.isArray(credits.transactions)
    ? credits.transactions.find((tx) => tx.type === "bonus" && tx.amount === expectedSignupBonus)
    : null;

  proof.user = {
    id: user.session.user.id,
    email: redactEmail(user.email),
    username: user.username,
  };
  proof.credits = {
    balance: credits.credits,
    stats: credits.stats,
    bonusTx: bonusTx
      ? {
          id: bonusTx.id,
          type: bonusTx.type,
          amount: bonusTx.amount,
          balanceAfter: bonusTx.balanceAfter,
          description: bonusTx.description,
        }
      : null,
  };
  proof.dailyQuota = credits.dailyQuota;

  requireCheck(
    proof,
    "session_established",
    Boolean(user.session?.user?.id),
    { userId: user.session?.user?.id, username: user.username },
  );
  requireCheck(
    proof,
    "welcome_bonus_balance",
    credits.credits === expectedSignupBonus,
    { expectedSignupBonus, actualCredits: credits.credits },
  );
  requireCheck(
    proof,
    "welcome_bonus_ledger_row",
    Boolean(bonusTx) && bonusTx.balanceAfter === expectedSignupBonus,
    proof.credits.bonusTx,
  );
  requireCheck(
    proof,
    "daily_quota_limits",
    credits.dailyQuota?.spec?.limit === expectedSpecLimit &&
      credits.dailyQuota?.judge?.limit === expectedJudgeLimit &&
      credits.dailyQuota?.videoJudge?.limit === expectedVideoJudgeLimit,
    credits.dailyQuota,
  );
  requireCheck(
    proof,
    "fresh_user_quota_unused",
    credits.dailyQuota?.spec?.used === 0 &&
      credits.dailyQuota?.judge?.used === 0 &&
      credits.dailyQuota?.videoJudge?.used === 0 &&
      credits.dailyQuota?.spec?.remaining === expectedSpecLimit &&
      credits.dailyQuota?.judge?.remaining === expectedJudgeLimit &&
      credits.dailyQuota?.videoJudge?.remaining === expectedVideoJudgeLimit,
    credits.dailyQuota,
  );

  proof.signupQuotaReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.signupQuotaReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
