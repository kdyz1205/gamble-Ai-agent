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
    password: "TestPass123!solo",
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
  if (!passed) throw new Error(`Solo E2E check failed: ${name}`);
}

function soloProtocol(stamp, expectedAnswer) {
  return {
    version: "2.0",
    title: `Solo proof objective ${stamp}`,
    userFacingSummary: "Creator proves a solo claim. No opponent is required.",
    rawPrompt: `I bet my cat can finish the food under one minute ${stamp}`,
    language: "en",
    participantMode: "solo",
    outcomeType: "threshold",
    evidenceProtocol: {
      mode: "platform_metric",
      requiredEvidence: [`Submit text evidence containing ANSWER: <value>. EXPECTED_ANSWER: ${expectedAnswer}`],
      captureInstructions: ["Submit one proof row before judging."],
      invalidEvidenceRules: ["Missing answer text is invalid."],
      requiredMetadata: ["answer"],
    },
    identityProtocol: {
      mode: "account_only",
      required: false,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false },
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
      startCondition: "Challenge starts when the creator publishes it.",
      endCondition: "Creator submits proof.",
      deadline: "2 hours",
      tieBreaker: "No tie-breaker; this is pass/fail.",
      allowedAttempts: "1",
    },
    settlementProtocol: {
      mode: "auto_ai_text",
      winCondition: `EXPECTED_ANSWER: ${expectedAnswer}. If the creator submits the expected answer, the solo claim passes.`,
      judgeInstructions: [
        "Read the creator answer from evidence metadata or text.",
        `Correct answer: ${expectedAnswer}`,
        "Return settle_winner only when the creator matches the expected answer.",
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Answer text is missing.", "Answer does not match."],
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
const expectedAnswer = `SOLO-${stamp}`;
const proof = { base, stamp, checks: {} };

try {
  const creatorEmail = `codex.solo.${stamp}@example.com`;
  const creator = await register(creatorEmail, `codex_solo_${stamp.slice(-6)}`);
  const protocol = soloProtocol(stamp, expectedAnswer);

  const created = await postJson(creator.jar, "/api/challenges", {
    protocol,
    stake: 0,
    stakeToken: "credits",
    aiReview: true,
    isPublic: false,
    visibility: "private",
  });
  const challengeId = created.challenge.id;
  proof.challenge = {
    id: challengeId,
    url: `${base}/challenge/${challengeId}`,
    createdStatus: created.challenge.status,
    participantMode: created.challenge.participantMode,
    participants: created.challenge.participants.length,
  };

  requireCheck(proof, "created_as_solo", created.challenge.participantMode === "solo", proof.challenge);
  requireCheck(proof, "solo_skips_waiting_for_opponent", created.challenge.status === "evidence_window_open", proof.challenge);
  requireCheck(proof, "only_creator_participant", created.challenge.participants.length === 1, proof.challenge);

  const ev = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `ANSWER: ${expectedAnswer}`,
    metadata: { answer: expectedAnswer, soloE2E: true },
  });
  proof.evidence = { id: ev.evidence.id };

  const beforeJudge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.beforeJudge = {
    status: beforeJudge.challenge.status,
    evidenceCount: beforeJudge.challenge.evidence.length,
    participantCount: beforeJudge.challenge.participants.length,
  };
  requireCheck(proof, "solo_evidence_moves_to_ai_reviewing", beforeJudge.challenge.status === "ai_reviewing", proof.beforeJudge);

  const judged = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, { tier: 1, autoSettle: true });
  proof.judgment = {
    id: judged.judgment.id,
    status: judged.status,
    winnerId: judged.winnerId,
    confidence: judged.confidence,
    evidenceQuality: judged.evidenceQuality,
    recommendation: judged.recommendation,
    settlement: judged.settlement,
  };
  requireCheck(proof, "solo_judge_has_creator_winner", judged.winnerId === creator.session.user.id, proof.judgment);
  requireCheck(proof, "solo_judge_high_confidence", judged.confidence >= 0.85, proof.judgment);
  requireCheck(proof, "solo_judge_settle_recommendation", judged.recommendation === "settle_winner", proof.judgment);

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.finalChallenge = {
    status: finalChallenge.challenge.status,
    judgments: finalChallenge.challenge.judgments?.length ?? 0,
    participants: finalChallenge.challenge.participants.length,
  };
  requireCheck(proof, "solo_final_settled", finalChallenge.challenge.status === "settled", proof.finalChallenge);
  requireCheck(proof, "solo_never_added_opponent", finalChallenge.challenge.participants.length === 1, proof.finalChallenge);

  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = { message: error?.message, status: error?.status, data: error?.data };
  console.error(JSON.stringify(proof, null, 2));
  process.exit(1);
}
