const base = process.env.E2E_BASE_URL || "https://stubborn-ai.vercel.app";
const providerId = process.env.E2E_AGENT_PROVIDER || "openai";
const model = process.env.E2E_AGENT_MODEL || "gpt-5-mini";

class Jar {
  constructor() {
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
  const jar = new Jar();
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

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  providerId,
  model,
  stamp,
  checks: {},
};

try {
  const user = await register(`codex.agent.compile.${stamp}@example.com`, `agent_compile_${stamp.slice(-6)}`);
  proof.user = { id: user.session.user.id, username: user.username };

  const out = (await postJson(user.jar, "/api/agent/respond", {
    message: "Generate a safe random challenge for me. Make it a push-up challenge with video evidence.",
    conversationHistory: [],
    draftState: {},
    providerId,
    model,
  })).data;

  proof.response = {
    action: out.agentAction,
    toolName: out.toolName,
    replyPreview: typeof out.userVisibleReply === "string" ? out.userVisibleReply.slice(0, 180) : null,
    llmCall: out.llmCall,
    dailyQuota: out.dailyQuota,
    protocolTitle: out.draftState?.protocol?.title ?? null,
    protocolMode: out.draftState?.protocol?.evidenceProtocol?.mode ?? null,
    settlementMode: out.draftState?.protocol?.settlementProtocol?.mode ?? null,
  };

  requireCheck(
    proof,
    "direct_compile_returns_show_draft",
    out.agentAction === "show_draft" && out.toolName === null,
    proof.response,
  );
  requireCheck(
    proof,
    "selected_provider_model_called_by_compiler",
    out.llmCall?.providerId === providerId &&
      out.llmCall?.model === model &&
      out.llmCall?.usedApi === true,
    out.llmCall,
  );
  requireCheck(
    proof,
    "protocol_v2_in_hidden_state",
    Boolean(out.draftState?.protocol?.version === "2.0" &&
      out.draftState?.protocol?.evidenceProtocol?.mode &&
      out.draftState?.protocol?.settlementProtocol?.mode),
    out.draftState?.protocol,
  );
  requireCheck(
    proof,
    "protocol_not_literal_prompt",
    typeof out.draftState?.protocol?.title === "string" &&
      !out.draftState.protocol.title.toLowerCase().includes("generate a safe random challenge"),
    out.draftState?.protocol?.title,
  );
  requireCheck(
    proof,
    "single_spec_quota_spent",
    out.dailyQuota?.spec?.used === 1,
    out.dailyQuota,
  );

  proof.agentDirectCompileReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.agentDirectCompileReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
