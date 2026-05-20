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
    const err = new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data)}`);
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
    password: "TestPass123!parse",
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
  return { jar, session, email };
}

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`E2E check failed: ${name}`);
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = { base, stamp, checks: {} };
const providerId = process.env.E2E_PARSE_PROVIDER || "openai";
const model = process.env.E2E_PARSE_MODEL || "gpt-4o-mini";
const input = `I want a safe nearby challenge where Alex and I race to finish 20 pushups. ${stamp}`;

try {
  const user = await register(`codex.parse.${stamp}@example.com`, `parse_${stamp.slice(-6)}`);
  const parsed = await postJson(user.jar, "/api/challenges/parse", {
    input,
    providerId,
    model,
    language: "en",
    tier: 1,
  });

  proof.parse = {
    source: parsed.source,
    providerId: parsed.providerId,
    model: parsed.model,
    title: parsed.parsed?.title,
    protocolTitle: parsed.protocol?.title,
    protocolVersion: parsed.protocol?.version,
    evidenceMode: parsed.protocol?.evidenceProtocol?.mode,
    providerCall: {
      providerId: parsed.providerCall?.providerId,
      model: parsed.providerCall?.model,
      responseModel: parsed.providerCall?.responseModel,
      usedApi: parsed.providerCall?.usedApi,
      totalTokens: parsed.providerCall?.totalTokens ?? null,
      durationMs: parsed.providerCall?.durationMs ?? null,
    },
    dailyQuota: parsed.dailyQuota?.spec ?? null,
  };

  requireCheck(
    proof,
    "legacy_parse_uses_protocol_compiler",
    parsed.source === "llm" &&
      parsed.providerId === providerId &&
      parsed.providerCall?.usedApi === true &&
      parsed.providerCall?.providerId === providerId &&
      parsed.protocol?.version === "2.0",
    proof.parse,
  );
  requireCheck(
    proof,
    "legacy_parse_returns_legacy_shape_from_same_protocol",
    Boolean(parsed.parsed?.title) &&
      parsed.parsed.title === parsed.protocol.title &&
      parsed.parsed.evidenceType === parsed.protocol.evidenceProtocol.mode &&
      typeof parsed.parsed.rules === "string" &&
      parsed.parsed.rules.includes("Win condition:"),
    proof.parse,
  );

  proof.legacyParseCompilerReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.legacyParseCompilerReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
