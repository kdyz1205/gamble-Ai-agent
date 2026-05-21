import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
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

async function request(jar, pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${base}${pathOrUrl}`;
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
    const err = new Error(`${options.method || "GET"} ${pathOrUrl} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { res, data, text };
}

function postJson(jar, pathOrUrl, body) {
  return request(jar, pathOrUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((out) => out.data);
}

function getJson(jar, pathOrUrl) {
  return request(jar, pathOrUrl).then((out) => out.data);
}

async function register(email, username) {
  const jar = new Jar(username);
  const csrf = (await getJson(jar, "/api/auth/csrf")).csrfToken;
  const form = new URLSearchParams({
    email,
    password: "TestPass123!rejudge",
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

async function currentCommitSha() {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"], { windowsHide: true });
    return stdout.trim();
  } catch {
    return process.env.E2E_COMMIT_SHA || null;
  }
}

function txView(tx) {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    description: tx.description,
  };
}

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`E2E check failed: ${name}`);
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  commitSha: await currentCommitSha(),
  stamp,
  checks: {},
};

try {
  const creator = await register(`codex.rejudge.creator.${stamp}@example.com`, `rej_creator_${stamp.slice(-6)}`);
  const opponent = await register(`codex.rejudge.opponent.${stamp}@example.com`, `rej_opp_${stamp.slice(-6)}`);
  proof.accounts = {
    creator: { id: "[redacted]", email: "redacted@example.com", username: creator.session.user.username },
    opponent: { id: "[redacted]", email: "redacted@example.com", username: opponent.session.user.username },
  };

  const created = await postJson(creator.jar, "/api/challenges", {
    title: `Rejudge proof ${stamp}`,
    description: "Production E2E proving a creator can request another AI verdict before settlement.",
    marketType: "challenge",
    proposition: "The winner is the participant whose evidence best satisfies the code-phrase rule.",
    type: "General",
    stake: 1,
    stakeToken: "credits",
    deadline: "2 hours",
    rules: [
      "Winner: the participant whose evidence explicitly contains the phrase BLUE-CROWN-91.",
      "If only one participant includes BLUE-CROWN-91, that participant wins.",
      "This challenge is intentionally text evidence so rejudge can prove model retry without media cost.",
      "Do not auto-settle in this proof; creator confirmation is separate.",
    ].join("\n"),
    evidenceType: "self_report",
    settlementMode: "manual_confirmation",
    aiReview: true,
    isPublic: false,
    visibility: "private",
  });
  const challengeId = created.challenge.id;
  proof.challengeId = challengeId;

  await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "self_report",
    description: "Creator evidence contains the required phrase BLUE-CROWN-91.",
  });
  await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "self_report",
    description: "Opponent evidence says RED-CROWN-00 and does not satisfy the phrase rule.",
  });

  const beforeJudge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  requireCheck(proof, "ready_for_first_judge", beforeJudge.challenge.status === "ai_reviewing", beforeJudge.challenge.status);

  const first = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, {
    tier: 1,
    providerId: "openai",
    model: "gpt-4o-mini",
    autoSettle: false,
  });
  const afterFirst = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  requireCheck(proof, "first_judgment_created", afterFirst.challenge.judgments.length === 1, afterFirst.challenge.judgments.length);
  requireCheck(proof, "first_not_fallback", first.source !== "fallback", first);
  requireCheck(proof, "first_not_settled", afterFirst.challenge.status !== "settled", afterFirst.challenge.status);

  const second = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, {
    tier: 2,
    providerId: "openai",
    model: "gpt-4o",
    rejudge: true,
    reason: "E2E: creator disputes the first AI verdict and requests a stronger model.",
    autoSettle: false,
  });
  const afterSecond = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const creatorCredits = await getJson(creator.jar, "/api/credits");
  const creatorTxs = creatorCredits.transactions.filter((tx) => tx.challengeId === challengeId);
  const judgeRows = creatorTxs.filter((tx) => tx.type === "ai_judge");
  const refundRows = creatorTxs.filter((tx) => tx.type === "refund");

  proof.firstJudgment = {
    id: first.judgment.id,
    source: first.source,
    model: first.model,
    status: first.status,
    creditsUsed: first.creditsUsed,
    creditsRefunded: first.creditsRefunded ?? 0,
    providerCall: first.providerCall ?? first.verdict?.providerCall ?? null,
  };
  proof.secondJudgment = {
    id: second.judgment.id,
    source: second.source,
    model: second.model,
    status: second.status,
    creditsUsed: second.creditsUsed,
    creditsRefunded: second.creditsRefunded ?? 0,
    providerCall: second.providerCall ?? second.verdict?.providerCall ?? null,
  };
  proof.finalChallengeStatus = afterSecond.challenge.status;
  proof.creditTx = creatorTxs.map(txView);

  requireCheck(proof, "second_judgment_created", afterSecond.challenge.judgments.length === 2, afterSecond.challenge.judgments.map((j) => j.id));
  requireCheck(proof, "second_is_new_judgment", first.judgment.id !== second.judgment.id, { first: first.judgment.id, second: second.judgment.id });
  requireCheck(proof, "second_not_fallback", second.source !== "fallback", second);
  const firstProviderCall = first.providerCall ?? first.verdict?.providerCall ?? null;
  const secondProviderCall = second.providerCall ?? second.verdict?.providerCall ?? null;
  requireCheck(proof, "first_provider_call_recorded", Boolean(firstProviderCall), firstProviderCall);
  requireCheck(proof, "first_provider_call_used_api", firstProviderCall?.usedApi === true, firstProviderCall);
  requireCheck(proof, "first_provider_call_http_200", firstProviderCall?.httpStatus === 200 || firstProviderCall?.httpStatus == null, firstProviderCall);
  requireCheck(proof, "first_provider_response_id_present", typeof firstProviderCall?.responseId === "string" && firstProviderCall.responseId.length > 0, firstProviderCall);
  requireCheck(proof, "second_provider_call_recorded", Boolean(secondProviderCall), secondProviderCall);
  requireCheck(proof, "second_provider_call_used_api", secondProviderCall?.usedApi === true, secondProviderCall);
  requireCheck(proof, "second_provider_call_http_200", secondProviderCall?.httpStatus === 200 || secondProviderCall?.httpStatus == null, secondProviderCall);
  requireCheck(proof, "second_provider_response_id_present", typeof secondProviderCall?.responseId === "string" && secondProviderCall.responseId.length > 0, secondProviderCall);
  requireCheck(proof, "still_not_settled_without_confirm", afterSecond.challenge.status !== "settled", afterSecond.challenge.status);
  requireCheck(proof, "two_ai_judge_rows", judgeRows.length === 2, judgeRows.map(txView));
  requireCheck(proof, "first_cost_spent", judgeRows.some((tx) => tx.amount === -1), judgeRows.map(txView));
  requireCheck(proof, "second_cost_spent", judgeRows.some((tx) => tx.amount === -5), judgeRows.map(txView));
  requireCheck(
    proof,
    "provider_neutral_tier_labels",
    judgeRows.every((tx) => /\[(Light|Pro|Max)( on-chain)?\]/.test(String(tx.description ?? ""))) &&
      judgeRows.every((tx) => !/\[(Haiku|Sonnet|Opus)( on-chain)?\]/.test(String(tx.description ?? ""))),
    judgeRows.map(txView),
  );
  requireCheck(proof, "no_provider_fallback_refund", refundRows.length === 0, refundRows.map(txView));

  proof.passed = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  console.log(JSON.stringify(proof, null, 2));
  process.exitCode = 1;
}
