import { execFileSync } from "node:child_process";

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
  const res = await fetch(url, { ...options, headers, redirect: options.redirect || "manual" });
  jar?.store(res);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    return request(jar, new URL(res.headers.get("location"), url).href, { method: "GET" });
  }
  if (!res.ok) {
    const err = new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { res, data };
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
    password: "TestPass123!study",
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
  if (!passed) throw new Error(`Study streak E2E failed: ${name}`);
}

function studyProtocol(stamp, expectedAnswer) {
  return {
    version: "2.0",
    title: `Study streak fixture ${stamp}`,
    userFacingSummary: "Two participants submit structured study streak proof. The verified streak token wins.",
    rawPrompt: "Make a 3-day study streak challenge where both people submit daily proof.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "completion",
    evidenceProtocol: {
      mode: "platform_metric",
      requiredEvidence: [
        `Structured study proof with daysCompleted and ANSWER. EXPECTED_ANSWER: ${expectedAnswer}`,
      ],
      captureInstructions: [
        "Submit one structured proof row after the study window.",
        "Include days completed, session minutes, and the study proof token.",
      ],
      invalidEvidenceRules: [
        "Missing days completed.",
        "Missing proof token.",
        "Conflicting or duplicated proof requires review.",
      ],
      requiredMetadata: ["daysCompleted", "minutesStudied", "answer"],
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
      endCondition: "Both participants submit the final structured proof.",
      deadline: "3 days",
      tieBreaker: "If both complete the same streak, no automatic winner.",
      allowedAttempts: "1 final proof submission",
    },
    settlementProtocol: {
      mode: "auto_ai_text",
      winCondition: `The participant with the expected verified streak token wins. EXPECTED_ANSWER: ${expectedAnswer}`,
      judgeInstructions: [
        "Read study streak result from evidence metadata or text.",
        `Expected verified streak token: ${expectedAnswer}`,
        "Return settle_winner only when exactly one participant matches the expected token.",
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Both or neither participants match.", "Study proof metadata is missing."],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: ["Internal credits only."],
      restrictions: ["No real-money gambling."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 250,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const expectedAnswer = `STUDY-WIN-${stamp}`;
const wrongAnswer = `STUDY-LOSE-${stamp}`;
const proof = { base, commitSha: currentCommitSha(), stamp, checks: {} };

try {
  const creator = await register(`codex.study.creator.${stamp}@example.com`, `study_creator_${stamp.slice(-6)}`);
  const opponent = await register(`codex.study.opponent.${stamp}@example.com`, `study_opp_${stamp.slice(-6)}`);
  const beforeCreator = await getJson(creator.jar, "/api/credits");
  const beforeOpponent = await getJson(opponent.jar, "/api/credits");

  const created = await postJson(creator.jar, "/api/challenges", {
    protocol: studyProtocol(stamp, expectedAnswer),
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
    status: created.challenge.status,
    evidenceMode: created.challenge.evidenceMode,
  };

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  proof.accept = { status: accepted.challenge.status, participants: accepted.challenge.participants.length };

  const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `Study streak proof. ANSWER: ${expectedAnswer}`,
    metadata: { answer: expectedAnswer, daysCompleted: 3, minutesStudied: 180, studyFixture: true },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `Study streak proof. ANSWER: ${wrongAnswer}`,
    metadata: { answer: wrongAnswer, daysCompleted: 2, minutesStudied: 80, studyFixture: true },
  });
  proof.evidence = {
    creatorEvidenceId: evCreator.evidence.id,
    opponentEvidenceId: evOpponent.evidence.id,
  };

  const judged = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, { tier: 1 });
  proof.judgment = {
    id: judged.judgment.id,
    status: judged.status,
    winnerId: judged.winnerId,
    confidence: judged.confidence,
    evidenceQuality: judged.evidenceQuality,
    recommendation: judged.recommendation,
    settlementRecommendation: judged.settlementRecommendation,
  };

  const confirmed = await postJson(creator.jar, `/api/challenges/${challengeId}/confirm-verdict`, {});
  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const afterCreator = await getJson(creator.jar, "/api/credits");
  const afterOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorTxs = afterCreator.transactions.filter((tx) => tx.challengeId === challengeId);
  const opponentTxs = afterOpponent.transactions.filter((tx) => tx.challengeId === challengeId);
  const refundRows = [...creatorTxs, ...opponentTxs].filter((tx) => tx.type === "refund");

  proof.confirm = {
    finalStatusFromConfirm: confirmed.challenge.status,
    settlement: confirmed.settlement,
  };
  proof.finalChallenge = {
    status: finalChallenge.challenge.status,
    evidenceCount: finalChallenge.challenge.evidence.length,
    participantCount: finalChallenge.challenge.participants.length,
  };
  proof.creditTx = {
    creator: creatorTxs.map(txView),
    opponent: opponentTxs.map(txView),
  };

  requireCheck(proof, "created_waiting_for_opponent", created.challenge.status === "waiting_for_opponent", proof.challenge);
  requireCheck(proof, "opponent_accepts", accepted.challenge.status === "evidence_window_open", proof.accept);
  requireCheck(proof, "both_study_evidence_submitted", finalChallenge.challenge.evidence.length === 2, proof.finalChallenge);
  requireCheck(proof, "judge_returns_winner", judged.winnerId === creator.session.user.id, proof.judgment);
  requireCheck(proof, "judge_high_confidence", judged.confidence >= 0.85, proof.judgment);
  requireCheck(proof, "judge_recommends_settlement", judged.settlementRecommendation === "settle_winner", proof.judgment);
  requireCheck(proof, "challenge_settled", finalChallenge.challenge.status === "settled", proof.finalChallenge);
  requireCheck(proof, "winner_ledger_has_win", creatorTxs.some((tx) => tx.type === "win" && tx.amount === 2), proof.creditTx.creator);
  requireCheck(proof, "loser_ledger_has_loss", opponentTxs.some((tx) => tx.type === "loss" && tx.amount === -1), proof.creditTx.opponent);
  requireCheck(proof, "no_refunds", refundRows.length === 0, refundRows.map(txView));
  requireCheck(proof, "creator_balance_math", afterCreator.credits === beforeCreator.credits, {
    before: beforeCreator.credits,
    after: afterCreator.credits,
  });
  requireCheck(proof, "opponent_balance_math", afterOpponent.credits === beforeOpponent.credits - 1, {
    before: beforeOpponent.credits,
    after: afterOpponent.credits,
  });

  proof.studySettled = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = { message: error?.message, status: error?.status, data: error?.data };
  proof.studySettled = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
