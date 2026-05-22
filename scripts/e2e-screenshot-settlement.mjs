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
    password: "TestPass123!screenshot",
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
  if (!passed) throw new Error(`Screenshot settlement E2E failed: ${name}`);
}

function screenshotProtocol({ stamp, expectedAnswer, title, rawPrompt, winCondition }) {
  return {
    version: "2.0",
    title: `${title} ${stamp}`,
    userFacingSummary: "Two participants submit screenshot proof. The participant whose screenshot metadata matches the expected result wins.",
    rawPrompt,
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "completion",
    evidenceProtocol: {
      mode: "screenshot",
      requiredEvidence: [
        `Screenshot proof with visible score/result. EXPECTED_ANSWER: ${expectedAnswer}`,
      ],
      captureInstructions: [
        "Submit one screenshot proof row after the attempt.",
        "The screenshot should show the result, timestamp or session context, and player identity where possible.",
      ],
      invalidEvidenceRules: [
        "Missing result text.",
        "Edited, cropped, reused, or unclear screenshots require review.",
      ],
      requiredMetadata: ["answer", "screenshotFixture"],
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
      endCondition: "Both participants submit screenshot proof.",
      deadline: "2 hours",
      tieBreaker: "If both or neither match the expected result, no automatic winner.",
      allowedAttempts: "1",
    },
    settlementProtocol: {
      mode: "auto_ai_text",
      winCondition: `${winCondition} EXPECTED_ANSWER: ${expectedAnswer}. Exactly one matching screenshot result wins.`,
      judgeInstructions: [
        "Read the submitted result from evidence metadata or screenshot description.",
        `Expected result token: ${expectedAnswer}`,
        "Return settle_winner only when exactly one participant matches the expected screenshot result.",
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Both participants match.", "Neither participant matches.", "Screenshot result is missing."],
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

function fixtureScreenshotUrl(label, answer) {
  const text = encodeURIComponent(`${label} ${answer}`.slice(0, 120));
  return `https://dummyimage.com/960x540/f8fafc/172033.png&text=${text}`;
}

async function runCase({ caseId, title, rawPrompt, winCondition }) {
  const stamp = `${caseId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const expectedAnswer = `SCREENSHOT-WIN-${stamp}`;
  const wrongAnswer = `SCREENSHOT-LOSE-${stamp}`;
  const proof = { caseId, base, commitSha: currentCommitSha(), stamp, checks: {} };

  const creator = await register(`codex.${caseId}.creator.${stamp}@example.com`, `shot_creator_${stamp.slice(-6)}`);
  const opponent = await register(`codex.${caseId}.opponent.${stamp}@example.com`, `shot_opp_${stamp.slice(-6)}`);
  const beforeCreator = await getJson(creator.jar, "/api/credits");
  const beforeOpponent = await getJson(opponent.jar, "/api/credits");

  const created = await postJson(creator.jar, "/api/challenges", {
    protocol: screenshotProtocol({ stamp, expectedAnswer, title, rawPrompt, winCondition }),
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
    type: "screenshot",
    url: fixtureScreenshotUrl("creator screenshot result", expectedAnswer),
    description: `Screenshot result. ANSWER: ${expectedAnswer}`,
    metadata: { answer: expectedAnswer, screenshotFixture: true, caseId, fileSizeBytes: 4096 },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "screenshot",
    url: fixtureScreenshotUrl("opponent screenshot result", wrongAnswer),
    description: `Screenshot result. ANSWER: ${wrongAnswer}`,
    metadata: { answer: wrongAnswer, screenshotFixture: true, caseId, fileSizeBytes: 4096 },
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
  requireCheck(proof, "both_screenshot_evidence_submitted", finalChallenge.challenge.evidence.length === 2, proof.finalChallenge);
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

  return proof;
}

const cases = [
  {
    caseId: "typing",
    title: "Typing race screenshot",
    rawPrompt: "Challenge a friend on who can type a 100-word paragraph faster with screenshot proof.",
    winCondition: "The screenshot result with the expected fastest-time token wins.",
  },
  {
    caseId: "game-score",
    title: "Game score screenshot",
    rawPrompt: "I want to challenge someone on who gets the higher score in one game round using screenshot evidence.",
    winCondition: "The screenshot result with the expected higher-score token wins.",
  },
];

const result = { base, commitSha: currentCommitSha(), checks: {}, cases: [] };

try {
  for (const scenario of cases) {
    const proof = await runCase(scenario);
    result.cases.push(proof);
    result.checks[`${scenario.caseId}_settled`] = {
      passed: proof.finalChallenge.status === "settled",
      detail: proof.finalChallenge,
    };
  }
  result.screenshotSettled = true;
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result.error = { message: error?.message, status: error?.status, data: error?.data };
  result.screenshotSettled = false;
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}
