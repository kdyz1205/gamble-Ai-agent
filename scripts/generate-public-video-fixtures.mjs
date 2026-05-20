import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const execFile = promisify(execFileCallback);
const outDir = path.resolve("public", "e2e-fixtures");
const phrase = "GambleAI VIDEO-E2E-STATIC";

function pushupPhaseAt(repCount, durationSec, elapsedSec) {
  const cycleSec = durationSec / repCount;
  const within = (elapsedSec % cycleSec) / cycleSec;
  if (within < 0.12 || within > 0.88) return "top";
  if (within > 0.30 && within < 0.70) return "down";
  return "transition";
}

function svgFrame({ role, color, phase, elapsedSec, durationSec }) {
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
  <text x="70" y="88" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="#111827">Push-up video proof</text>
  <text x="70" y="132" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="${color}">${role}</text>
  <text x="70" y="176" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#0f172a">Timer ${elapsedLabel} / 01:00</text>
  <text x="70" y="216" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="#334155">Challenge phrase: ${phrase}</text>
  <rect x="70" y="238" width="280" height="10" rx="5" fill="#cbd5e1"/>
  <rect x="70" y="238" width="${Math.max(6, Math.round((elapsedSec / durationSec) * 280))}" height="10" rx="5" fill="${color}"/>
  <line x1="120" y1="390" x2="840" y2="390" stroke="#64748b" stroke-width="8" stroke-linecap="round"/>
  <circle cx="292" cy="${headY}" r="28" fill="${color}"/>
  <line x1="340" y1="${shoulderY}" x2="540" y2="${hipY}" stroke="${color}" stroke-width="26" stroke-linecap="round"/>
  <line x1="540" y1="${hipY}" x2="720" y2="${ankleY}" stroke="${color}" stroke-width="24" stroke-linecap="round"/>
  <line x1="360" y1="${shoulderY + 8}" x2="330" y2="${elbowY}" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <line x1="330" y1="${elbowY}" x2="320" y2="390" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <line x1="450" y1="${shoulderY + 14}" x2="430" y2="${elbowY}" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <line x1="430" y1="${elbowY}" x2="420" y2="390" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <circle cx="724" cy="${ankleY}" r="15" fill="#0f172a"/>
</svg>`;
}

async function makeVideo({ filename, role, color, repCount, staticPose = false }) {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve an ffmpeg binary");
  const durationSec = 60;
  const tmp = path.join(tmpdir(), `gamble-public-fixture-${filename}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    const framePaths = [];
    for (let i = 0; i < durationSec; i += 1) {
      const phase = staticPose ? "top" : pushupPhaseAt(repCount, durationSec, i);
      const svg = svgFrame({ role, color, phase, elapsedSec: i, durationSec });
      const framePath = path.join(tmp, `${String(i).padStart(2, "0")}.png`);
      await sharp(Buffer.from(svg)).png().toFile(framePath);
      framePaths.push(framePath);
    }

    const concatPath = path.join(tmp, "frames.txt");
    const concatBody = framePaths
      .map((framePath) => `file '${framePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'\nduration 1.0`)
      .join("\n");
    await writeFile(concatPath, `${concatBody}\nfile '${framePaths.at(-1).replace(/\\/g, "/").replace(/'/g, "'\\''")}'\n`, "utf8");

    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, filename);
    await execFile(ffmpegPath, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-vf", "fps=1,format=yuv420p",
      "-movflags", "+faststart",
      outPath,
    ], { windowsHide: true });
    return outPath;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

const outputs = [
  await makeVideo({
    filename: "pushups-a-static-phrase.mp4",
    role: "PARTICIPANT A",
    color: "#047857",
    repCount: 4,
  }),
  await makeVideo({
    filename: "pushups-b-static-phrase.mp4",
    role: "PARTICIPANT B",
    color: "#b91c1c",
    repCount: 1,
  }),
  await makeVideo({
    filename: "pushups-c-static-phrase.mp4",
    role: "PARTICIPANT A",
    color: "#047857",
    repCount: 1,
    staticPose: true,
  }),
  await makeVideo({
    filename: "pushups-d-static-phrase.mp4",
    role: "PARTICIPANT B",
    color: "#b91c1c",
    repCount: 1,
    staticPose: true,
  }),
];

console.log(JSON.stringify({ phrase, outputs }, null, 2));
