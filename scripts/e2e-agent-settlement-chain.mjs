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
    password: "TestPass123!agent-settle",
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

function currentCommitSha() {
  if (process.env.E2E_COMMIT_SHA) return process.env.E2E_COMMIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function objectiveAnswerProtocol(stamp, expectedAnswer) {
  return {
    version: "2.0",
    title: `Agent settlement objective answer ${stamp}`,
    userFacingSummary: "Two participants submit text answers. The only participant matching the expected answer wins.",
    rawPrompt: `Agent-settled objective text answer challenge ${stamp}`,
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "completion",
    evidenceProtocol: {
      mode: "platform_metric",
      requiredEvidence: [
        `Each participant submits one text evidence row containing ANSWER: <value>. EXPECTED_ANSWER: ${expectedAnswer}`,
      ],
      captureInstructions: ["Submit one text answer before judging."],
      invalidEvidenceRules: ["Missing answer text is invalid.", "Multiple conflicting answers require manual review."],
      requiredMetadata: ["answer"],
    },
    identityProtocol: {
      mode: "account_only",
      required: false,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false },
        { role: "opponent", label: "Opponent", expectedPosition: "any", requiredQrOrCode: false },
      ],
      autoSettlementRequiresIdentityConfidence: 1,
    },
    locationProtocol: {
      mode: "none",
      requiresLiveLocation: false,
      requiresCoPresence: false,
      locationPrivacy: "hidden",
    },
    timingProtocol: {
      startCondition: "Challenge starts after opponent accepts.",
      endCondition: "Both participants submit a text answer.",
      deadline: "2 hours",
      tieBreaker: "If both or neither match, no automatic winner.",
      allowedAttempts: "1",
    },
    settlementProtocol: {
      mode: "auto_ai_text",
      winCondition: `EXPECTED_ANSWER: ${expectedAnswer}. If exactly one participant submits the expected answer, that participant wins.`,
      judgeInstructions: [
        "Read each participant answer from evidence metadata or text.",
        `Correct answer: ${expectedAnswer}`,
        "Return settle_winner only when exactly one participant matches the expected answer.",
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Both participants match.", "Neither participant matches.", "Answer text is missing."],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: ["Internal credits only."],
      restrictions: ["No real-money gambling."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 200,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

async function callAgent(jar, message) {
  return postJson(jar, "/api/agent/respond", {
    message,
    conversationHistory: [],
    draftState: {},
  });
}

async function callAgentTool(jar, message, expectedTool, { allowToolError = false } = {}) {
  const out = await callAgent(jar, message);
  if (out.toolName !== expectedTool) {
    throw new Error(`Agent did not call ${expectedTool}; got ${out.toolName || "none"}: ${out.userVisibleReply}`);
  }
  if (out.toolError && !allowToolError) {
    throw new Error(`Agent ${expectedTool} failed: ${out.toolError}`);
  }
  return out;
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const expectedAnswer = `AGENT-WIN-${stamp}`;
const wrongAnswer = `AGENT-LOSE-${stamp}`;
const proof = {
  base,
  commitSha: currentCommitSha(),
  stamp,
  expectedAnswer,
  checks: {},
};

try {
  const creatorEmail = `codex.agent.settle.creator.${stamp}@example.com`;
  const opponentEmail = `codex.agent.settle.opponent.${stamp}@example.com`;
  const creator = await register(creatorEmail, `agent_settle_creator_${stamp.slice(-6)}`);
  const opponent = await register(opponentEmail, `agent_settle_opp_${stamp.slice(-6)}`);

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

  const created = await postJson(creator.jar, "/api/challenges", {
    protocol: objectiveAnswerProtocol(stamp, expectedAnswer),
    stake: 1,
    stakeToken: "credits",
    aiReview: true,
    isPublic: false,
    visibility: "private",
  });
  const challengeId = created.challenge?.id;
  proof.challenge = {
    id: challengeId,
    url: `${base}/challenge/${challengeId}`,
    joinUrl: `${base}/join/${challengeId}`,
    createdStatus: created.challenge?.status,
    protocolVersion: created.challenge?.protocolVersion,
    evidenceMode: created.challenge?.evidenceMode,
    settlementProtocolMode: created.challenge?.settlementProtocolMode,
  };
  requireCheck(proof, "challenge_created_waiting_for_opponent", Boolean(challengeId) && created.challenge.status === "waiting_for_opponent", proof.challenge);

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  proof.accept = {
    status: accepted.challenge?.status,
    participants: accepted.challenge?.participants?.length,
  };
  requireCheck(proof, "opponent_accept_opened_evidence_window", accepted.challenge?.status === "evidence_window_open", proof.accept);

  const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `ANSWER: ${expectedAnswer}`,
    metadata: { answer: expectedAnswer, agentSettlementE2E: true },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `ANSWER: ${wrongAnswer}`,
    metadata: { answer: wrongAnswer, agentSettlementE2E: true },
  });
  proof.evidence = {
    creatorEvidenceId: evCreator.evidence?.id,
    opponentEvidenceId: evOpponent.evidence?.id,
  };
  requireCheck(proof, "both_evidence_submitted", Boolean(proof.evidence.creatorEvidenceId && proof.evidence.opponentEvidenceId), proof.evidence);

  const beforeJudge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.beforeJudge = {
    status: beforeJudge.challenge?.status,
    evidenceCount: beforeJudge.challenge?.evidence?.length,
    participantCount: beforeJudge.challenge?.participants?.length,
  };
  requireCheck(proof, "challenge_entered_ai_reviewing", beforeJudge.challenge?.status === "ai_reviewing", proof.beforeJudge);

  const agentJudge = await callAgentTool(
    creator.jar,
    `Run the protocol judge for challenge ${challengeId} now. Use runProtocolJudge and return the real backend result.`,
    "runProtocolJudge",
  );
  proof.agentJudge = {
    toolName: agentJudge.toolName,
    toolError: agentJudge.toolError ?? null,
    toolResult: agentJudge.toolResult,
    agentGraph: agentJudge.agentGraph,
  };
  requireCheck(
    proof,
    "agent_called_run_protocol_judge",
    agentJudge.toolName === "runProtocolJudge" && Boolean(agentJudge.toolResult?.judgmentId),
    proof.agentJudge,
  );
  requireCheck(
    proof,
    "agent_judge_valid_winner",
    Boolean(agentJudge.toolResult?.winnerId) && agentJudge.toolResult?.confidence >= 0.85,
    proof.agentJudge.toolResult,
  );

  let afterJudgeChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.afterAgentJudge = {
    status: afterJudgeChallenge.challenge?.status,
    winnerId: afterJudgeChallenge.challenge?.judgments?.[0]?.winnerId ?? null,
    judgmentCount: afterJudgeChallenge.challenge?.judgments?.length ?? 0,
  };

  if (afterJudgeChallenge.challenge?.status !== "settled") {
    const agentConfirm = await callAgentTool(
      creator.jar,
      `Confirm the AI verdict for challenge ${challengeId} and settle credits if the guardrails allow it. Use confirmVerdict.`,
      "confirmVerdict",
    );
    proof.agentConfirm = {
      toolName: agentConfirm.toolName,
      toolError: agentConfirm.toolError ?? null,
      toolResult: agentConfirm.toolResult,
      agentGraph: agentConfirm.agentGraph,
    };
    requireCheck(
      proof,
      "agent_called_confirm_verdict_when_required",
      agentConfirm.toolName === "confirmVerdict" && agentConfirm.toolResult?.status === "settled",
      proof.agentConfirm,
    );
    afterJudgeChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  } else {
    const redundantConfirm = await callAgentTool(
      creator.jar,
      `Confirm the AI verdict for challenge ${challengeId}. If it is already settled, call confirmVerdict and report the guardrail.`,
      "confirmVerdict",
      { allowToolError: true },
    );
    proof.agentConfirmAlreadySettledGuard = {
      toolName: redundantConfirm.toolName,
      toolError: redundantConfirm.toolError ?? null,
      toolResult: redundantConfirm.toolResult ?? null,
    };
    requireCheck(
      proof,
      "confirm_verdict_guarded_after_auto_settle",
      redundantConfirm.toolName === "confirmVerdict" && String(redundantConfirm.toolError || "").includes("Already settled"),
      proof.agentConfirmAlreadySettledGuard,
    );
  }

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const afterCreator = await getJson(creator.jar, "/api/credits");
  const afterOpponent = await getJson(opponent.jar, "/api/credits");

  const creatorTxs = afterCreator.transactions.filter((tx) => tx.challengeId === challengeId);
  const opponentTxs = afterOpponent.transactions.filter((tx) => tx.challengeId === challengeId);
  const winnerWinRow = creatorTxs.find((tx) => tx.type === "win" && tx.amount === 2);
  const winnerStakeRow = creatorTxs.find((tx) => tx.type === "stake" && tx.amount === -1);
  const judgeSpendRow = creatorTxs.find((tx) => tx.type === "ai_judge" && tx.amount === -1);
  const loserStakeRow = opponentTxs.find((tx) => tx.type === "stake" && tx.amount === -1);
  const loserLossRow = opponentTxs.find((tx) => tx.type === "loss" && tx.amount === -1);
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

  requireCheck(proof, "final_challenge_settled", finalChallenge.challenge?.status === "settled", proof.finalChallenge);
  requireCheck(proof, "final_winner_is_creator", finalChallenge.challenge?.judgments?.[0]?.winnerId === creator.session.user.id, proof.finalChallenge);
  requireCheck(proof, "winner_win_row", Boolean(winnerWinRow), proof.creditTx.creator);
  requireCheck(proof, "winner_stake_row_linked", Boolean(winnerStakeRow), proof.creditTx.creator);
  requireCheck(proof, "judge_spend_row", Boolean(judgeSpendRow), proof.creditTx.creator);
  requireCheck(proof, "loser_stake_row", Boolean(loserStakeRow), proof.creditTx.opponent);
  requireCheck(proof, "loser_loss_row", Boolean(loserLossRow), proof.creditTx.opponent);
  requireCheck(proof, "no_refund_rows", refundRows.length === 0, refundRows.map(txView));
  requireCheck(proof, "winner_balance_math", afterCreator.credits === beforeCreator.credits, {
    before: beforeCreator.credits,
    after: afterCreator.credits,
    note: "creator paid stake -1 and judge -1, then received win +2",
  });
  requireCheck(proof, "loser_balance_math", afterOpponent.credits === beforeOpponent.credits - 1, {
    before: beforeOpponent.credits,
    after: afterOpponent.credits,
  });

  proof.agentSettlementReady = true;
  proof.winnerSettled = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.agentSettlementReady = false;
  proof.winnerSettled = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
