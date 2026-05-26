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

async function requestAllowingError(jar, path, options = {}) {
  try {
    const out = await request(jar, path, options);
    return { ok: true, status: out.res.status, data: out.data };
  } catch (error) {
    return {
      ok: false,
      status: error?.status ?? 0,
      data: error?.data ?? null,
      message: error?.message ?? String(error),
    };
  }
}

function postJson(jar, path, body) {
  return request(jar, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((out) => out.data);
}

function postJsonAllowingError(jar, path, body) {
  return requestAllowingError(jar, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
    password: "TestPass123!agent-review",
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

function txView(tx) {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    challengeId: tx.challengeId,
    description: tx.description,
  };
}

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`E2E check failed: ${name}`);
}

async function callAgent(jar, body) {
  return postJson(jar, "/api/agent/respond", {
    conversationHistory: [],
    draftState: {},
    providerId: "openai",
    model: "gpt-5.4-mini",
    ...body,
  });
}

async function callAgentTool(jar, body, expectedTool) {
  const out = await callAgent(jar, body);
  if (out.toolName !== expectedTool) {
    throw new Error(`Agent did not call ${expectedTool}; got ${out.toolName || "none"}: ${out.userVisibleReply}`);
  }
  if (out.toolError) {
    throw new Error(`Agent ${expectedTool} failed: ${out.toolError}`);
  }
  if (!out.toolResult) {
    throw new Error(`Agent ${expectedTool} returned no toolResult`);
  }
  return out;
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const expectedAnswer = `REVIEW-WIN-${stamp}`;
const creatorWrongAnswer = `REVIEW-LOSE-A-${stamp}`;
const opponentWrongAnswer = `REVIEW-LOSE-B-${stamp}`;
const prompt = [
  "Create a private two-person objective text-answer challenge.",
  `EXPECTED_ANSWER: ${expectedAnswer}.`,
  "Each participant submits text evidence with metadata.answer.",
  "Exactly one participant matching EXPECTED_ANSWER wins; both/neither matching requires manual review.",
  "Use account-only identity, no location, auto_ai_text settlement, and a 2 hour deadline.",
  `Include marker ${stamp} in the title.`,
].join(" ");

const proof = {
  base,
  commitSha: currentCommitSha(),
  stamp,
  expectedAnswer,
  creatorWrongAnswer,
  opponentWrongAnswer,
  checks: {},
};

try {
  const creatorEmail = `codex.agent.review.creator.${stamp}@example.com`;
  const opponentEmail = `codex.agent.review.opponent.${stamp}@example.com`;
  const creator = await register(creatorEmail, `agent_review_creator_${stamp.slice(-6)}`);
  const opponent = await register(opponentEmail, `agent_review_opp_${stamp.slice(-6)}`);
  proof.accounts = {
    creator: { id: "[redacted]", email: redactEmail(creatorEmail), username: creator.session.user.username },
    opponent: { id: "[redacted]", email: redactEmail(opponentEmail), username: opponent.session.user.username },
  };

  const beforeCreator = await getJson(creator.jar, "/api/credits");
  const beforeOpponent = await getJson(opponent.jar, "/api/credits");
  proof.balancesBefore = {
    creator: beforeCreator.credits,
    opponent: beforeOpponent.credits,
  };

  const compiled = await callAgent(creator.jar, { message: prompt });
  const protocol = compiled.draftState?.protocol;
  proof.compile = {
    agentAction: compiled.agentAction,
    toolName: compiled.toolName,
    llmCall: compiled.llmCall,
    protocol: protocol ? {
      version: protocol.version,
      title: protocol.title,
      evidenceMode: protocol.evidenceProtocol?.mode,
      identityMode: protocol.identityProtocol?.mode,
      identityRequired: protocol.identityProtocol?.required,
      settlementMode: protocol.settlementProtocol?.mode,
      riskAllowed: protocol.riskPolicy?.allowed,
    } : null,
  };
  requireCheck(proof, "compile_used_selected_provider", compiled.llmCall?.providerId === "openai" && compiled.llmCall?.model === "gpt-5.4-mini" && compiled.llmCall?.usedApi === true, proof.compile);
  requireCheck(proof, "compile_returned_text_review_protocol", protocol?.version === "2.0" && protocol.evidenceProtocol?.mode === "platform_metric" && protocol.identityProtocol?.mode === "account_only" && protocol.identityProtocol?.required === false, proof.compile.protocol);
  requireCheck(proof, "compile_preserved_expected_answer", JSON.stringify(protocol).includes(expectedAnswer), proof.compile.protocol);

  const publishDraft = { ...compiled.draftState, stake: 1, stakeType: "credits" };
  const published = await callAgentTool(
    creator.jar,
    {
      message: "Publish this compiled protocol now with stake 1 credit. Use createChallengeFromProtocol.",
      draftState: publishDraft,
    },
    "createChallengeFromProtocol",
  );
  const challengeId = published.toolResult.challengeId;
  proof.publish = {
    toolName: published.toolName,
    toolResult: published.toolResult,
    agentGraph: published.agentGraph,
  };
  requireCheck(proof, "agent_published_review_protocol", Boolean(challengeId) && published.toolResult.status === "waiting_for_opponent", proof.publish);
  requireCheck(proof, "published_with_join_link", published.toolResult.shareUrl?.includes(`/join/${challengeId}`), published.toolResult);

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  proof.accept = {
    status: accepted.challenge?.status,
    participants: accepted.challenge?.participants?.length,
  };
  requireCheck(proof, "opponent_accepted", accepted.challenge?.status === "evidence_window_open", proof.accept);

  const creatorEvidence = await callAgentTool(
    creator.jar,
    {
      message: [
        `Submit my text evidence for challenge ${challengeId}.`,
        `Description: ANSWER: ${creatorWrongAnswer}.`,
        `metadata JSON is {"answer":"${creatorWrongAnswer}","agentReviewPath":true}.`,
      ].join("\n"),
    },
    "uploadEvidence",
  );
  const opponentEvidence = await callAgentTool(
    opponent.jar,
    {
      message: [
        `Submit my text evidence for challenge ${challengeId}.`,
        `Description: ANSWER: ${opponentWrongAnswer}.`,
        `metadata JSON is {"answer":"${opponentWrongAnswer}","agentReviewPath":true}.`,
      ].join("\n"),
    },
    "uploadEvidence",
  );
  proof.evidence = {
    creator: creatorEvidence.toolResult,
    opponent: opponentEvidence.toolResult,
  };
  requireCheck(proof, "agent_uploaded_creator_bad_evidence", Boolean(creatorEvidence.toolResult.evidenceId) && creatorEvidence.toolResult.verification?.[0]?.decision === "passed", proof.evidence.creator);
  requireCheck(proof, "agent_uploaded_opponent_bad_evidence", Boolean(opponentEvidence.toolResult.evidenceId) && opponentEvidence.toolResult.verification?.[0]?.decision === "passed", proof.evidence.opponent);

  const beforeJudge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.beforeJudge = {
    status: beforeJudge.challenge?.status,
    evidenceCount: beforeJudge.challenge?.evidence?.length,
    participantCount: beforeJudge.challenge?.participants?.length,
  };
  requireCheck(proof, "review_case_entered_ai_reviewing", beforeJudge.challenge?.status === "ai_reviewing", proof.beforeJudge);

  const judged = await callAgentTool(
    creator.jar,
    { message: `Run the protocol judge for challenge ${challengeId} now.` },
    "runProtocolJudge",
  );
  proof.judge = {
    toolName: judged.toolName,
    toolResult: judged.toolResult,
    agentGraph: judged.agentGraph,
  };
  const reviewRecommendation = ["needs_review", "invalid_evidence", "tie_or_no_winner"].includes(String(judged.toolResult.recommendation));
  requireCheck(proof, "agent_judged_review_case", judged.toolResult.challengeId === challengeId && judged.toolResult.winnerId === null, proof.judge);
  requireCheck(proof, "agent_judge_not_settle_grade", judged.toolResult.confidence < 0.85 && reviewRecommendation && judged.toolResult.settlementEligibility?.eligible === false, proof.judge.toolResult);

  const guard = await postJsonAllowingError(creator.jar, `/api/challenges/${challengeId}/confirm-verdict`, {});
  proof.confirmGuard = {
    ok: guard.ok,
    status: guard.status,
    data: guard.data,
    message: guard.message,
  };
  requireCheck(proof, "confirm_verdict_rejected_unclear_case", guard.ok === false && guard.status >= 400, proof.confirmGuard);

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const afterCreator = await getJson(creator.jar, "/api/credits");
  const afterOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorTxs = afterCreator.transactions.filter((tx) => tx.challengeId === challengeId);
  const opponentTxs = afterOpponent.transactions.filter((tx) => tx.challengeId === challengeId);
  const settlementRows = [...creatorTxs, ...opponentTxs].filter((tx) => tx.type === "win" || tx.type === "loss" || tx.type === "refund");

  proof.finalChallenge = {
    status: finalChallenge.challenge?.status,
    latestJudgmentWinnerId: finalChallenge.challenge?.judgments?.[0]?.winnerId ?? null,
    judgmentCount: finalChallenge.challenge?.judgments?.length ?? 0,
    evidenceCount: finalChallenge.challenge?.evidence?.length ?? 0,
  };
  proof.balancesAfter = {
    creator: afterCreator.credits,
    opponent: afterOpponent.credits,
  };
  proof.creditTx = {
    creator: creatorTxs.map(txView),
    opponent: opponentTxs.map(txView),
  };

  requireCheck(proof, "review_path_not_settled", finalChallenge.challenge?.status !== "settled", proof.finalChallenge);
  requireCheck(proof, "review_path_terminal_review_state", ["manual_review_required", "ai_inconclusive"].includes(finalChallenge.challenge?.status), proof.finalChallenge);
  requireCheck(proof, "review_path_no_winner", finalChallenge.challenge?.judgments?.[0]?.winnerId === null, proof.finalChallenge);
  requireCheck(proof, "review_path_no_settlement_rows", settlementRows.length === 0, settlementRows.map(txView));
  requireCheck(proof, "review_path_balance_math", afterCreator.credits === beforeCreator.credits - 2 && afterOpponent.credits === beforeOpponent.credits - 1, {
    before: proof.balancesBefore,
    after: proof.balancesAfter,
  });

  proof.agentReviewPathReady = true;
  proof.winnerSettled = false;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.agentReviewPathReady = false;
  proof.winnerSettled = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
