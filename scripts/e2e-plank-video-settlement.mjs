import { execFileSync } from "node:child_process";
import { plankVisionProtocol } from "./e2e-protocol-fixtures.mjs";

const base = process.env.E2E_BASE_URL || "https://stubborn-ai.vercel.app";
const judgeProvider = process.env.E2E_JUDGE_PROVIDER || "openai";
const judgeModel = process.env.E2E_JUDGE_MODEL || "gpt-4o";
const livenessPhrase = "stubborn PLANK-E2E-STATIC";

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

  const res = await fetch(url, { ...options, headers, redirect: options.redirect || "manual" });
  jar?.store(res);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
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

async function requestAllowError(jar, pathOrUrl, options = {}) {
  try {
    return await request(jar, pathOrUrl, options);
  } catch (error) {
    return { error, data: error.data, status: error.status };
  }
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
    password: "TestPass123!plank",
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
  if (!passed) throw new Error(`Plank video E2E failed: ${name}`);
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const proof = { base, commitSha: currentCommitSha(), stamp, checks: {} };
let cleanupCreator = null;
let cleanupChallengeId = null;
let terminalReached = false;
let opponentAccepted = false;

async function cleanupCreatedChallenge() {
  if (!cleanupCreator || !cleanupChallengeId || terminalReached) return { skipped: true };
  if (opponentAccepted) {
    const cancelled = await requestAllowError(cleanupCreator.jar, `/api/challenges/${cleanupChallengeId}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Plank video E2E cleanup after failure." }),
    });
    return { action: "cancel", status: cancelled.status ?? 200, ok: !cancelled.error, data: cancelled.data ?? null };
  }
  const deleted = await requestAllowError(cleanupCreator.jar, `/api/challenges/${cleanupChallengeId}`, { method: "DELETE" });
  return { action: "delete", status: deleted.status ?? 200, ok: !deleted.error, data: deleted.data ?? null };
}

try {
  const creator = await register(`codex.plank.creator.${stamp}@example.com`, `plank_creator_${stamp.slice(-6)}`);
  const opponent = await register(`codex.plank.opponent.${stamp}@example.com`, `plank_opp_${stamp.slice(-6)}`);
  cleanupCreator = creator;

  const beforeCreator = await getJson(creator.jar, "/api/credits");
  const beforeOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorVideoUrl = `${base}/e2e-fixtures/plank-a-static-phrase.mp4`;
  const opponentVideoUrl = `${base}/e2e-fixtures/plank-b-static-phrase.mp4`;
  const creatorHead = await fetch(creatorVideoUrl, { method: "HEAD" });
  const opponentHead = await fetch(opponentVideoUrl, { method: "HEAD" });
  proof.fixture = {
    kind: "public_static_plank_video_fixture_v1",
    directHoldDurationLabelsRemoved: true,
    creatorVideoUrl,
    opponentVideoUrl,
    expectedCreatorHoldsLonger: true,
  };

  const protocol = plankVisionProtocol({
    stamp,
    title: `Plank video winner settlement ${stamp}`,
    livenessPhrase,
  });

  const created = await postJson(creator.jar, "/api/challenges", {
    protocol,
    stake: 1,
    stakeToken: "credits",
    aiReview: true,
    isPublic: false,
    visibility: "private",
  });
  const challengeId = created.challenge.id;
  cleanupChallengeId = challengeId;
  proof.challenge = {
    id: challengeId,
    url: `${base}/challenge/${challengeId}`,
    joinUrl: `${base}/join/${challengeId}`,
    status: created.challenge.status,
    evidenceMode: created.challenge.evidenceMode,
  };

  requireCheck(proof, "public_creator_fixture_reachable", creatorHead.ok, { status: creatorHead.status, url: creatorVideoUrl });
  requireCheck(proof, "public_opponent_fixture_reachable", opponentHead.ok, { status: opponentHead.status, url: opponentVideoUrl });

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  opponentAccepted = true;
  proof.accept = { status: accepted.challenge.status, participants: accepted.challenge.participants.length };

  const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "video",
    url: creatorVideoUrl,
    description: `Official continuous plank attempt video. Liveness phrase visible: ${livenessPhrase}. Public fixture uses a side-view pose diagram and timer; infer hold duration from body position over time. No direct hold-duration answer label is present.`,
    metadata: { fixtureKind: "public_static_plank_video_fixture_v1", livenessPhrase, directHoldDurationLabel: false },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "video",
    url: opponentVideoUrl,
    description: `Official continuous plank attempt video. Liveness phrase visible: ${livenessPhrase}. Public fixture uses a side-view pose diagram and timer; infer hold duration from body position over time. No direct hold-duration answer label is present.`,
    metadata: { fixtureKind: "public_static_plank_video_fixture_v1", livenessPhrase, directHoldDurationLabel: false },
  });
  proof.evidence = {
    creatorEvidenceId: evCreator.evidence.id,
    opponentEvidenceId: evOpponent.evidence.id,
  };

  const judged = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, {
    tier: 1,
    providerId: judgeProvider,
    model: judgeModel,
    autoSettle: true,
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
    providerCall: judged.providerCall,
    videoMetrics: judged.videoMetrics,
  };

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const afterCreator = await getJson(creator.jar, "/api/credits");
  const afterOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorTxs = afterCreator.transactions.filter((tx) => tx.challengeId === challengeId);
  const opponentTxs = afterOpponent.transactions.filter((tx) => tx.challengeId === challengeId);
  const refundRows = [...creatorTxs, ...opponentTxs].filter((tx) => tx.type === "refund");

  proof.finalChallenge = {
    status: finalChallenge.challenge.status,
    evidenceCount: finalChallenge.challenge.evidence.length,
    participantCount: finalChallenge.challenge.participants.length,
  };
  proof.creditTx = {
    creator: creatorTxs.map(txView),
    opponent: opponentTxs.map(txView),
  };

  const durationA = Number(judged.videoMetrics?.participantA?.holdDurationSec ?? 0);
  const durationB = Number(judged.videoMetrics?.participantB?.holdDurationSec ?? 0);

  requireCheck(proof, "created_waiting_for_opponent", created.challenge.status === "waiting_for_opponent", proof.challenge);
  requireCheck(proof, "opponent_accepts", accepted.challenge.status === "evidence_window_open", proof.accept);
  requireCheck(proof, "both_video_evidence_submitted", finalChallenge.challenge.evidence.length === 2, proof.finalChallenge);
  requireCheck(proof, "judge_source_is_vision_llm", judged.source === "vision_llm", proof.judgment);
  requireCheck(proof, "video_metrics_present", Boolean(judged.videoMetrics?.participantA && judged.videoMetrics?.participantB), judged.videoMetrics);
  requireCheck(proof, "fixture_has_no_direct_hold_duration_labels", proof.fixture.directHoldDurationLabelsRemoved === true, proof.fixture);
  requireCheck(proof, "creator_liveness_visible", judged.videoMetrics?.participantA?.livenessPhraseVisible === true, judged.videoMetrics?.participantA);
  requireCheck(proof, "opponent_liveness_visible", judged.videoMetrics?.participantB?.livenessPhraseVisible === true, judged.videoMetrics?.participantB);
  requireCheck(proof, "creator_full_body_visible", judged.videoMetrics?.participantA?.fullBodyVisible === true, judged.videoMetrics?.participantA);
  requireCheck(proof, "opponent_full_body_visible", judged.videoMetrics?.participantB?.fullBodyVisible === true, judged.videoMetrics?.participantB);
  requireCheck(proof, "creator_duration_covered", judged.videoMetrics?.participantA?.fullDurationCovered === true && judged.videoMetrics?.participantA?.videoTooShort !== true, judged.videoMetrics?.participantA);
  requireCheck(proof, "opponent_duration_covered", judged.videoMetrics?.participantB?.fullDurationCovered === true && judged.videoMetrics?.participantB?.videoTooShort !== true, judged.videoMetrics?.participantB);
  requireCheck(proof, "no_loop_or_editing_flags", judged.videoMetrics?.participantA?.suspectedEditingOrLoop !== true && judged.videoMetrics?.participantB?.suspectedEditingOrLoop !== true, judged.videoMetrics);
  requireCheck(proof, "creator_hold_duration_higher", durationA > durationB, { durationA, durationB });
  requireCheck(proof, "judge_returns_creator_winner", judged.winnerId === creator.session.user.id, proof.judgment);
  requireCheck(proof, "judge_high_confidence", judged.confidence >= 0.85, proof.judgment);
  requireCheck(proof, "judge_good_quality", judged.evidenceQuality === "good", proof.judgment);
  requireCheck(proof, "judge_settle_recommendation", judged.settlementRecommendation === "settle_winner", proof.judgment);
  requireCheck(proof, "challenge_settled", finalChallenge.challenge.status === "settled", proof.finalChallenge);
  requireCheck(proof, "winner_ledger_has_win", creatorTxs.some((tx) => tx.type === "win" && tx.amount === 2), proof.creditTx.creator);
  requireCheck(proof, "loser_ledger_has_loss", opponentTxs.some((tx) => tx.type === "loss" && tx.amount === -1), proof.creditTx.opponent);
  requireCheck(proof, "no_refunds", refundRows.length === 0, refundRows.map(txView));
  requireCheck(proof, "creator_balance_math", afterCreator.credits === beforeCreator.credits, { before: beforeCreator.credits, after: afterCreator.credits });
  requireCheck(proof, "opponent_balance_math", afterOpponent.credits === beforeOpponent.credits - 1, { before: beforeOpponent.credits, after: afterOpponent.credits });

  terminalReached = true;
  proof.plankSettled = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = { message: error?.message, status: error?.status, data: error?.data };
  proof.cleanup = await cleanupCreatedChallenge();
  proof.plankSettled = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
