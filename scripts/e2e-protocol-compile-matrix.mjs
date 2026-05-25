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
    password: "TestPass123!matrix",
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

function bindingRoles(protocol) {
  return (protocol?.identityProtocol?.participantBindings || []).map((binding) => binding.role);
}

function hasOpponentBinding(protocol) {
  return bindingRoles(protocol).includes("opponent");
}

function isVisionMode(mode) {
  return ["same_camera_video", "separate_video", "live_host_video", "photo"].includes(mode);
}

function languageOf(input) {
  return /[\u3400-\u9FFF]/.test(input) ? "zh" : "en";
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  stamp,
  commitSha: process.env.E2E_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
  providerId: process.env.E2E_COMPILE_PROVIDER || "openai",
  model: process.env.E2E_COMPILE_MODEL || "gpt-4o-mini",
  cases: [],
  checks: {},
};

const allCases = [
  {
    key: "solo_pet_video",
    input: "I bet my cat can finish the food under one minute. I will upload a video.",
    expect: (compiled) => {
      const protocol = compiled.protocol;
      return protocol.participantMode === "solo" &&
        !hasOpponentBinding(protocol) &&
        isVisionMode(protocol.evidenceProtocol.mode) &&
        protocol.identityProtocol.required === true &&
        protocol.settlementProtocol.mode === "auto_ai_vision";
    },
  },
  {
    key: "counterparty_pet_claim",
    input: "I bet Jerry that my cat can finish the food under one minute. I will upload a video.",
    expect: (compiled) => {
      const protocol = compiled.protocol;
      return protocol.participantMode === "head_to_head" &&
        hasOpponentBinding(protocol) &&
        isVisionMode(protocol.evidenceProtocol.mode);
    },
  },
  {
    key: "same_camera_pet_vs_pet",
    input: "My cat versus Jerry's cat: which cat finishes food first in the same room using one phone video.",
    expect: (compiled) => {
      const protocol = compiled.protocol;
      return protocol.participantMode === "head_to_head" &&
        protocol.evidenceProtocol.mode === "same_camera_video" &&
        protocol.identityProtocol.required === true &&
        protocol.identityProtocol.mode === "left_right_assignment";
    },
  },
  {
    key: "random_zh_challenge",
    input: "给我随便生成一个安全的挑战",
    expect: (compiled) => {
      const protocol = compiled.protocol;
      return protocol.version === "2.0" &&
        protocol.language === "zh" &&
        protocol.riskPolicy.allowed === true &&
        !/随便|随机|生成|安全的挑战/.test(protocol.title);
    },
  },
  {
    key: "mass_crowd_5000",
    input: "I want 5,000 people to compete in a plank leaderboard event.",
    expect: (compiled) => {
      const protocol = compiled.protocol;
      return protocol.participantMode === "mass_crowd" &&
        protocol.settlementProtocol.mode === "leaderboard";
    },
  },
  {
    key: "nearby_photo_checkin",
    input: "I am walking near campus and want nearby people to join a safe photo check-in challenge.",
    expect: (compiled) => {
      const protocol = compiled.protocol;
      return ["nearby_discovery", "walk_to_join"].includes(protocol.locationProtocol.mode) &&
        protocol.locationProtocol.locationPrivacy === "approximate" &&
        ["small_group", "head_to_head"].includes(protocol.participantMode);
    },
  },
  {
    key: "btc_price_oracle",
    input: "I bet Bitcoin BTC will reach 120000 USD by tomorrow.",
    allowDeterministic: true,
    expect: (compiled) => {
      const protocol = compiled.protocol;
      return compiled.source === "deterministic_oracle" &&
        protocol.evidenceProtocol.mode === "public_oracle" &&
        protocol.settlementProtocol.mode === "auto_oracle";
    },
  },
];

const selectedKeys = (process.env.RUN_COMPILE_MATRIX_CASES || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const cases = selectedKeys.length
  ? allCases.filter((item) => selectedKeys.includes(item.key))
  : allCases;

try {
  const user = await register(`codex.matrix.${stamp}@example.com`, `matrix_${stamp.slice(-6)}`);

  for (const item of cases) {
    const compiled = await postJson(user.jar, "/api/challenges/compile", {
      inputText: item.input,
      providerId: proof.providerId,
      model: proof.model,
      language: languageOf(item.input),
      context: { surface: "e2e_protocol_compile_matrix", caseKey: item.key },
    });

    const row = {
      key: item.key,
      source: compiled.source,
      providerId: compiled.providerId,
      model: compiled.model,
      fallbackReason: compiled.fallbackReason ?? null,
      providerCall: compiled.providerCall
        ? {
            providerId: compiled.providerCall.providerId,
            model: compiled.providerCall.model,
            usedApi: compiled.providerCall.usedApi,
            requestKind: compiled.providerCall.requestKind,
            httpStatus: compiled.providerCall.httpStatus ?? null,
            responseId: compiled.providerCall.responseId ?? null,
            totalTokens: compiled.providerCall.totalTokens ?? null,
          }
        : null,
      protocol: compiled.protocol
        ? {
            title: compiled.protocol.title,
            language: compiled.protocol.language,
            participantMode: compiled.protocol.participantMode,
            outcomeType: compiled.protocol.outcomeType,
            evidenceMode: compiled.protocol.evidenceProtocol.mode,
            identityMode: compiled.protocol.identityProtocol.mode,
            identityRequired: compiled.protocol.identityProtocol.required,
            bindingRoles: bindingRoles(compiled.protocol),
            locationMode: compiled.protocol.locationProtocol.mode,
            settlementMode: compiled.protocol.settlementProtocol.mode,
            riskAllowed: compiled.protocol.riskPolicy.allowed,
            riskLevel: compiled.protocol.riskPolicy.riskLevel,
          }
        : null,
    };
    proof.cases.push(row);

    requireCheck(
      proof,
      `${item.key}_returned_protocol`,
      compiled.protocol?.version === "2.0",
      row,
    );
    requireCheck(
      proof,
      `${item.key}_no_silent_fake_fallback`,
      item.allowDeterministic
        ? compiled.source === "deterministic_oracle" && compiled.providerCall == null
        : compiled.source === "llm" &&
          compiled.providerCall?.usedApi === true &&
          compiled.providerCall?.providerId === proof.providerId &&
          compiled.providerCall?.requestKind === "text",
      row,
    );
    requireCheck(
      proof,
      `${item.key}_protocol_intent_matches_prompt`,
      item.expect(compiled),
      row,
    );
  }

  const quota = await getJson(user.jar, "/api/credits");
  proof.dailyQuota = quota.dailyQuota;
  proof.protocolCompileMatrixReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.protocolCompileMatrixReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
