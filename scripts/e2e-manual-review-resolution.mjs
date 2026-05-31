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

async function requestAllowingError(jar, path, options = {}) {
  try {
    const out = await request(jar, path, options);
    return { ok: true, status: out.res.status, data: out.data };
  } catch (error) {
    return { ok: false, status: error.status, data: error.data, message: error.message };
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
    password: "TestPass123!manual",
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

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const expectedAnswer = `CREATOR-${stamp}`;
const wrongAnswer = `OPPONENT-${stamp}`;
const proof = {
  base,
  stamp,
  checks: {},
};

try {
  const creatorEmail = `codex.manual.creator.${stamp}@example.com`;
  const opponentEmail = `codex.manual.opponent.${stamp}@example.com`;
  const creator = await register(creatorEmail, `man_creator_${stamp.slice(-6)}`);
  const opponent = await register(opponentEmail, `man_opp_${stamp.slice(-6)}`);

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

  const created = await postJson(creator.jar, "/api/challenges", {
    title: `Manual review settlement ${stamp}`,
    description: "E2E for disputed AI verdict resolved by audited manual review.",
    marketType: "challenge",
    proposition: "AI first picks creator, then manual review overrides to opponent.",
    type: "Learning",
    stake: 1,
    stakeToken: "credits",
    deadline: "2 hours",
    rules: `Objective text answer challenge.\nEXPECTED_ANSWER: ${expectedAnswer}\nIf exactly one participant submits the expected answer, that participant wins.`,
    evidenceType: "text",
    settlementMode: "ai_review_then_creator_confirm",
    aiReview: true,
    isPublic: false,
    visibility: "private",
  });
  const challengeId = created.challenge.id;
  proof.challenge = {
    id: challengeId,
    url: `${base}/challenge/${challengeId}`,
    createdStatus: created.challenge.status,
  };

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  proof.accept = {
    status: accepted.challenge.status,
    participants: accepted.challenge.participants.length,
  };

  const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `ANSWER: ${expectedAnswer}`,
    metadata: { answer: expectedAnswer, manualReviewE2E: true },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "text",
    description: `ANSWER: ${wrongAnswer}`,
    metadata: { answer: wrongAnswer, manualReviewE2E: true },
  });
  proof.evidence = {
    creatorEvidenceId: evCreator.evidence.id,
    opponentEvidenceId: evOpponent.evidence.id,
  };

  const judged = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, { tier: 1 });
  proof.aiJudgment = {
    id: judged.judgment.id,
    status: judged.status,
    winnerId: judged.winnerId,
    confidence: judged.confidence,
    evidenceQuality: judged.evidenceQuality,
    settlementRecommendation: judged.settlementRecommendation,
    source: judged.source,
    model: judged.model,
  };

  const disputed = await postJson(opponent.jar, `/api/challenges/${challengeId}/dispute`, {
    reason: "Opponent disputes the AI verdict and requests manual review.",
  });
  proof.dispute = {
    status: disputed.challenge.status,
    latestJudgmentId: disputed.review.latestJudgmentId,
  };

  const creatorQueue = await getJson(creator.jar, "/api/manual-review/queue?limit=20");
  const opponentQueue = await getJson(opponent.jar, "/api/manual-review/queue?limit=20");
  const creatorQueueItem = creatorQueue.items?.find((item) => item.challengeId === challengeId);
  const opponentQueueItem = opponentQueue.items?.find((item) => item.challengeId === challengeId);
  proof.manualQueue = {
    creatorCount: creatorQueue.count,
    opponentCount: opponentQueue.count,
    creatorItem: creatorQueueItem
      ? {
          challengeId: creatorQueueItem.challengeId,
          status: creatorQueueItem.status,
          canResolve: creatorQueueItem.canResolve,
          evidenceCount: creatorQueueItem.evidenceCount,
          judgmentCount: creatorQueueItem.judgmentCount,
          participantCount: creatorQueueItem.participantCount,
          latestJudgmentId: creatorQueueItem.latestJudgment?.id ?? null,
          stake: creatorQueueItem.stake,
          stakeToken: creatorQueueItem.stakeToken,
        }
      : null,
    opponentItem: opponentQueueItem
      ? {
          challengeId: opponentQueueItem.challengeId,
          status: opponentQueueItem.status,
          canResolve: opponentQueueItem.canResolve,
        }
      : null,
  };

  const resolved = await postJson(creator.jar, `/api/challenges/${challengeId}/manual-resolve`, {
    outcome: "winner",
    winnerId: opponent.session.user.id,
    reason: "Manual review accepted opponent as winner for E2E proof.",
  });

  const duplicateResolve = await postJsonAllowingError(creator.jar, `/api/challenges/${challengeId}/manual-resolve`, {
    outcome: "winner",
    winnerId: opponent.session.user.id,
    reason: "Duplicate manual resolution should be rejected.",
  });

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const creatorQueueAfterResolve = await getJson(creator.jar, "/api/manual-review/queue?limit=20");
  const creatorQueueAfterItem = creatorQueueAfterResolve.items?.find((item) => item.challengeId === challengeId);
  const afterCreator = await getJson(creator.jar, "/api/credits");
  const afterOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorTxs = afterCreator.transactions.filter((tx) => tx.challengeId === challengeId);
  const opponentTxs = afterOpponent.transactions.filter((tx) => tx.challengeId === challengeId);
  const creatorStakeRow = creatorTxs.find((tx) => tx.type === "stake" && tx.amount === -1);
  const judgeSpendRow = creatorTxs.find((tx) => tx.type === "ai_judge" && tx.amount === -1);
  const loserLossRow = creatorTxs.find((tx) => tx.type === "loss" && tx.amount === -1);
  const winnerStakeRow = opponentTxs.find((tx) => tx.type === "stake" && tx.amount === -1);
  const winnerWinRow = opponentTxs.find((tx) => tx.type === "win" && tx.amount === 2);
  const refundRows = [...creatorTxs, ...opponentTxs].filter((tx) => tx.type === "refund");
  const latestJudgment = finalChallenge.challenge.judgments?.[0] ?? null;

  proof.manualResolve = {
    finalStatusFromResolve: resolved.challenge.status,
    manualJudgmentId: resolved.judgment.id,
    manualWinnerId: resolved.manualReview.winnerId,
    settlement: resolved.settlement,
    duplicateStatus: duplicateResolve.status,
    duplicateError: duplicateResolve.data?.error ?? duplicateResolve.message,
  };
  proof.finalChallenge = {
    status: finalChallenge.challenge.status,
    latestJudgmentId: latestJudgment?.id ?? null,
    latestJudgmentMethod: latestJudgment?.method ?? null,
    latestJudgmentWinnerId: latestJudgment?.winnerId ?? null,
    judgmentCount: finalChallenge.challenge.judgments?.length ?? 0,
    evidenceCount: finalChallenge.challenge.evidence?.length ?? 0,
  };
  proof.manualQueueAfterResolve = {
    count: creatorQueueAfterResolve.count,
    challengeStillQueued: Boolean(creatorQueueAfterItem),
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
  requireCheck(proof, "opponent_accepted_evidence_window_open", accepted.challenge.status === "evidence_window_open", accepted.challenge.status);
  requireCheck(proof, "both_evidence_submitted", finalChallenge.challenge.evidence.length === 2, finalChallenge.challenge.evidence.length);
  requireCheck(proof, "ai_judgment_created", Boolean(judged.judgment.id), proof.aiJudgment);
  requireCheck(proof, "dispute_reaches_disputed", disputed.challenge.status === "disputed", proof.dispute);
  requireCheck(proof, "creator_queue_contains_review_item", Boolean(creatorQueueItem), proof.manualQueue);
  requireCheck(proof, "creator_queue_can_resolve", creatorQueueItem?.canResolve === true, proof.manualQueue);
  requireCheck(proof, "opponent_queue_read_only", opponentQueueItem?.canResolve === false, proof.manualQueue);
  requireCheck(proof, "queue_item_has_counts", creatorQueueItem?.evidenceCount === 2 && creatorQueueItem?.judgmentCount >= 1 && creatorQueueItem?.participantCount === 2, proof.manualQueue);
  requireCheck(proof, "manual_final_settled", finalChallenge.challenge.status === "settled", proof.finalChallenge);
  requireCheck(proof, "latest_judgment_manual", latestJudgment?.method === "manual", proof.finalChallenge);
  requireCheck(proof, "manual_winner_is_opponent", latestJudgment?.winnerId === opponent.session.user.id, proof.finalChallenge);
  requireCheck(proof, "winner_win_row", Boolean(winnerWinRow), proof.creditTx.opponent);
  requireCheck(proof, "winner_stake_row", Boolean(winnerStakeRow), proof.creditTx.opponent);
  requireCheck(proof, "loser_stake_row", Boolean(creatorStakeRow), proof.creditTx.creator);
  requireCheck(proof, "judge_spend_row", Boolean(judgeSpendRow), proof.creditTx.creator);
  requireCheck(proof, "loser_loss_row", Boolean(loserLossRow), proof.creditTx.creator);
  requireCheck(proof, "no_refund_rows", refundRows.length === 0, refundRows.map(txView));
  requireCheck(proof, "duplicate_manual_resolve_rejected", duplicateResolve.status === 409, proof.manualResolve);
  requireCheck(proof, "resolved_item_leaves_manual_queue", !creatorQueueAfterItem, proof.manualQueueAfterResolve);
  requireCheck(proof, "winner_balance_math", afterOpponent.credits === beforeOpponent.credits + 1, {
    before: beforeOpponent.credits,
    after: afterOpponent.credits,
    note: "opponent paid stake -1, then received win +2",
  });
  requireCheck(proof, "loser_balance_math", afterCreator.credits === beforeCreator.credits - 2, {
    before: beforeCreator.credits,
    after: afterCreator.credits,
    note: "creator paid stake -1 and judge -1; loss row is ledger-only because stake was already escrowed",
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
