import { execFile as execFileCallback } from "node:child_process";
import { File } from "node:buffer";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { upload as blobUpload } from "@vercel/blob/client";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const execFile = promisify(execFileCallback);
const base = process.env.E2E_BASE_URL || "https://gamble-ai-agent.vercel.app";
const judgeProvider = process.env.E2E_JUDGE_PROVIDER || "openai";
const judgeModel = process.env.E2E_JUDGE_MODEL || "gpt-4o";
const fixtureDir = process.env.REAL_VIDEO_FIXTURE_DIR || "";
const caseDelayMs = Number(process.env.E2E_ROBUSTNESS_CASE_DELAY_MS || (judgeProvider === "openai" ? 45_000 : 5_000));
const selectedCaseIds = (process.env.RUN_ROBUSTNESS_CASES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

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
    password: "TestPass123!robust",
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

function requireCheck(caseProof, name, passed, detail) {
  caseProof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`${caseProof.id}: ${name}`);
}

function phaseFor(repCount, durationSec, elapsedSec) {
  const cycle = durationSec / repCount;
  const within = (elapsedSec % cycle) / cycle;
  if (within < 0.12 || within > 0.88) return "top";
  if (within > 0.30 && within < 0.70) return "down";
  return "transition";
}

function personSvg({ color, phase, variant }) {
  if (variant === "non_pushup") {
    return `
      <circle cx="470" cy="165" r="28" fill="${color}"/>
      <line x1="470" y1="195" x2="470" y2="315" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
      <line x1="470" y1="225" x2="395" y2="275" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
      <line x1="470" y1="225" x2="545" y2="275" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
      <line x1="470" y1="315" x2="420" y2="405" stroke="${color}" stroke-width="18" stroke-linecap="round"/>
      <line x1="470" y1="315" x2="520" y2="405" stroke="${color}" stroke-width="18" stroke-linecap="round"/>`;
  }

  const isDown = phase === "down";
  const isTransition = phase === "transition";
  const shoulderY = isDown ? 348 : isTransition ? 286 : 218;
  const hipY = isDown ? 354 : isTransition ? 300 : 244;
  const ankleY = isDown ? 360 : isTransition ? 318 : 270;
  const elbowY = isDown ? 370 : isTransition ? 318 : 288;
  const headY = isDown ? 326 : isTransition ? 258 : 198;
  return `
    <line x1="120" y1="390" x2="840" y2="390" stroke="#64748b" stroke-width="8" stroke-linecap="round"/>
    <circle cx="292" cy="${headY}" r="28" fill="${color}"/>
    <line x1="340" y1="${shoulderY}" x2="540" y2="${hipY}" stroke="${color}" stroke-width="26" stroke-linecap="round"/>
    <line x1="540" y1="${hipY}" x2="720" y2="${ankleY}" stroke="${color}" stroke-width="24" stroke-linecap="round"/>
    <line x1="360" y1="${shoulderY + 8}" x2="330" y2="${elbowY}" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
    <line x1="330" y1="${elbowY}" x2="320" y2="390" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
    <line x1="450" y1="${shoulderY + 14}" x2="430" y2="${elbowY}" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
    <line x1="430" y1="${elbowY}" x2="420" y2="390" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
    <circle cx="724" cy="${ankleY}" r="15" fill="#0f172a"/>`;
}

function frameSvg({ role, color, elapsedSec, durationSec, phase, livenessPhrase, variant }) {
  const dark = variant === "dark_blurry";
  const cropped = variant === "cropped" || variant === "partial_body";
  const badAngle = variant === "bad_angle";
  const noVisibleRole = variant === "no_text_label";
  const body = personSvg({ color: dark ? "#1f2937" : color, phase, variant });
  const elapsedLabel = `00:${String(elapsedSec).padStart(2, "0")}`;
  const transform = badAngle ? `transform="translate(200 60) rotate(18 480 270) scale(0.72 0.92)"` : "";
  const clipDef = cropped
    ? `<clipPath id="crop"><rect x="185" y="80" width="430" height="${variant === "partial_body" ? 250 : 360}"/></clipPath>`
    : "";
  const clipAttr = cropped ? `clip-path="url(#crop)"` : "";
  const blur = dark ? `filter="url(#blur)"` : "";
  return `
<svg width="960" height="540" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${clipDef}
    <filter id="blur"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect width="960" height="540" fill="${dark ? "#030712" : "#111827"}"/>
  <rect x="30" y="30" width="900" height="480" rx="28" fill="${dark ? "#111827" : "#f8fafc"}"/>
  <text x="70" y="88" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="${dark ? "#334155" : "#111827"}">Push-up video proof</text>
  ${noVisibleRole ? "" : `<text x="70" y="130" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="${color}">${role}</text>`}
  <text x="70" y="174" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${dark ? "#475569" : "#0f172a"}">Timer ${elapsedLabel} / 01:00</text>
  <text x="70" y="216" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="${dark ? "#475569" : "#334155"}">Challenge phrase: ${livenessPhrase}</text>
  <rect x="70" y="238" width="280" height="10" rx="5" fill="#cbd5e1"/>
  <rect x="70" y="238" width="${Math.max(6, Math.round((elapsedSec / Math.max(1, durationSec)) * 280))}" height="10" rx="5" fill="${color}"/>
  <g ${transform} ${clipAttr} ${blur}>${body}</g>
</svg>`;
}

async function makeSyntheticVideo(dir, { filename, role, color, repCount, durationSec = 60, livenessPhrase, variant = "clean" }) {
  const framePaths = [];
  const totalFrames = Math.max(4, durationSec);
  for (let i = 0; i < totalFrames; i += 1) {
    const elapsedSec = variant === "static_loop" ? 0 : i;
    const phase = variant === "static_loop" ? "top" : phaseFor(repCount, durationSec, elapsedSec);
    const svg = frameSvg({ role, color, elapsedSec, durationSec, phase, livenessPhrase, variant });
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
  const filters = variant === "dark_blurry"
    ? "fps=1,eq=brightness=-0.28:saturation=0.35,boxblur=8:1,format=yuv420p"
    : "fps=1,format=yuv420p";
  await execFile(ffmpegPath, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-vf", filters,
    "-movflags", "+faststart",
    videoPath,
  ], { windowsHide: true });

  return videoPath;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function videoForCase(dir, caseDef, side, livenessPhrase) {
  const realPath = fixtureDir ? path.join(fixtureDir, `${caseDef.id}-${side}.mp4`) : "";
  if (realPath && await fileExists(realPath)) return { path: realPath, source: "real_fixture_dir" };

  const participant = side === "creator" ? caseDef.creator : caseDef.opponent;
  const generatedPath = await makeSyntheticVideo(dir, {
    filename: `${caseDef.id}-${side}`,
    role: side === "creator" ? "PARTICIPANT A" : "PARTICIPANT B",
    color: side === "creator" ? "#047857" : "#b91c1c",
    repCount: participant.repCount,
    durationSec: participant.durationSec,
    livenessPhrase,
    variant: participant.variant,
  });
  return { path: generatedPath, source: "synthetic_phone_style_fixture" };
}

async function uploadVideo(jar, challengeId, filePath, filename) {
  const buffer = await readFile(filePath);
  const file = new File([buffer], filename, { type: "video/mp4" });
  return blobUpload(`evidence/${challengeId}/${filename}`, file, {
    access: "public",
    handleUploadUrl: `${base}/api/challenges/${challengeId}/evidence/blob-handle`,
    contentType: "video/mp4",
    multipart: false,
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
  for (let i = 0; i < 45; i += 1) {
    const snapshot = await getJson(jar, `/api/challenges/${challengeId}`);
    last = snapshot.challenge;
    const evidenceById = new Map((last.evidence || []).map((row) => [row.id, row]));
    const creatorFrames = parsePreparedFrames(evidenceById.get(creatorEvidenceId)?.preparedFrames);
    const opponentFrames = parsePreparedFrames(evidenceById.get(opponentEvidenceId)?.preparedFrames);
    if (creatorFrames.length > 0 && opponentFrames.length > 0) {
      return { challenge: last, creatorFrames, opponentFrames };
    }
    await sleep(2000);
  }
  return {
    challenge: last,
    creatorFrames: parsePreparedFrames(last?.evidence?.find((row) => row.id === creatorEvidenceId)?.preparedFrames),
    opponentFrames: parsePreparedFrames(last?.evidence?.find((row) => row.id === opponentEvidenceId)?.preparedFrames),
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

const cases = [
  {
    id: "clean_a_beats_b",
    title: "Clean phone-style push-up video, A clearly beats B",
    expect: "settled",
    stake: 1,
    creator: { repCount: 12, durationSec: 60, variant: "clean" },
    opponent: { repCount: 1, durationSec: 60, variant: "clean" },
  },
  {
    id: "bad_angle",
    title: "Bad angle video should not auto-settle",
    expect: "not_settled",
    creator: { repCount: 12, durationSec: 60, variant: "bad_angle" },
    opponent: { repCount: 6, durationSec: 60, variant: "bad_angle" },
  },
  {
    id: "partial_body",
    title: "Partial body not visible should not auto-settle",
    expect: "not_settled",
    creator: { repCount: 12, durationSec: 60, variant: "partial_body" },
    opponent: { repCount: 6, durationSec: 60, variant: "partial_body" },
  },
  {
    id: "too_dark_blurry",
    title: "Too dark or blurry video should not auto-settle",
    expect: "not_settled",
    creator: { repCount: 12, durationSec: 60, variant: "dark_blurry" },
    opponent: { repCount: 6, durationSec: 60, variant: "dark_blurry" },
  },
  {
    id: "cropped_video",
    title: "Cropped video should not auto-settle",
    expect: "not_settled",
    creator: { repCount: 12, durationSec: 60, variant: "cropped" },
    opponent: { repCount: 6, durationSec: 60, variant: "cropped" },
  },
  {
    id: "short_video",
    title: "Short video under required duration should not auto-settle",
    expect: "not_settled",
    creator: { repCount: 6, durationSec: 20, variant: "clean" },
    opponent: { repCount: 3, durationSec: 20, variant: "clean" },
  },
  {
    id: "tie_video",
    title: "Both users tied should not auto-settle a winner",
    expect: "not_settled",
    creator: { repCount: 8, durationSec: 60, variant: "clean" },
    opponent: { repCount: 8, durationSec: 60, variant: "clean" },
  },
  {
    id: "non_pushup_video",
    title: "One user submits non-push-up video should not auto-settle",
    expect: "not_settled",
    metricExpectation: "creator_reps_higher",
    creator: { repCount: 4, durationSec: 60, variant: "clean" },
    opponent: { repCount: 1, durationSec: 60, variant: "non_pushup" },
  },
  {
    id: "no_visible_role_label",
    title: "Visible role label removed, motion/body position only",
    expect: "settled",
    creator: { repCount: 12, durationSec: 60, variant: "no_text_label" },
    opponent: { repCount: 1, durationSec: 60, variant: "no_text_label" },
  },
  {
    id: "static_loop",
    title: "Fake static or looped frames should not auto-settle",
    expect: "not_settled",
    metricExpectation: "loop_or_no_valid_reps",
    creator: { repCount: 12, durationSec: 60, variant: "static_loop" },
    opponent: { repCount: 6, durationSec: 60, variant: "static_loop" },
  },
].filter((item) => selectedCaseIds.length === 0 || selectedCaseIds.includes(item.id));

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = {
  base,
  commitSha: await currentCommitSha(),
  judgeProvider,
  judgeModel,
  fixtureDir: fixtureDir || null,
  caseCount: cases.length,
  cases: [],
};

let tempDir = null;

try {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve an ffmpeg binary");
  if (cases.length === 0) throw new Error("No robustness cases selected");

  tempDir = await mkdtemp(path.join(tmpdir(), "gamble-video-robustness-"));
  const creator = await register(`codex.robust.creator.${stamp}@example.com`, `rob_creator_${stamp.slice(-6)}`);
  const opponent = await register(`codex.robust.opponent.${stamp}@example.com`, `rob_opp_${stamp.slice(-6)}`);

  for (const caseDef of cases) {
    const caseProof = {
      id: caseDef.id,
      title: caseDef.title,
      expectedOutcome: caseDef.expect,
      checks: {},
    };
    proof.cases.push(caseProof);

    const created = await postJson(creator.jar, "/api/challenges", {
      title: `Robustness: ${caseDef.title} ${stamp}`,
      description: "Production-equivalent robustness E2E for video push-up judging. No direct rep-count labels are present in fixture videos.",
      marketType: "challenge",
      proposition: "Who completes more valid push-ups in a 60-second continuous video attempt?",
      type: "Fitness",
      stake: caseDef.stake ?? 0,
      stakeToken: "credits",
      deadline: "2 hours",
      rules: [
        "Objective: determine who completes more valid push-ups in a 60-second continuous video attempt.",
        "Valid rep: starts at top with arms extended, chest/body clearly lowers, body line stays reasonably straight, returns to top.",
        "Evidence: continuous full-body video with the in-app liveness phrase visible.",
        "Anti-cheat: no cuts, no old footage, no looped/static clip, no cropped body, no unusable angle, no too-dark or blurry video.",
        "AI judging: use vision frames only; do not rely on direct text labels for rep counts.",
        "Auto settlement: only if source=vision_llm, confidence>=0.85, quality=good, both videos cover the required duration, both bodies are visible, liveness is visible, and no anti-cheat flag is present.",
      ].join("\n"),
      evidenceType: "video",
      settlementMode: "auto_settle_ai_high_confidence",
      aiReview: true,
      isPublic: true,
      visibility: "public",
    });
    const challengeId = created.challenge.id;
    const livenessPhrase = created.challenge.livenessPrompt || `GambleAI ${stamp}`;
    caseProof.challengeId = challengeId;
    caseProof.livenessPrompt = livenessPhrase;

    const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, {});
    requireCheck(caseProof, "accepted_evidence_window_open", accepted.challenge.status === "evidence_window_open", accepted.challenge.status);

    const creatorVideo = await videoForCase(tempDir, caseDef, "creator", livenessPhrase);
    const opponentVideo = await videoForCase(tempDir, caseDef, "opponent", livenessPhrase);
    caseProof.videoSources = { creator: creatorVideo.source, opponent: opponentVideo.source };

    const creatorBlob = await uploadVideo(creator.jar, challengeId, creatorVideo.path, `${caseDef.id}-creator-${stamp}.mp4`);
    const opponentBlob = await uploadVideo(opponent.jar, challengeId, opponentVideo.path, `${caseDef.id}-opponent-${stamp}.mp4`);

    const evCreator = await postJson(creator.jar, `/api/challenges/${challengeId}/evidence`, {
      type: "video",
      url: creatorBlob.url,
      description: `Robustness case ${caseDef.id}. Liveness phrase visible: ${livenessPhrase}. Synthetic fixture uses a side-view pose diagram; infer push-up motion from the body moving high/top to low/down and back over time. No direct rep-count label is present.`,
      metadata: { robustnessCase: caseDef.id, livenessPhrase, fixtureSource: creatorVideo.source },
    });
    const evOpponent = await postJson(opponent.jar, `/api/challenges/${challengeId}/evidence`, {
      type: "video",
      url: opponentBlob.url,
      description: `Robustness case ${caseDef.id}. Liveness phrase visible: ${livenessPhrase}. Synthetic fixture uses a side-view pose diagram; infer push-up motion from the body moving high/top to low/down and back over time. No direct rep-count label is present.`,
      metadata: { robustnessCase: caseDef.id, livenessPhrase, fixtureSource: opponentVideo.source },
    });
    caseProof.evidence = {
      creatorEvidenceId: evCreator.evidence.id,
      opponentEvidenceId: evOpponent.evidence.id,
    };

    const prepared = await waitForPreparedFrames(creator.jar, challengeId, evCreator.evidence.id, evOpponent.evidence.id);
    caseProof.preparedFrames = {
      creatorCount: prepared.creatorFrames.length,
      opponentCount: prepared.opponentFrames.length,
      statusBeforeJudge: prepared.challenge?.status ?? null,
    };
    requireCheck(caseProof, "prepared_frames_creator", prepared.creatorFrames.length > 0, caseProof.preparedFrames);
    requireCheck(caseProof, "prepared_frames_opponent", prepared.opponentFrames.length > 0, caseProof.preparedFrames);

    const judged = await postJson(creator.jar, `/api/challenges/${challengeId}/judge`, {
      tier: 1,
      providerId: judgeProvider,
      model: judgeModel,
      autoSettle: true,
    });
    const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
    const creatorCredits = await getJson(creator.jar, "/api/credits");
    const opponentCredits = await getJson(opponent.jar, "/api/credits");
    const creatorTxs = creatorCredits.transactions.filter((tx) => tx.challengeId === challengeId);
    const opponentTxs = opponentCredits.transactions.filter((tx) => tx.challengeId === challengeId);
    const refundRows = [...creatorTxs, ...opponentTxs].filter((tx) => tx.type === "refund");

    caseProof.judgment = {
      id: judged.judgment?.id,
      status: judged.status,
      winnerId: judged.winnerId,
      confidence: judged.confidence,
      evidenceQuality: judged.evidenceQuality,
      settlementRecommendation: judged.settlementRecommendation,
      source: judged.source,
      model: judged.model,
      autoSettleEligible: judged.autoSettleEligible,
      autoSettleBlockReason: judged.autoSettleBlockReason,
      providerCall: judged.providerCall ?? judged.verdict?.providerCall ?? null,
      videoMetrics: judged.videoMetrics,
    };
    caseProof.finalStatus = finalChallenge.challenge.status;
    caseProof.creditTx = {
      creator: creatorTxs.map(txView),
      opponent: opponentTxs.map(txView),
      refundRows: refundRows.map(txView),
    };

    if (caseDef.expect === "settled") {
      requireCheck(caseProof, "judge_source_is_vision", judged.source === "vision_llm", caseProof.judgment);
      const providerCall = judged.providerCall ?? judged.verdict?.providerCall ?? null;
      requireCheck(caseProof, "provider_call_recorded", Boolean(providerCall), providerCall);
      requireCheck(caseProof, "provider_call_used_api", providerCall?.usedApi === true, providerCall);
      requireCheck(caseProof, "provider_call_kind_vision", providerCall?.requestKind === "vision", providerCall);
      requireCheck(caseProof, "provider_call_http_200", providerCall?.httpStatus === 200 || providerCall?.httpStatus == null, providerCall);
      if (judgeProvider === "openai") {
        requireCheck(caseProof, "provider_response_id_present", typeof providerCall?.responseId === "string" && providerCall.responseId.length > 0, providerCall);
      }
      requireCheck(caseProof, "video_metrics_present", Boolean(judged.videoMetrics?.participantA && judged.videoMetrics?.participantB), judged.videoMetrics);
      requireCheck(caseProof, "settled_expected", finalChallenge.challenge.status === "settled", finalChallenge.challenge.status);
      requireCheck(caseProof, "winner_present", Boolean(judged.winnerId), caseProof.judgment);
      requireCheck(caseProof, "confidence_high", judged.confidence >= 0.85, judged.confidence);
      requireCheck(caseProof, "auto_settle_eligible", judged.autoSettleEligible === true, caseProof.judgment);
      requireCheck(caseProof, "rep_count_a_higher", Number(judged.videoMetrics?.participantA?.validRepCount ?? 0) > Number(judged.videoMetrics?.participantB?.validRepCount ?? 0), judged.videoMetrics);
    } else {
      requireCheck(caseProof, "judge_source_is_vision", judged.source === "vision_llm", caseProof.judgment);
      requireCheck(caseProof, "video_metrics_present", Boolean(judged.videoMetrics?.participantA && judged.videoMetrics?.participantB), judged.videoMetrics);
      if (caseDef.metricExpectation === "creator_reps_higher") {
        requireCheck(
          caseProof,
          "creator_reps_higher_than_non_pushup",
          Number(judged.videoMetrics?.participantA?.validRepCount ?? 0) > Number(judged.videoMetrics?.participantB?.validRepCount ?? -1),
          judged.videoMetrics,
        );
      }
      if (caseDef.metricExpectation === "loop_or_no_valid_reps") {
        const flags = [
          ...(judged.videoMetrics?.participantA?.antiCheatFlags ?? []),
          ...(judged.videoMetrics?.participantB?.antiCheatFlags ?? []),
          judged.videoMetrics?.participantA?.reasonForManualReview,
          judged.videoMetrics?.participantB?.reasonForManualReview,
          judged.videoMetrics?.participantA?.unclearReason,
          judged.videoMetrics?.participantB?.unclearReason,
        ].filter(Boolean).join(" ").toLowerCase();
        const loopFlagged = /loop|static|edit|motion|repeated/.test(flags);
        const bothZero =
          Number(judged.videoMetrics?.participantA?.validRepCount ?? -1) === 0 &&
          Number(judged.videoMetrics?.participantB?.validRepCount ?? -1) === 0;
        requireCheck(caseProof, "loop_or_static_detected", loopFlagged || bothZero, judged.videoMetrics);
      }
      requireCheck(caseProof, "not_auto_settled", finalChallenge.challenge.status !== "settled", finalChallenge.challenge.status);
      requireCheck(caseProof, "auto_settle_blocked", judged.autoSettleEligible !== true, caseProof.judgment);
    }
    if (cases.indexOf(caseDef) < cases.length - 1 && caseDelayMs > 0) {
      await sleep(caseDelayMs);
    }
  }
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  console.log(JSON.stringify(proof, null, 2));
  process.exitCode = 1;
} finally {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

if (!proof.error) {
  proof.passed = true;
  console.log(JSON.stringify(proof, null, 2));
}
