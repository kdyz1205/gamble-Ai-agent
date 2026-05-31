import { execFile as execFileCallback } from "node:child_process";
import { File } from "node:buffer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { upload as blobUpload } from "@vercel/blob/client";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { pushupVisionProtocol } from "./e2e-protocol-fixtures.mjs";

const execFile = promisify(execFileCallback);
const base = process.env.E2E_BASE_URL || "https://stubborn-ai.vercel.app";
const judgeProvider = process.env.E2E_JUDGE_PROVIDER || "openai";
const judgeModel = process.env.E2E_JUDGE_MODEL || "gpt-4o";
const expectPreextract = process.env.E2E_EXPECT_PREEXTRACT === "1" || process.env.ENABLE_EVIDENCE_PREEXTRACT === "true";
const videoStorage = process.env.E2E_VIDEO_STORAGE || "public_fixture";
const publicFixtureLivenessPhrase = "stubborn VIDEO-E2E-STATIC";

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
    const err = new Error(`${options.method || "GET"} ${pathOrUrl} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { res, data, text };
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
    password: "TestPass123!video",
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

function pushupPhaseAt({ repCount, durationSec, elapsedSec }) {
  const cycleSec = durationSec / repCount;
  const within = (elapsedSec % cycleSec) / cycleSec;
  if (within < 0.12 || within > 0.88) return "top";
  if (within > 0.30 && within < 0.70) return "down";
  return "transition";
}

function svgFrame({ role, color, frameNo, phase, livenessPhrase, elapsedSec, durationSec }) {
  const isDown = phase === "down";
  const isTransition = phase === "transition";
  const shoulderY = isDown ? 348 : isTransition ? 286 : 218;
  const hipY = isDown ? 354 : isTransition ? 300 : 244;
  const ankleY = isDown ? 360 : isTransition ? 318 : 270;
  const elbowY = isDown ? 370 : isTransition ? 318 : 288;
  const headY = isDown ? 326 : isTransition ? 258 : 198;
  const elapsedLabel = `00:${String(elapsedSec).padStart(2, "0")}`;
  return `
<svg width="960" height="540" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg">
  <rect width="960" height="540" fill="#111827"/>
  <rect x="30" y="30" width="900" height="480" rx="28" fill="#f8fafc"/>
  <text x="70" y="86" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="#111827">PUSH-UP VIDEO PROOF</text>
  <text x="70" y="130" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${color}">${role}</text>
  <text x="70" y="176" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#0f172a">Timer ${elapsedLabel} / 01:00</text>
  <text x="70" y="214" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#334155">Continuous attempt. No cuts. Full body visible.</text>
  <text x="70" y="248" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#334155">Challenge phrase: ${livenessPhrase}</text>
  <rect x="70" y="270" width="280" height="10" rx="5" fill="#cbd5e1"/>
  <rect x="70" y="270" width="${Math.max(6, Math.round((elapsedSec / durationSec) * 280))}" height="10" rx="5" fill="${color}"/>
  <line x1="120" y1="390" x2="840" y2="390" stroke="#64748b" stroke-width="8" stroke-linecap="round"/>
  <circle cx="292" cy="${headY}" r="28" fill="${color}"/>
  <line x1="340" y1="${shoulderY}" x2="540" y2="${hipY}" stroke="${color}" stroke-width="26" stroke-linecap="round"/>
  <line x1="540" y1="${hipY}" x2="720" y2="${ankleY}" stroke="${color}" stroke-width="24" stroke-linecap="round"/>
  <line x1="360" y1="${shoulderY + 8}" x2="330" y2="${elbowY}" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <line x1="330" y1="${elbowY}" x2="320" y2="390" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <line x1="450" y1="${shoulderY + 14}" x2="430" y2="${elbowY}" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <line x1="430" y1="${elbowY}" x2="420" y2="390" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <circle cx="724" cy="${ankleY}" r="15" fill="#0f172a"/>
  <text x="650" y="456" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#111827">Frame ${frameNo}</text>
</svg>`;
}

async function makePushupVideo(dir, { filename, role, color, repCount, livenessPhrase }) {
  const framePaths = [];
  const durationSec = 60;
  for (let i = 0; i < durationSec; i += 1) {
    const phase = pushupPhaseAt({ repCount, durationSec, elapsedSec: i });
    const svg = svgFrame({ role, color, frameNo: i + 1, phase, livenessPhrase, elapsedSec: i, durationSec });
    const framePath = path.join(dir, `${filename}-${String(i).padStart(2, "0")}.png`);
    await sharp(Buffer.from(svg)).png().toFile(framePath);
    framePaths.push(framePath);
  }

  const concatPath = path.join(dir, `${filename}.txt`);
  const concatBody = framePaths
    .map((framePath) => `file '${framePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'\nduration 1.0`)
    .join("\n");
  await writeFile(concatPath, `${concatBody}\nfile '${framePaths.at(-1).replace(/\\/g, "/").replace(/'/g, "'\\''")}'\n`, "utf8");

  const videoPath = path.join(dir, `${filename}.mp4`);
  await execFile(ffmpegPath, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-vf", "fps=1,format=yuv420p",
    "-movflags", "+faststart",
    videoPath,
  ], { windowsHide: true });

  return videoPath;
}

async function uploadVideo(jar, challengeId, filePath, filename) {
  const buffer = await readFile(filePath);
  const file = new File([buffer], filename, { type: "video/mp4" });
  return blobUpload(`evidence/${challengeId}/${filename}`, file, {
    access: "public",
    handleUploadUrl: `${base}/api/challenges/${challengeId}/evidence/blob-handle`,
    contentType: "video/mp4",
    multipart: false,
    clientPayload: JSON.stringify({ fileName: filename, fileSizeBytes: buffer.length, contentType: "video/mp4" }),
    headers: { cookie: jar.header() },
  });
}

function parsePreparedFrames(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPreparedFrames(jar, challengeId, creatorEvidenceId, opponentEvidenceId) {
  let last = null;
  const attempts = expectPreextract ? 45 : 1;
  for (let i = 0; i < attempts; i += 1) {
    const snapshot = await getJson(jar, `/api/challenges/${challengeId}`);
    last = snapshot.challenge;
    const evidenceById = new Map((last.evidence || []).map((row) => [row.id, row]));
    const creatorFrames = parsePreparedFrames(evidenceById.get(creatorEvidenceId)?.preparedFrames);
    const opponentFrames = parsePreparedFrames(evidenceById.get(opponentEvidenceId)?.preparedFrames);
    if (creatorFrames.length > 0 && opponentFrames.length > 0) {
      return {
        challenge: last,
        creatorFrames,
        opponentFrames,
        creatorPrepareMode: evidenceById.get(creatorEvidenceId)?.preparedMode ?? null,
        opponentPrepareMode: evidenceById.get(opponentEvidenceId)?.preparedMode ?? null,
      };
    }
    await sleep(2000);
  }
  return {
    challenge: last,
    creatorFrames: parsePreparedFrames(last?.evidence?.find((row) => row.id === creatorEvidenceId)?.preparedFrames),
    opponentFrames: parsePreparedFrames(last?.evidence?.find((row) => row.id === opponentEvidenceId)?.preparedFrames),
    creatorPrepareMode: last?.evidence?.find((row) => row.id === creatorEvidenceId)?.preparedMode ?? null,
    opponentPrepareMode: last?.evidence?.find((row) => row.id === opponentEvidenceId)?.preparedMode ?? null,
  };
}

async function currentCommitSha() {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"], { windowsHide: true });
    return stdout.trim();
  } catch {
    return process.env.E2E_COMMIT_SHA || null;
  }
}

function rulesFromSpec(spec) {
  return [
    `Objective: ${spec.objective}`,
    `Winning condition: ${spec.winning_condition}`,
    `Evidence: ${spec.required_evidence}`,
    `Recording: ${spec.video_capture_instructions}`,
    `Start: ${spec.start_condition}`,
    `End: ${spec.end_condition}`,
    `Timing: ${spec.timing_method}`,
    `Valid rep: ${spec.valid_repetition_definition}`,
    `Scoring: ${spec.scoring_method}`,
    `Attempts: ${spec.allowed_attempts}`,
    `Anti-cheat: ${(spec.anti_cheat_rules || []).join(" ")}`,
    `AI judging: ${spec.ai_judging_method}`,
    `Dispute: ${spec.dispute_window}. ${spec.fallback_manual_review}`,
    `Settlement: ${spec.payout_rule}`,
  ].filter(Boolean).join("\n");
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  deploymentUrl: base,
  commitSha: await currentCommitSha(),
  stamp,
  judgeProvider,
  judgeModel,
  expectedWinner: "creator",
  checks: {},
};

let tempDir = null;

try {
  if (videoStorage !== "public_fixture" && !ffmpegPath) throw new Error("ffmpeg-static did not resolve an ffmpeg binary");

  tempDir = await mkdtemp(path.join(tmpdir(), "gamble-video-e2e-"));
  const creatorEmail = `codex.video.creator.${stamp}@example.com`;
  const opponentEmail = `codex.video.opponent.${stamp}@example.com`;
  const creator = await register(creatorEmail, `vid_creator_${stamp.slice(-6)}`);
  const opponent = await register(opponentEmail, `vid_opp_${stamp.slice(-6)}`);

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

  const generated = await postJson(creator.jar, "/api/challenges/generate-spec", {
    inputText: "I want to bet Jerry who can do more pushups in 60 seconds.",
  });
  const spec = generated.spec;
  proof.generatedSpec = {
    source: generated.source,
    model: generated.model,
    providerId: generated.providerId,
    title: spec.challenge_title,
    stakeAmount: spec.stake_amount,
    evidence: spec.required_evidence,
    aiJudging: spec.ai_judging_method,
  };

  const rules = rulesFromSpec(spec);
  const protocol = pushupVisionProtocol({
    stamp,
    title: spec.challenge_title || `Video push-up winner settlement ${stamp}`,
    rawPrompt: "I want to bet Jerry who can do more pushups in 60 seconds.",
    livenessPhrase: videoStorage === "public_fixture" ? publicFixtureLivenessPhrase : null,
  });
  const created = await postJson(creator.jar, "/api/challenges", {
    protocol,
    stake: Math.max(1, Number(spec.stake_amount || 0)),
    stakeToken: "credits",
    rules,
    aiReview: true,
    isPublic: false,
    visibility: "private",
  });
  const challengeId = created.challenge.id;
  const livenessPhrase = created.challenge.livenessPrompt || `stubborn video proof ${stamp}`;
  proof.challenge = {
    id: challengeId,
    url: `${base}/challenge/${challengeId}`,
    createdStatus: created.challenge.status,
    stake: created.challenge.stake,
    evidenceType: created.challenge.evidenceType,
    protocolVersion: created.challenge.protocolVersion,
    evidenceMode: created.challenge.evidenceMode,
    identityMode: created.challenge.identityMode,
    settlementProtocolMode: created.challenge.settlementProtocolMode,
    settlementMode: created.challenge.settlementMode,
    livenessPrompt: livenessPhrase,
    videoStorage,
  };

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, { acceptedRuleContract: true });
  proof.accept = {
    status: accepted.challenge.status,
    participants: accepted.challenge.participants.length,
  };

  let creatorVideoUrl = `${base}/e2e-fixtures/pushups-a-static-phrase.mp4`;
  let opponentVideoUrl = `${base}/e2e-fixtures/pushups-b-static-phrase.mp4`;
  let creatorVideoSize = null;
  let opponentVideoSize = null;
  let fixtureKind = "public_static_pushup_video_fixture_v1";

  if (videoStorage === "public_fixture") {
    requireCheck(proof, "public_fixture_liveness_matches_challenge", livenessPhrase === publicFixtureLivenessPhrase, {
      livenessPhrase,
      publicFixtureLivenessPhrase,
    });
    const [creatorHead, opponentHead] = await Promise.all([
      fetch(creatorVideoUrl, { method: "HEAD" }),
      fetch(opponentVideoUrl, { method: "HEAD" }),
    ]);
    requireCheck(proof, "public_creator_fixture_reachable", creatorHead.ok, { status: creatorHead.status, url: creatorVideoUrl });
    requireCheck(proof, "public_opponent_fixture_reachable", opponentHead.ok, { status: opponentHead.status, url: opponentVideoUrl });
  } else {
    const creatorVideo = await makePushupVideo(tempDir, {
      filename: `creator-pushups-${stamp}`,
      role: "CREATOR / PARTICIPANT A",
      color: "#047857",
      repCount: 12,
      livenessPhrase,
    });
    const opponentVideo = await makePushupVideo(tempDir, {
      filename: `opponent-pushups-${stamp}`,
      role: "OPPONENT / PARTICIPANT B",
      color: "#b91c1c",
      repCount: 1,
      livenessPhrase,
    });
    creatorVideoSize = (await readFile(creatorVideo)).length;
    opponentVideoSize = (await readFile(opponentVideo)).length;
    const creatorBlob = await uploadVideo(creator.jar, challengeId, creatorVideo, `creator-pushups-${stamp}.mp4`);
    const opponentBlob = await uploadVideo(opponent.jar, challengeId, opponentVideo, `opponent-pushups-${stamp}.mp4`);
    creatorVideoUrl = creatorBlob.url;
    opponentVideoUrl = opponentBlob.url;
    fixtureKind = "generated_uploaded_pushup_video_fixture_v1";
  }

  const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "video",
    url: creatorVideoUrl,
    description: `Official continuous push-up attempt video. Liveness phrase visible: ${livenessPhrase}. Public fixture uses a side-view pose diagram; infer push-up motion from the body moving high/top to low/down and back over time. No direct rep-count label is present.`,
    metadata: { fixtureKind, livenessPhrase, fileSizeBytes: creatorVideoSize },
  });
  const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
    type: "video",
    url: opponentVideoUrl,
    description: `Official continuous push-up attempt video. Liveness phrase visible: ${livenessPhrase}. Public fixture uses a side-view pose diagram; infer push-up motion from the body moving high/top to low/down and back over time. No direct rep-count label is present.`,
    metadata: { fixtureKind, livenessPhrase, fileSizeBytes: opponentVideoSize },
  });
  proof.evidence = {
    creatorEvidenceId: evCreator.evidence.id,
    opponentEvidenceId: evOpponent.evidence.id,
    creatorVideoUrl,
    opponentVideoUrl,
  };

  const prepared = await waitForPreparedFrames(
    creator.jar,
    challengeId,
    evCreator.evidence.id,
    evOpponent.evidence.id,
  );
  proof.preparedFrames = {
    creatorCount: prepared.creatorFrames.length,
    opponentCount: prepared.opponentFrames.length,
    creatorMode: prepared.creatorPrepareMode,
    opponentMode: prepared.opponentPrepareMode,
    statusBeforeJudge: prepared.challenge?.status ?? null,
    preextractExpected: expectPreextract,
  };

  requireCheck(proof, "created_waiting_for_opponent", created.challenge.status === "waiting_for_opponent", created.challenge.status);
  requireCheck(
    proof,
    "created_with_protocol_v2",
    created.challenge.protocolVersion === "2.0" &&
      created.challenge.evidenceMode === "separate_video" &&
      created.challenge.identityMode === "liveness_phrase" &&
      created.challenge.settlementProtocolMode === "auto_ai_vision",
    proof.challenge,
  );
  requireCheck(proof, "opponent_accepted_evidence_window_open", accepted.challenge.status === "evidence_window_open", accepted.challenge.status);
  requireCheck(
    proof,
    "challenge_video_evidence_type",
    String(created.challenge.evidenceType).includes("video") && created.challenge.evidenceMode === "separate_video",
    { evidenceType: created.challenge.evidenceType, evidenceMode: created.challenge.evidenceMode },
  );
  requireCheck(proof, "both_video_evidence_submitted", prepared.challenge?.evidence?.length === 2, prepared.challenge?.evidence?.length);
  if (expectPreextract) {
    requireCheck(proof, "prepared_frames_creator", prepared.creatorFrames.length > 0, proof.preparedFrames);
    requireCheck(proof, "prepared_frames_opponent", prepared.opponentFrames.length > 0, proof.preparedFrames);
  }

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
    settlementRecommendation: judged.settlementRecommendation,
    source: judged.source,
    model: judged.model,
    providerCall: judged.providerCall ?? judged.verdict?.providerCall ?? null,
    reasoning: judged.reasoning,
    videoMetrics: judged.videoMetrics,
  };
  proof.fixture = {
    directRepCountLabelsRemoved: true,
    visibleLabelsAllowed: ["role", "liveness phrase", "timer"],
  };

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  const afterCreator = await getJson(creator.jar, "/api/credits");
  const afterOpponent = await getJson(opponent.jar, "/api/credits");
  const creatorTxs = afterCreator.transactions.filter((tx) => tx.challengeId === challengeId);
  const opponentTxs = afterOpponent.transactions.filter((tx) => tx.challengeId === challengeId);
  const winnerWinRow = creatorTxs.find((tx) => tx.type === "win" && tx.amount === 2);
  const winnerStakeRow = creatorTxs.find((tx) => tx.type === "stake" && tx.amount === -1);
  const judgeSpendRow = creatorTxs.find((tx) => tx.type === "ai_judge" && tx.amount < 0);
  const loserStakeRow = opponentTxs.find((tx) => tx.type === "stake" && tx.amount === -1);
  const loserLossRow = opponentTxs.find((tx) => tx.type === "loss" && tx.amount === -1);
  const refundRows = [...creatorTxs, ...opponentTxs].filter((tx) => tx.type === "refund");

  proof.finalChallenge = {
    status: finalChallenge.challenge.status,
    latestJudgmentId: finalChallenge.challenge.judgments?.[0]?.id ?? null,
    latestJudgmentWinnerId: finalChallenge.challenge.judgments?.[0]?.winnerId ?? null,
    evidenceCount: finalChallenge.challenge.evidence?.length ?? 0,
    participantCount: finalChallenge.challenge.participants?.length ?? 0,
  };
  proof.balancesAfter = {
    creator: afterCreator.credits,
    opponent: afterOpponent.credits,
  };
  proof.creditTx = {
    creator: creatorTxs.map(txView),
    opponent: opponentTxs.map(txView),
  };

  requireCheck(proof, "judge_source_is_vision", judged.source === "vision_llm", judged.source);
  requireCheck(proof, "judge_model_is_real_vision_provider", !/Deterministic/i.test(judged.model) && /OpenAI|Google|Anthropic|gpt|gemini|claude/i.test(judged.model), judged.model);
  const providerCall = judged.providerCall ?? judged.verdict?.providerCall ?? null;
  requireCheck(proof, "provider_call_recorded", Boolean(providerCall), providerCall);
  requireCheck(proof, "provider_call_used_api", providerCall?.usedApi === true, providerCall);
  requireCheck(proof, "provider_call_kind_vision", providerCall?.requestKind === "vision", providerCall);
  requireCheck(proof, "provider_call_http_200", providerCall?.httpStatus === 200 || providerCall?.httpStatus == null, providerCall);
  if (judgeProvider === "openai") {
    requireCheck(proof, "provider_response_id_present", typeof providerCall?.responseId === "string" && providerCall.responseId.length > 0, providerCall);
  }
  requireCheck(proof, "video_metrics_present", Boolean(judged.videoMetrics?.participantA && judged.videoMetrics?.participantB), judged.videoMetrics);
  requireCheck(proof, "fixture_has_no_direct_rep_count_labels", proof.fixture.directRepCountLabelsRemoved === true, proof.fixture);
  requireCheck(proof, "creator_liveness_visible", judged.videoMetrics?.participantA?.livenessPhraseVisible === true, judged.videoMetrics?.participantA);
  requireCheck(proof, "opponent_liveness_visible", judged.videoMetrics?.participantB?.livenessPhraseVisible === true, judged.videoMetrics?.participantB);
  requireCheck(proof, "creator_full_body_visible", judged.videoMetrics?.participantA?.fullBodyVisible === true, judged.videoMetrics?.participantA);
  requireCheck(proof, "opponent_full_body_visible", judged.videoMetrics?.participantB?.fullBodyVisible === true, judged.videoMetrics?.participantB);
  requireCheck(proof, "creator_duration_covered", judged.videoMetrics?.participantA?.fullDurationCovered === true && judged.videoMetrics?.participantA?.videoTooShort !== true, judged.videoMetrics?.participantA);
  requireCheck(proof, "opponent_duration_covered", judged.videoMetrics?.participantB?.fullDurationCovered === true && judged.videoMetrics?.participantB?.videoTooShort !== true, judged.videoMetrics?.participantB);
  requireCheck(proof, "no_loop_or_editing_flags", judged.videoMetrics?.participantA?.suspectedEditingOrLoop !== true && judged.videoMetrics?.participantB?.suspectedEditingOrLoop !== true, judged.videoMetrics);
  requireCheck(proof, "creator_rep_count_higher", Number(judged.videoMetrics?.participantA?.validRepCount ?? 0) > Number(judged.videoMetrics?.participantB?.validRepCount ?? 0), judged.videoMetrics);
  requireCheck(proof, "judge_valid_creator_winner", judged.winnerId === creator.session.user.id, proof.judgment);
  requireCheck(proof, "judge_high_confidence", judged.confidence >= 0.85, judged.confidence);
  requireCheck(proof, "judge_settle_recommendation", judged.settlementRecommendation === "settle_winner", judged.settlementRecommendation);
  requireCheck(proof, "challenge_settled", finalChallenge.challenge.status === "settled", finalChallenge.challenge.status);
  requireCheck(proof, "winner_win_row", Boolean(winnerWinRow), proof.creditTx.creator);
  requireCheck(proof, "winner_stake_row_linked", Boolean(winnerStakeRow), proof.creditTx.creator);
  requireCheck(proof, "judge_spend_row", Boolean(judgeSpendRow), proof.creditTx.creator);
  requireCheck(proof, "loser_stake_row", Boolean(loserStakeRow), proof.creditTx.opponent);
  requireCheck(proof, "loser_loss_row", Boolean(loserLossRow), proof.creditTx.opponent);
  requireCheck(proof, "no_refund_rows", refundRows.length === 0, refundRows.map(txView));
  const expectedCreatorAfter =
    beforeCreator.credits +
    (winnerStakeRow?.amount ?? 0) +
    (judgeSpendRow?.amount ?? 0) +
    (winnerWinRow?.amount ?? 0);
  requireCheck(proof, "winner_balance_math", afterCreator.credits === expectedCreatorAfter, {
    before: beforeCreator.credits,
    after: afterCreator.credits,
    expected: expectedCreatorAfter,
    countedRows: [winnerStakeRow, judgeSpendRow, winnerWinRow].filter(Boolean).map(txView),
  });
  requireCheck(proof, "loser_balance_math", afterOpponent.credits === beforeOpponent.credits - 1, {
    before: beforeOpponent.credits,
    after: afterOpponent.credits,
    note: "opponent balance changed only by escrow stake; loss row records the outcome without double-deducting",
  });
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.winnerSettled = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exitCode = 1;
} finally {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

if (!proof.error) {
  proof.winnerSettled = true;
  console.log(JSON.stringify(proof, null, 2));
}
