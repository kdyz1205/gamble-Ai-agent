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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableAuthError(error) {
  const text = JSON.stringify(error?.data ?? error?.message ?? "");
  return /connection timeout|connection terminated|timeout|too many connections|prepared statement|ECONNRESET|ETIMEDOUT/i.test(text);
}

async function register(email, username) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const jar = new Jar(username);
    try {
      const csrf = (await getJson(jar, "/api/auth/csrf")).csrfToken;
      const form = new URLSearchParams({
        email,
        password: "TestPass123!oracle",
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
      return { jar, session, email, registerAttempts: attempt };
    } catch (error) {
      lastError = error;
      if (!retryableAuthError(error) || attempt === 4) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function redactEmail(email) {
  const [, domain] = email.split("@");
  return `redacted@${domain || "example.com"}`;
}

function currentCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
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
  if (!passed) throw new Error(`Data-source oracle settlement E2E failed: ${name}`);
}

function dataSourceOracleProtocol({ stamp, settlementIso }) {
  return {
    version: "2.0",
    title: `NPM data-source oracle settlement ${stamp}`,
    userFacingSummary: "Creator wins if the live npm Registry API returns package metadata for react.",
    rawPrompt: "I bet the npm package react exists in the npm Registry.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "yes_no",
    evidenceProtocol: {
      mode: "public_oracle",
      requiredEvidence: ["Live npm Registry API response fetched by the data-source router."],
      captureInstructions: ["No user media upload is required; the app fetches the public API at settlement."],
      invalidEvidenceRules: ["Screenshots or self-reports do not override the router response."],
      requiredMetadata: ["DATA_SOURCE_KEY", "DATA_SOURCE_PARAMS"],
    },
    identityProtocol: {
      mode: "account_only",
      required: false,
      participantBindings: [
        { role: "creator", label: "Creator / true side", expectedPosition: "any", requiredQrOrCode: false },
        { role: "opponent", label: "Opponent / false side", expectedPosition: "any", requiredQrOrCode: false },
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
      endCondition: "Router fetch completes at settlement time.",
      deadline: settlementIso,
      tieBreaker: "If the router cannot fetch or the response is ambiguous, manual review is required.",
      allowedAttempts: "One locked router fetch.",
    },
    settlementProtocol: {
      mode: "auto_oracle",
      winCondition: "Creator wins if npm_registry_package returns live metadata where name is react. Opponent wins only if the router proves the package does not exist.",
      judgeInstructions: [
        "DATA_SOURCE_KEY: npm_registry_package",
        'DATA_SOURCE_PARAMS: {"package":"react"}',
        "Use only the returned npm Registry API data.",
        "If returned data has name=\"react\" or a package metadata object for react, winner is Participant A.",
        "If the router returns HTTP 404 or proves package missing, winner is Participant B.",
        "Return settle_winner only when the router fetch is live, evidenceQuality is good, and confidence is at least 0.85.",
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: [
        "Router fetch fails.",
        "Returned data cannot be mapped to package existence.",
        "Selected AI model does not produce strict verdict JSON.",
      ],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: ["Internal credits only."],
      restrictions: ["No real-money gambling."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 1200,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const settlementIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
const proof = {
  base,
  commitSha: currentCommitSha(),
  stamp,
  settlementIso,
  checks: {},
};

try {
  const creatorEmail = `codex.ds.creator.${stamp}@example.com`;
  const opponentEmail = `codex.ds.opponent.${stamp}@example.com`;
  const creator = await register(creatorEmail, `ds_creator_${stamp.slice(-6)}`);
  const opponent = await register(opponentEmail, `ds_opp_${stamp.slice(-6)}`);

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

  const protocol = dataSourceOracleProtocol({ stamp, settlementIso });
  const created = await postJson(creator.jar, "/api/challenges", {
    protocol,
    stake: 1,
    stakeToken: "credits",
    aiReview: true,
    isPublic: false,
    visibility: "private",
  });
  const challengeId = created.challenge.id;
  proof.challenge = {
    id: challengeId,
    url: `${base}/challenge/${challengeId}`,
    joinUrl: `${base}/join/${challengeId}`,
    createdStatus: created.challenge.status,
    protocolVersion: created.challenge.protocolVersion,
    evidenceMode: created.challenge.evidenceMode,
    settlementProtocolMode: created.challenge.settlementProtocolMode,
  };

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  proof.accept = {
    status: accepted.challenge.status,
    participants: accepted.challenge.participants.length,
  };

  const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "oracle_lock",
    description: "Creator side is true: npm package react exists. The router must fetch npm_registry_package.",
    metadata: {
      dataSourceKey: "npm_registry_package",
      dataSourceParams: { package: "react" },
      side: "package_exists",
    },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "oracle_lock",
    description: "Opponent side is false: npm package react does not exist.",
    metadata: {
      dataSourceKey: "npm_registry_package",
      dataSourceParams: { package: "react" },
      side: "package_missing",
    },
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
  };

  const judged = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, {
    tier: 1,
    providerId: "openai",
    model: "gpt-5-mini",
  });
  proof.judgment = {
    id: judged.judgment.id,
    status: judged.status,
    winnerId: judged.winnerId,
    confidence: judged.confidence,
    evidenceQuality: judged.evidenceQuality,
    recommendation: judged.recommendation,
    settlementRecommendation: judged.settlementRecommendation,
    source: judged.source,
    model: judged.model,
    dataSourceTrace: judged.dataSourceTrace,
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

  requireCheck(proof, "created_waiting_for_opponent", created.challenge.status === "waiting_for_opponent", proof.challenge);
  requireCheck(proof, "created_with_public_oracle_protocol", created.challenge.protocolVersion === "2.0" && created.challenge.evidenceMode === "public_oracle" && created.challenge.settlementProtocolMode === "auto_oracle", proof.challenge);
  requireCheck(proof, "opponent_accepted_evidence_window_open", accepted.challenge.status === "evidence_window_open", proof.accept);
  requireCheck(proof, "both_oracle_lock_evidence_submitted", beforeJudge.challenge.evidence.length === 2 && beforeJudge.challenge.status === "ai_reviewing", proof.beforeJudge);
  requireCheck(proof, "judge_used_oracle_source", judged.source === "oracle", proof.judgment);
  requireCheck(proof, "judge_used_live_data_source_router", judged.dataSourceTrace?.sourceKey === "npm_registry_package" && judged.dataSourceTrace?.status === "live" && judged.dataSourceTrace?.httpStatus === 200, proof.judgment.dataSourceTrace);
  requireCheck(proof, "judge_valid_winner", judged.winnerId === creator.session.user.id, proof.judgment);
  requireCheck(proof, "judge_high_confidence", judged.confidence >= 0.85, proof.judgment);
  requireCheck(proof, "judge_settle_recommendation", judged.settlementRecommendation === "settle_winner", proof.judgment);
  requireCheck(proof, "challenge_settled", finalChallenge.challenge.status === "settled", proof.finalChallenge);
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
