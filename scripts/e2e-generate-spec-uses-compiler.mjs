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
    password: "TestPass123!genspec",
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
const providerId = process.env.E2E_GENERATE_SPEC_PROVIDER || "openai";
const model = process.env.E2E_GENERATE_SPEC_MODEL || "gpt-5-mini";
const inputText = `Generate a same-camera pushup challenge against Alex with video proof. ${stamp}`;

try {
  const user = await register(`codex.genspec.${stamp}@example.com`, `genspec_${stamp.slice(-6)}`);
  const generated = await postJson(user.jar, "/api/challenges/generate-spec", {
    inputText,
    providerId,
    model,
    language: "en",
    context: { surface: "e2e_generate_spec_compiler_proof" },
  });
  proof.generateSpec = {
    source: generated.source,
    providerId: generated.providerId,
    model: generated.model,
    title: generated.spec?.challenge_title,
    participationMode: generated.spec?.participation_mode,
    inviteMode: generated.spec?.invite_mode,
    protocolVersion: generated.protocol?.version,
    evidenceMode: generated.protocol?.evidenceProtocol?.mode,
    settlementMode: generated.protocol?.settlementProtocol?.mode,
    identityMode: generated.protocol?.identityProtocol?.mode,
    providerCall: {
      providerId: generated.providerCall?.providerId,
      model: generated.providerCall?.model,
      responseModel: generated.providerCall?.responseModel,
      usedApi: generated.providerCall?.usedApi,
      totalTokens: generated.providerCall?.totalTokens ?? null,
      durationMs: generated.providerCall?.durationMs ?? null,
    },
  };
  requireCheck(
    proof,
    "legacy_generate_spec_uses_protocol_compiler",
    generated.source === "llm" &&
      generated.providerId === providerId &&
      generated.providerCall?.usedApi === true &&
      generated.protocol?.version === "2.0" &&
      generated.spec?.challenge_title === generated.protocol?.title,
    proof.generateSpec,
  );
  requireCheck(
    proof,
    "legacy_generate_spec_vision_guardrail",
    generated.protocol?.evidenceProtocol?.mode !== "same_camera_video" ||
      (
        generated.protocol?.settlementProtocol?.mode === "auto_ai_vision" &&
        generated.protocol?.identityProtocol?.mode === "left_right_assignment" &&
        generated.spec?.participation_mode === "same_camera"
      ),
    proof.generateSpec,
  );

  proof.legacyGenerateSpecCompilerReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.legacyGenerateSpecCompilerReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
