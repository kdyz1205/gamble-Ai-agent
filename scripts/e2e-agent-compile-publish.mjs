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
    password: "TestPass123!agent-compile",
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

function currentCommitSha() {
  if (process.env.E2E_COMMIT_SHA) return process.env.E2E_COMMIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function redactEmail(email) {
  const [, domain] = email.split("@");
  return `redacted@${domain || "example.com"}`;
}

async function callAgent(jar, body) {
  return postJson(jar, "/api/agent/respond", {
    conversationHistory: [],
    draftState: {},
    ...body,
  });
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const prompt = [
  "Create a two-person challenge for who can hold a plank longer with video evidence.",
  "Make it for fun with zero credits, one-hour deadline, AI vision judging, and manual review if identity or evidence is unclear.",
  `Use this test marker in the title or summary: ${stamp}.`,
].join(" ");
const proof = {
  base,
  commitSha: currentCommitSha(),
  stamp,
  providerId: "openai",
  model: "gpt-4o-mini",
  checks: {},
};

try {
  const email = `codex.agent.compile.${stamp}@example.com`;
  const user = await register(email, `agent_compile_${stamp.slice(-6)}`);
  proof.account = {
    id: "[redacted]",
    email: redactEmail(email),
    username: user.session.user.username,
  };

  const compiled = await callAgent(user.jar, {
    message: prompt,
    providerId: proof.providerId,
    model: proof.model,
  });
  const protocol = compiled.draftState?.protocol;
  proof.compile = {
    agentAction: compiled.agentAction,
    toolName: compiled.toolName,
    llmCall: compiled.llmCall,
    dailyQuota: compiled.dailyQuota,
    protocol: protocol ? {
      version: protocol.version,
      title: protocol.title,
      participantMode: protocol.participantMode,
      outcomeType: protocol.outcomeType,
      evidenceMode: protocol.evidenceProtocol?.mode,
      identityMode: protocol.identityProtocol?.mode,
      settlementMode: protocol.settlementProtocol?.mode,
      riskAllowed: protocol.riskPolicy?.allowed,
      threshold: protocol.settlementProtocol?.autoSettleConfidenceThreshold,
    } : null,
  };

  requireCheck(proof, "agent_compiled_protocol", compiled.agentAction === "show_draft" && protocol?.version === "2.0", proof.compile);
  requireCheck(proof, "selected_provider_model_reported", compiled.llmCall?.providerId === proof.providerId && compiled.llmCall?.model === proof.model, compiled.llmCall);
  requireCheck(proof, "provider_api_was_used", compiled.llmCall?.usedApi === true, compiled.llmCall);
  requireCheck(proof, "compiled_not_literal_prompt_title", Boolean(protocol?.title) && protocol.title !== prompt, protocol?.title);
  requireCheck(proof, "compiled_video_protocol", protocol?.evidenceProtocol?.mode?.includes("video") && protocol?.settlementProtocol?.mode === "auto_ai_vision", proof.compile.protocol);
  requireCheck(proof, "compiled_zero_credit_safe", protocol?.riskPolicy?.allowed === true, protocol?.riskPolicy);

  const published = await callAgent(user.jar, {
    message: "Publish this compiled protocol now. Use createChallengeFromProtocol.",
    providerId: proof.providerId,
    model: proof.model,
    draftState: compiled.draftState,
  });
  proof.publish = {
    agentAction: published.agentAction,
    toolName: published.toolName,
    toolError: published.toolError ?? null,
    toolResult: published.toolResult,
    agentGraph: published.agentGraph,
  };
  const challengeId = published.toolResult?.challengeId;
  requireCheck(
    proof,
    "agent_called_create_from_protocol",
    published.toolName === "createChallengeFromProtocol" && Boolean(challengeId),
    proof.publish,
  );
  requireCheck(
    proof,
    "publish_returned_join_link",
    typeof published.toolResult?.shareUrl === "string" && published.toolResult.shareUrl.includes(`/join/${challengeId}`),
    published.toolResult,
  );

  const detail = await getJson(user.jar, `/api/challenges/${challengeId}`);
  const protocolDetail = await getJson(user.jar, `/api/challenges/${challengeId}/protocol`);
  proof.challenge = {
    id: challengeId,
    status: detail.challenge?.status,
    title: detail.challenge?.title,
    protocolVersion: detail.challenge?.protocolVersion,
    evidenceMode: detail.challenge?.evidenceMode,
    identityMode: detail.challenge?.identityMode,
    settlementProtocolMode: detail.challenge?.settlementProtocolMode,
    riskLevel: detail.challenge?.riskLevel,
    participantCount: detail.challenge?.participants?.length,
    protocolPersisted: protocolDetail.protocol?.version === "2.0",
  };

  requireCheck(proof, "challenge_created_from_compiled_protocol", detail.challenge?.status === "waiting_for_opponent" && detail.challenge?.protocolVersion === "2.0", proof.challenge);
  requireCheck(proof, "challenge_protocol_persisted", protocolDetail.protocol?.rawPrompt === prompt && protocolDetail.protocol?.version === "2.0", {
    rawPrompt: protocolDetail.protocol?.rawPrompt,
    version: protocolDetail.protocol?.version,
  });
  requireCheck(proof, "creator_participant_exists", detail.challenge?.participants?.some((p) => p.role === "creator" && p.status === "accepted"), detail.challenge?.participants);

  proof.agentCompilePublishReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.agentCompilePublishReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
