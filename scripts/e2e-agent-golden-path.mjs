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
    password: "TestPass123!agent-golden",
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
    model: "gpt-4o-mini",
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
const expectedAnswer = `GOLDEN-WIN-${stamp}`;
const wrongAnswer = `GOLDEN-LOSE-${stamp}`;
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
  wrongAnswer,
  checks: {},
};

try {
  const creatorEmail = `codex.agent.golden.creator.${stamp}@example.com`;
  const opponentEmail = `codex.agent.golden.opponent.${stamp}@example.com`;
  const creator = await register(creatorEmail, `agent_golden_creator_${stamp.slice(-6)}`);
  const opponent = await register(opponentEmail, `agent_golden_opp_${stamp.slice(-6)}`);
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
      settlementMode: protocol.settlementProtocol?.mode,
      winCondition: protocol.settlementProtocol?.winCondition,
      riskAllowed: protocol.riskPolicy?.allowed,
    } : null,
  };
  requireCheck(proof, "compile_used_selected_provider", compiled.llmCall?.providerId === "openai" && compiled.llmCall?.model === "gpt-4o-mini" && compiled.llmCall?.usedApi === true, proof.compile);
  requireCheck(proof, "compile_returned_protocol_v2", protocol?.version === "2.0" && protocol.riskPolicy?.allowed === true, proof.compile.protocol);
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
  requireCheck(proof, "agent_published_compiled_protocol", Boolean(challengeId) && published.toolResult.status === "waiting_for_opponent", proof.publish);
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
        `Description: ANSWER: ${expectedAnswer}.`,
        `metadata JSON is {"answer":"${expectedAnswer}","agentGoldenPath":true}.`,
      ].join("\n"),
    },
    "uploadEvidence",
  );
  const opponentEvidence = await callAgentTool(
    opponent.jar,
    {
      message: [
        `Submit my text evidence for challenge ${challengeId}.`,
        `Description: ANSWER: ${wrongAnswer}.`,
        `metadata JSON is {"answer":"${wrongAnswer}","agentGoldenPath":true}.`,
      ].join("\n"),
    },
    "uploadEvidence",
  );
  proof.evidence = {
    creator: creatorEvidence.toolResult,
    opponent: opponentEvidence.toolResult,
  };
  requireCheck(proof, "agent_uploaded_creator_evidence", Boolean(creatorEvidence.toolResult.evidenceId), proof.evidence.creator);
  requireCheck(proof, "agent_uploaded_opponent_evidence", Boolean(opponentEvidence.toolResult.evidenceId), proof.evidence.opponent);

  const beforeJudge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.beforeJudge = {
    status: beforeJudge.challenge?.status,
    evidenceCount: beforeJudge.challenge?.evidence?.length,
    participantCount: beforeJudge.challenge?.participants?.length,
  };
  requireCheck(proof, "same_challenge_entered_ai_reviewing", beforeJudge.challenge?.status === "ai_reviewing", proof.beforeJudge);

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
  requireCheck(proof, "agent_judged_same_challenge", judged.toolResult.challengeId === challengeId && judged.toolResult.winnerId === creator.session.user.id, proof.judge);
  requireCheck(proof, "agent_judge_settle_grade", judged.toolResult.confidence >= 0.85 && judged.toolResult.recommendation === "settle_winner", proof.judge.toolResult);

  const afterJudge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  if (afterJudge.challenge?.status !== "settled") {
    const confirmed = await callAgentTool(
      creator.jar,
      { message: `Confirm the AI verdict for challenge ${challengeId} and settle credits if allowed.` },
      "confirmVerdict",
    );
    proof.confirm = {
      toolName: confirmed.toolName,
      toolResult: confirmed.toolResult,
      agentGraph: confirmed.agentGraph,
    };
    requireCheck(proof, "agent_confirmed_same_challenge", confirmed.toolResult.status === "settled", proof.confirm);
  } else {
    proof.confirm = { skipped: "already_settled_by_runProtocolJudge" };
  }

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const afterCreator = await getJson(creator.jar, "/api/credits");
  const afterOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorTxs = afterCreator.transactions.filter((tx) => tx.challengeId === challengeId);
  const opponentTxs = afterOpponent.transactions.filter((tx) => tx.challengeId === challengeId);
  const refundRows = [...creatorTxs, ...opponentTxs].filter((tx) => tx.type === "refund");

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

  requireCheck(proof, "golden_path_settled", finalChallenge.challenge?.status === "settled", proof.finalChallenge);
  requireCheck(proof, "golden_path_winner_is_creator", finalChallenge.challenge?.judgments?.[0]?.winnerId === creator.session.user.id, proof.finalChallenge);
  requireCheck(proof, "golden_path_winner_ledger", creatorTxs.some((tx) => tx.type === "win" && tx.amount === 2), proof.creditTx.creator);
  requireCheck(proof, "golden_path_loser_ledger", opponentTxs.some((tx) => tx.type === "loss" && tx.amount === -1), proof.creditTx.opponent);
  requireCheck(proof, "golden_path_no_refund", refundRows.length === 0, refundRows.map(txView));
  requireCheck(proof, "golden_path_balance_math", afterCreator.credits === beforeCreator.credits && afterOpponent.credits === beforeOpponent.credits - 1, {
    before: proof.balancesBefore,
    after: proof.balancesAfter,
  });

  proof.agentGoldenPathReady = true;
  proof.winnerSettled = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.agentGoldenPathReady = false;
  proof.winnerSettled = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
