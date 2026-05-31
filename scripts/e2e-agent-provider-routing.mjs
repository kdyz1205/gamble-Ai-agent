import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const base = process.env.E2E_BASE_URL || "https://stubborn-ai.vercel.app";
const providerId = process.env.E2E_AGENT_PROVIDER || "openai";
const model = process.env.E2E_AGENT_MODEL || "gpt-5-mini";

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
  if (!res.ok && !options.allowError) {
    const err = new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { res, data, text };
}

function postJson(jar, path, body, options = {}) {
  return request(jar, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...options,
  });
}

function getJson(jar, path) {
  return request(jar, path).then((out) => out.data);
}

async function register(email, username) {
  const jar = new Jar(username);
  const csrf = (await getJson(jar, "/api/auth/csrf")).csrfToken;
  const form = new URLSearchParams({
    email,
    password: "TestPass123!agent",
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
  providerId,
  model,
  checks: {},
};

try {
  const user = await register(`codex.agent.provider.${stamp}@example.com`, `agent_provider_${stamp.slice(-6)}`);
  proof.user = { id: user.session.user.id, username: user.username };

  const invalid = await postJson(user.jar, "/api/agent/respond", {
    message: "Do not call tools. Ask one short follow-up question about my safe challenge idea.",
    conversationHistory: [],
    draftState: {},
    providerId: "not_a_provider",
    model,
  }, { allowError: true });
  requireCheck(
    proof,
    "unknown_provider_rejected",
    invalid.res.status === 400 && String(invalid.data?.error || "").includes("Unknown provider"),
    { status: invalid.res.status, body: invalid.data },
  );

  const out = (await postJson(user.jar, "/api/agent/respond", {
    message: "Do not call any backend tool. Ask one short follow-up question about a safe challenge idea.",
    conversationHistory: [],
    draftState: {},
    providerId,
    model,
  })).data;

  proof.agent = {
    action: out.agentAction,
    toolName: out.toolName,
    toolError: out.toolError ?? null,
    replyPreview: typeof out.userVisibleReply === "string" ? out.userVisibleReply.slice(0, 160) : null,
    llmCall: out.llmCall,
    groundedLlmCall: out.groundedLlmCall ?? null,
    dailyQuota: out.dailyQuota,
  };

  requireCheck(
    proof,
    "selected_provider_model_called",
    out.llmCall?.providerId === providerId &&
      out.llmCall?.model === model &&
      out.llmCall?.usedApi === true,
    out.llmCall,
  );
  requireCheck(
    proof,
    "selected_model_call_has_usage_metadata",
    Number.isFinite(out.llmCall?.durationMs) &&
      out.llmCall.durationMs > 0 &&
      (out.llmCall.totalTokens === null || Number.isFinite(out.llmCall.totalTokens)),
    out.llmCall,
  );
  requireCheck(
    proof,
    "agent_response_not_fake_template",
    typeof out.userVisibleReply === "string" &&
      out.userVisibleReply.trim().length > 0 &&
      !String(out.userVisibleReply).includes("template"),
    proof.agent,
  );

  const credits = await getJson(user.jar, "/api/credits");
  proof.persistedDailyQuota = credits.dailyQuota;
  requireCheck(
    proof,
    "agent_turn_consumed_spec_quota",
    out.dailyQuota?.spec?.used === 1 &&
      out.dailyQuota?.spec?.remaining === out.dailyQuota.spec.limit - 1 &&
      credits.dailyQuota?.spec?.used === 1,
    { responseQuota: out.dailyQuota, persistedQuota: credits.dailyQuota },
  );

  proof.agentProviderRoutingReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.agentProviderRoutingReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
