import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { judgeChallenge } from "../src/lib/ai-engine";
import { judgeShortScoredMatch } from "../src/lib/scored-match-judge";
import { getProviderById } from "../src/lib/llm-providers";
import { prepareRallyDetailVisuals, prepareScoredMatchTimeline } from "../src/lib/media/scored-match-visuals";
import {
  detectScoredMatchContract,
  validateRallyLedger,
  type RallyObservation,
  type ScoredMatchContract,
} from "../src/lib/scored-match";

const execFileAsync = promisify(execFile);
const exactFive: ScoredMatchContract = {
  sport: "badminton",
  mode: "exact_rallies",
  target: 5,
  maximumRallies: 5,
};

function rally(
  index: number,
  winner: "A" | "B" | null,
  scoreA: number,
  scoreB: number,
  confidence = 0.93,
): RallyObservation {
  return {
    index,
    startSec: (index - 1) * 2,
    endSec: index * 2 - 0.1,
    winner,
    scoreAfter: { A: scoreA, B: scoreB },
    confidence,
    evidence: `Synthetic visible scoreboard after rally ${index}`,
  };
}

function testContractCompiler() {
  const firstTo = detectScoredMatchContract(
    "羽毛球短局",
    "Games",
    "先得5分者胜。Participant A wears red; Participant B wears blue.",
  );
  assert.equal(firstTo.kind, "ready");
  if (firstTo.kind === "ready") {
    assert.equal(firstTo.contract.mode, "first_to");
    assert.equal(firstTo.contract.target, 5);
    assert.equal(firstTo.contract.maximumRallies, 9);
  }

  const exact = detectScoredMatchContract(
    "Badminton mini match",
    "Games",
    "Play exactly 5 rallies; higher final score wins.",
  );
  assert.equal(exact.kind, "ready");
  if (exact.kind === "ready") assert.equal(exact.contract.mode, "exact_rallies");

  const ambiguous = detectScoredMatchContract("羽毛球5个球的比赛", "Games", "录视频判断谁赢");
  assert.equal(ambiguous.kind, "ambiguous");

  const chineseNumeral = detectScoredMatchContract("羽毛球短局", "Games", "先得五分者胜");
  assert.equal(chineseNumeral.kind, "ready");

  const conflictingModes = detectScoredMatchContract("Badminton", "Games", "First to 5 points; play exactly 5 rallies");
  assert.equal(conflictingModes.kind, "ambiguous");

  const tooLong = detectScoredMatchContract("Badminton", "Games", "First to 21 points wins");
  assert.equal(tooLong.kind, "unsupported");
}

function testDeterministicLedger() {
  const valid = validateRallyLedger(exactFive, {
    identityConfirmed: true,
    continuousCoverage: true,
    integrityFlags: [],
    rallies: [
      rally(1, "A", 1, 0),
      rally(2, "B", 1, 1),
      rally(3, "A", 2, 1),
      rally(4, "B", 2, 2),
      rally(5, "A", 3, 2),
    ],
    confidence: 0.91,
    durationSec: 10,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.winner, "A");
  assert.deepEqual(valid.finalScore, { A: 3, B: 2 });

  const scoreJump = validateRallyLedger(exactFive, {
    identityConfirmed: true,
    continuousCoverage: true,
    integrityFlags: [],
    rallies: [
      rally(1, "A", 2, 0),
      rally(2, "B", 2, 1),
      rally(3, "A", 3, 1),
      rally(4, "B", 3, 2),
      rally(5, "A", 4, 2),
    ],
    confidence: 0.95,
  });
  assert.equal(scoreJump.valid, false);
  assert.equal(scoreJump.winner, null);
  assert.match(scoreJump.errors.join(" "), /does not match the point ledger/);

  const unclearPoint = validateRallyLedger(exactFive, {
    identityConfirmed: true,
    continuousCoverage: true,
    integrityFlags: [],
    rallies: [
      rally(1, "A", 1, 0),
      rally(2, "B", 1, 1),
      rally(3, null, 1, 1, 0.4),
      rally(4, "B", 1, 2),
      rally(5, "A", 2, 2),
    ],
    confidence: 0.9,
  });
  assert.equal(unclearPoint.valid, false);
  assert.equal(unclearPoint.winner, null);
  assert.match(unclearPoint.errors.join(" "), /does not have a clear point winner/);

  const cutVideo = validateRallyLedger(exactFive, {
    identityConfirmed: true,
    continuousCoverage: false,
    integrityFlags: ["jump cut at 00:04.00"],
    rallies: [
      rally(1, "A", 1, 0),
      rally(2, "B", 1, 1),
      rally(3, "A", 2, 1),
      rally(4, "B", 2, 2),
      rally(5, "A", 3, 2),
    ],
    confidence: 0.95,
  });
  assert.equal(cutVideo.valid, false);
  assert.equal(cutVideo.winner, null);
  assert.match(cutVideo.errors.join(" "), /integrity concern/);
}

async function testProductionJudgeInterception() {
  const base = {
    type: "Games",
    evidencePolicy: "video",
    evidenceA: { type: "video", description: "A wears red", url: null },
    evidenceB: { type: "video", description: "B wears blue", url: null },
    participantAId: "participant-a",
    participantBId: "participant-b",
    providerId: "openai",
    model: "gpt-4o-mini",
  };
  const ambiguous = await judgeChallenge({
    ...base,
    title: "羽毛球5个球的比赛",
    rules: "录视频判断谁赢",
  });
  assert.equal(ambiguous.winnerId, null);
  assert.match(ambiguous.reasoning, /must explicitly say/);

  const noVideo = await judgeChallenge({
    ...base,
    title: "Exactly five badminton rallies",
    rules: "Exactly 5 rallies; higher score wins.",
  });
  assert.equal(noVideo.winnerId, null);
  assert.match(noVideo.reasoning, /at least one shared, direct video/);
}

function frameSvg(rallyIndex: number, frameWithinRally: number, fps: number): Buffer {
  const winners: Array<"A" | "B"> = ["A", "B", "A", "B", "A"];
  const scores = [
    { A: 1, B: 0 },
    { A: 1, B: 1 },
    { A: 2, B: 1 },
    { A: 2, B: 2 },
    { A: 3, B: 2 },
  ];
  const secondsWithinRally = frameWithinRally / fps;
  const completed = secondsWithinRally >= 1;
  const winner = winners[rallyIndex - 1];
  const score = scores[rallyIndex - 1];
  const previous = rallyIndex === 1 ? { A: 0, B: 0 } : scores[rallyIndex - 2];
  const shuttleX = completed ? (winner === "A" ? 720 : 240) : 240 + Math.round(secondsWithinRally * 480);
  const headline = completed ? `RALLY ${rallyIndex} COMPLETE - POINT ${winner}` : `RALLY ${rallyIndex} IN PLAY`;
  const shownScore = completed ? score : previous;
  return Buffer.from(`
    <svg width="960" height="540" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="540" fill="#0b6b4f"/>
      <rect x="90" y="100" width="780" height="360" fill="#168a65" stroke="#fff" stroke-width="5"/>
      <line x1="480" y1="100" x2="480" y2="460" stroke="#fff" stroke-width="7"/>
      <circle cx="250" cy="290" r="54" fill="#ef4444" stroke="#fff" stroke-width="5"/>
      <circle cx="710" cy="290" r="54" fill="#2563eb" stroke="#fff" stroke-width="5"/>
      <circle cx="${shuttleX}" cy="215" r="14" fill="#fff" stroke="#111" stroke-width="3"/>
      <rect x="0" y="0" width="960" height="88" fill="#111827"/>
      <text x="480" y="37" text-anchor="middle" fill="#fff" font-family="Arial" font-size="27" font-weight="700">BADMINTON TEST - EXACTLY 5 RALLIES</text>
      <text x="480" y="72" text-anchor="middle" fill="#fff" font-family="Arial" font-size="24">Participant A = RED | Participant B = BLUE | continuous video</text>
      <rect x="170" y="390" width="620" height="112" rx="12" fill="rgba(0,0,0,0.82)"/>
      <text x="480" y="430" text-anchor="middle" fill="${completed ? "#fde047" : "#fff"}" font-family="Arial" font-size="32" font-weight="700">${headline}</text>
      <text x="480" y="480" text-anchor="middle" fill="#fff" font-family="Arial" font-size="37" font-weight="700">SCORE: A ${shownScore.A} - ${shownScore.B} B</text>
    </svg>
  `);
}

async function createSyntheticMatchVideo(directory: string): Promise<string> {
  assert.ok(ffmpegPath, "ffmpeg-static is required");
  const fps = 6;
  const framesPerRally = fps * 2;
  let frameNumber = 0;
  for (let rallyIndex = 1; rallyIndex <= 5; rallyIndex += 1) {
    for (let within = 0; within < framesPerRally; within += 1) {
      const png = await sharp(frameSvg(rallyIndex, within, fps)).png().toBuffer();
      await writeFile(join(directory, `frame-${String(frameNumber).padStart(4, "0")}.png`), png);
      frameNumber += 1;
    }
  }
  const videoPath = join(directory, "five-rally-badminton.mp4");
  await execFileAsync(ffmpegPath, [
    "-y",
    "-framerate", String(fps),
    "-i", join(directory, "frame-%04d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    videoPath,
  ], { timeout: 120_000 });
  return videoPath;
}

async function runLiveVideoPath(mediaOnly = false) {
  assert.ok(process.env.BLOB_READ_WRITE_TOKEN, "BLOB_READ_WRITE_TOKEN is required for --live");
  assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for --live");
  const directory = await mkdtemp(join(tmpdir(), "scored-match-live-"));
  let uploadedUrl: string | null = null;
  try {
    const videoPath = await createSyntheticMatchVideo(directory);
    const video = await import("node:fs/promises").then(({ readFile }) => readFile(videoPath));
    const blob = await put(`diagnostics/scored-match-${Date.now()}.mp4`, video, {
      access: "public",
      addRandomSuffix: true,
      contentType: "video/mp4",
    });
    uploadedUrl = blob.url;

    const prepared = await prepareScoredMatchTimeline("SOURCE-A", uploadedUrl);
    assert.ok(prepared.durationSec >= 9.5 && prepared.durationSec <= 10.5, `Unexpected duration ${prepared.durationSec}`);
    assert.ok(prepared.frameCount >= 18, `Expected at least 18 timeline frames, got ${prepared.frameCount}`);
    assert.ok(prepared.visuals.length >= 2, `Expected contact sheets, got ${prepared.visuals.length}`);
    const firstSheet = await sharp(Buffer.from(prepared.visuals[0].base64, "base64")).metadata();
    assert.deepEqual({ width: firstSheet.width, height: firstSheet.height }, { width: 1440, height: 810 });
    console.log(`REAL_MEDIA_PREPROCESS PASS duration=${prepared.durationSec.toFixed(2)}s frames=${prepared.frameCount} sheets=${prepared.visuals.length} size=1440x810`);

    const detailVisuals = await prepareRallyDetailVisuals("SOURCE-A", uploadedUrl, [
      { index: 1, endSec: 1.9 },
      { index: 2, endSec: 3.9 },
      { index: 3, endSec: 5.9 },
      { index: 4, endSec: 7.9 },
      { index: 5, endSec: 9.9 },
    ]);
    assert.ok(detailVisuals.length >= 10, `Expected dense detail sheets, got ${detailVisuals.length}`);
    const firstDetail = await sharp(Buffer.from(detailVisuals[0].base64, "base64")).metadata();
    assert.deepEqual({ width: firstDetail.width, height: firstDetail.height }, { width: 1440, height: 810 });
    console.log(`REAL_RALLY_WINDOWS PASS candidates=5 fps=8 sheets=${detailVisuals.length} size=1440x810`);
    if (mediaOnly) return;

    const providerId = process.env.ORACLE_DEFAULT_PROVIDER || "openai";
    const model = getProviderById(providerId)?.defaultModel;
    assert.ok(model, `Unknown live-test provider: ${providerId}`);
    const result = await judgeShortScoredMatch({
      title: "Exactly five badminton rallies",
      rules: "Exactly 5 rallies; higher score wins. Participant A wears red and Participant B wears blue. One continuous full-court video with score shown after every rally.",
      evidenceA: { type: "video", url: uploadedUrl, description: "Participant A is red; Participant B is blue; shared continuous match video." },
      evidenceB: { type: "video", url: uploadedUrl, description: "Same shared continuous match video; A is red and B is blue." },
      participantAId: "participant-a",
      participantBId: "participant-b",
      providerId,
      model,
    }, exactFive);

    assert.equal(result.winnerId, "participant-a", result.reasoning);
    assert.match(result.reasoning, /3-2/);
    assert.ok(result.confidence >= 0.75, `Expected >=0.75 confidence, got ${result.confidence}: ${result.reasoning}`);
    console.log(`LIVE_VIDEO_PATH PASS winner=participant-a confidence=${result.confidence.toFixed(2)} score=3-2`);
  } finally {
    if (uploadedUrl) await del(uploadedUrl).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  testContractCompiler();
  testDeterministicLedger();
  await testProductionJudgeInterception();
  console.log("PURE_RULES PASS 6 contract cases + 4 ledger cases");
  if (process.argv.includes("--media-only")) await runLiveVideoPath(true);
  else if (process.argv.includes("--live")) await runLiveVideoPath();
  else console.log("LIVE_VIDEO_PATH SKIPPED (run with --live)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
