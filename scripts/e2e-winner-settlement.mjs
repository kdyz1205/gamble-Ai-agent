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
    const err = new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
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
    password: "TestPass123!e2e",
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
  if (!session?.user?.id) {
    throw new Error(`No session established for ${email}`);
  }
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
  if (!passed) {
    throw new Error(`E2E check failed: ${name}`);
  }
}

function currentCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function objectiveAnswerProtocol(stamp, expectedAnswer) {
  return {
    version: "2.0",
    title: `Winner settlement objective answer ${stamp}`,
    userFacingSummary: "Two participants submit text answers. The only participant matching the expected answer wins.",
    rawPrompt: `Objective text answer challenge ${stamp}`,
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "completion",
    evidenceProtocol: {
      mode: "platform_metric",
      requiredEvidence: [
        `Each participant submits a text evidence row containing ANSWER: <value>. EXPECTED_ANSWER: ${expectedAnswer}`,
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

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const expectedAnswer = `WINNER-${stamp}`;
const wrongAnswer = `WRONG-${stamp}`;
const proof = {
  base,
  commitSha: currentCommitSha(),
  stamp,
  expectedAnswer,
  checks: {},
};

try {
  const creatorEmail = `codex.creator.${stamp}@example.com`;
  const opponentEmail = `codex.opponent.${stamp}@example.com`;
  const creator = await register(creatorEmail, `codex_creator_${stamp.slice(-6)}`);
  const opponent = await register(opponentEmail, `codex_opp_${stamp.slice(-6)}`);

  proof.accounts = {
    creator: {
      id: "[redacted]",
      email: redactEmail(creatorEmail),
      username: creator.session.user.username,
    },
    opponent: {
      id: "[redacted]",
      email: redactEmail(opponentEmail),
      username: opponent.session.user.username,
    },
  };

  const beforeCreator = await getJson(creator.jar, "/api/credits");
  const beforeOpponent = await getJson(opponent.jar, "/api/credits");
  proof.balancesBefore = {
    creator: beforeCreator.credits,
    opponent: beforeOpponent.credits,
  };

  const protocol = objectiveAnswerProtocol(stamp, expectedAnswer);
  const created = await postJson(creator.jar, "/api/challenges", {
    protocol,
    stake: 1,
    stakeToken: "credits",
    aiReview: true,
    isPublic: true,
    visibility: "public",
  });
  const challengeId = created.challenge.id;
  proof.challenge = {
    id: challengeId,
    url: `${base}/challenge/${challengeId}`,
    joinUrl: `${base}/join/${challengeId}`,
    createdStatus: created.challenge.status,
    protocolVersion: created.challenge.protocolVersion,
    settlementProtocolMode: created.challenge.settlementProtocolMode,
  };

  try {
    await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, {});
    proof.missingContractAccept = { status: 200, data: "unexpected_accept" };
  } catch (err) {
    proof.missingContractAccept = {
      status: err.status ?? null,
      data: err.data ?? err.message,
    };
  }
  requireCheck(
    proof,
    "accept_requires_rule_contract",
    proof.missingContractAccept.status === 400,
    proof.missingContractAccept,
  );

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  proof.accept = {
    status: accepted.challenge.status,
    participants: accepted.challenge.participants.length,
  };

  const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `ANSWER: ${expectedAnswer}`,
    metadata: { answer: expectedAnswer, deterministicE2E: true },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `ANSWER: ${wrongAnswer}`,
    metadata: { answer: wrongAnswer, deterministicE2E: true },
  });
  proof.evidence = {
    creatorEvidenceId: evCreator.evidence.id,
    opponentEvidenceId: evOpponent.evidence.id,
  };

  const beforeJudge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.beforeJudge = {
    status: beforeJudge.challenge.status,
    evidenceCount: beforeJudge.challenge.evidence.length,
    participantCount: beforeJudge.challenge.participants.length,
    protocolVersion: beforeJudge.challenge.protocolVersion,
    settlementProtocolMode: beforeJudge.challenge.settlementProtocolMode,
  };

  const judged = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, { tier: 1 });
  proof.judgment = {
    id: judged.judgment.id,
    status: judged.status,
    winnerId: judged.winnerId,
    confidence: judged.confidence,
    evidenceQuality: judged.evidenceQuality,
    settlementRecommendation: judged.settlementRecommendation,
    model: judged.model,
    reasoning: judged.reasoning,
  };

  const confirmed = await postJson(creator.jar, `/api/challenges/${challengeId}/confirm-verdict`, {});
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

  proof.confirm = {
    finalStatusFromConfirm: confirmed.challenge.status,
    settlement: confirmed.settlement,
    judgmentWinnerId: confirmed.judgment?.winnerId,
  };
  proof.finalChallenge = {
    status: finalChallenge.challenge.status,
    latestJudgmentWinnerId: finalChallenge.challenge.judgments?.[0]?.winnerId ?? null,
    judgmentCount: finalChallenge.challenge.judgments?.length ?? 0,
    evidenceCount: finalChallenge.challenge.evidence?.length ?? 0,
  };
  proof.balancesAfter = {
    creator: afterCreator.credits,
    opponent: afterOpponent.credits,
  };
  proof.creditTx = {
    creator: creatorTxs.map(txView),
    opponent: opponentTxs.map(txView),
  };

  requireCheck(proof, "created_waiting_for_opponent", created.challenge.status === "waiting_for_opponent", created.challenge.status);
  requireCheck(
    proof,
    "created_with_protocol_v2",
    created.challenge.protocolVersion === "2.0" && created.challenge.settlementProtocolMode === "auto_ai_text",
    proof.challenge,
  );
  requireCheck(proof, "opponent_accepted_evidence_window_open", accepted.challenge.status === "evidence_window_open", accepted.challenge.status);
  requireCheck(proof, "both_evidence_submitted", finalChallenge.challenge.evidence.length === 2, finalChallenge.challenge.evidence.length);
  requireCheck(proof, "judge_valid_winner", Boolean(judged.winnerId), proof.judgment);
  requireCheck(proof, "judge_high_confidence", judged.confidence >= 0.85, judged.confidence);
  requireCheck(proof, "judge_settle_recommendation", judged.settlementRecommendation === "settle_winner", judged.settlementRecommendation);
  requireCheck(proof, "challenge_settled", finalChallenge.challenge.status === "settled", finalChallenge.challenge.status);
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

  proof.winnerSettled = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.winnerSettled = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
