const base = process.env.E2E_BASE_URL || "https://stubborn-ai.vercel.app";

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

  if (!res.ok && !options.allowError) {
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

function postJsonRaw(jar, path, body, options = {}) {
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
    password: "TestPass123!compile",
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
const providerId = process.env.E2E_COMPILE_PROVIDER || "openai";
const model = process.env.E2E_COMPILE_MODEL || "gpt-5-mini";
const expectedModel = process.env.E2E_COMPILE_EXPECT_MODEL || model;
const allowFreeModelDowngrade = process.env.E2E_ALLOW_FREE_MODEL_DOWNGRADE !== "0";
const inputText = process.env.E2E_COMPILE_INPUT ||
  `I bet Alex I can do 20 pushups in one minute. Proof should be video. ${stamp}`;

try {
  const user = await register(`codex.compile.${stamp}@example.com`, `compile_${stamp.slice(-6)}`);
  const invalid = await postJsonRaw(user.jar, "/api/challenges/compile", {
    inputText,
    providerId: "not_a_provider",
    model,
    language: "en",
    context: { surface: "e2e_compile_invalid_provider_quota_refund" },
  }, { allowError: true });
  const quotaAfterInvalid = await getJson(user.jar, "/api/credits");
  proof.invalidProvider = {
    status: invalid.res.status,
    body: invalid.data,
    dailyQuota: quotaAfterInvalid.dailyQuota,
  };
  requireCheck(
    proof,
    "invalid_compile_provider_does_not_consume_quota",
    invalid.res.status === 400 &&
      String(invalid.data?.error || "").includes("Unknown AI provider") &&
      quotaAfterInvalid.dailyQuota?.spec?.used === 0,
    proof.invalidProvider,
  );

  const compiled = await postJson(user.jar, "/api/challenges/compile", {
    inputText,
    providerId,
    model,
    language: "en",
    context: { surface: "e2e_compile_provider_proof" },
  });
  proof.compile = {
    source: compiled.source,
    providerId: compiled.providerId,
    model: compiled.model,
    modelAccess: compiled.modelAccess,
    externalApiCharged: compiled.externalApiCharged,
    providerCall: {
      providerId: compiled.providerCall?.providerId,
      model: compiled.providerCall?.model,
      responseModel: compiled.providerCall?.responseModel,
      usedApi: compiled.providerCall?.usedApi,
      requestKind: compiled.providerCall?.requestKind,
      totalTokens: compiled.providerCall?.totalTokens ?? null,
      durationMs: compiled.providerCall?.durationMs ?? null,
    },
    title: compiled.protocol?.title,
    evidenceMode: compiled.protocol?.evidenceProtocol?.mode,
    settlementMode: compiled.protocol?.settlementProtocol?.mode,
    identityRequired: compiled.protocol?.identityProtocol?.required,
    maxVisionFrames: compiled.protocol?.aiBudgetPolicy?.maxVisionFrames,
    dailyQuota: compiled.dailyQuota,
  };
  const selectedProviderModelCalled =
    compiled.source === "llm" &&
    compiled.providerCall?.usedApi === true &&
    compiled.providerCall?.providerId === compiled.providerId &&
    (
      (compiled.providerId === providerId && compiled.model === expectedModel) ||
      (
        allowFreeModelDowngrade &&
        compiled.modelAccess?.needsUpgrade === false &&
        compiled.modelAccess?.providerId === compiled.providerId &&
        compiled.model === compiled.modelAccess?.model
      )
    );
  requireCheck(
    proof,
    "compile_called_selected_provider_model",
    selectedProviderModelCalled,
    { ...proof.compile, requestedModel: model, expectedModel, allowFreeModelDowngrade },
  );
  requireCheck(
    proof,
    "compile_returned_protocol_v2",
    compiled.protocol?.version === "2.0" && Boolean(compiled.protocol?.settlementProtocol?.winCondition),
    proof.compile,
  );
  requireCheck(
    proof,
    "vision_protocol_settlement_guardrail",
    compiled.protocol?.evidenceProtocol?.mode !== "same_camera_video" ||
      (
        compiled.protocol?.settlementProtocol?.mode === "auto_ai_vision" &&
        compiled.protocol?.identityProtocol?.required === true &&
        compiled.protocol?.identityProtocol?.mode === "left_right_assignment" &&
        compiled.protocol?.aiBudgetPolicy?.maxVisionFrames <= 18
      ),
    proof.compile,
  );
  requireCheck(
    proof,
    "successful_compile_consumes_one_spec_quota",
    compiled.dailyQuota?.spec?.used === 1 &&
      compiled.dailyQuota?.spec?.remaining === compiled.dailyQuota.spec.limit - 1,
    compiled.dailyQuota,
  );

  const created = await postJson(user.jar, "/api/challenges", {
    protocol: compiled.protocol,
    compilerProviderId: compiled.providerId,
    compilerModel: compiled.model,
    providerCall: compiled.providerCall,
    isPublic: false,
    stake: 0,
  });
  const challengeId = created.challenge?.id;
  const detail = await getJson(user.jar, `/api/challenges/${challengeId}`);
  const storedProtocol = await getJson(user.jar, `/api/challenges/${challengeId}/protocol`);
  proof.create = {
    challengeId,
    status: created.challenge?.status,
    compilerProviderId: detail.challenge?.compilerProviderId,
    compilerModel: detail.challenge?.compilerModel,
    protocolVersion: storedProtocol.protocol?.version,
    rawPromptMatches: storedProtocol.protocol?.rawPrompt === inputText,
  };
  requireCheck(
    proof,
    "compiled_protocol_persisted_on_challenge",
    Boolean(challengeId) &&
      detail.challenge?.compilerProviderId === compiled.providerId &&
      detail.challenge?.compilerModel === compiled.model &&
      storedProtocol.protocol?.rawPrompt === inputText,
    proof.create,
  );

  proof.compileProviderProofReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.compileProviderProofReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
