import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const execFile = promisify(execFileCallback);
const outDir = path.resolve("public", "e2e-fixtures");
const phrase = "Axelrod VIDEO-E2E-STATIC";

function pushupPhaseAt(repCount, durationSec, elapsedSec) {
  const cycleSec = durationSec / repCount;
  const within = (elapsedSec % cycleSec) / cycleSec;
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

function svgFrame({ role, color, phase, elapsedSec, durationSec, variant = "clean" }) {
  const dark = variant === "dark_blurry";
  const cropped = variant === "cropped" || variant === "partial_body";
  const badAngle = variant === "bad_angle";
  const noVisibleRole = variant === "no_text_label" || variant === "no_text_static";
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
  ${noVisibleRole ? "" : `<text x="70" y="132" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="${color}">${role}</text>`}
  <text x="70" y="176" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${dark ? "#475569" : "#0f172a"}">Timer ${elapsedLabel} / 01:00</text>
  <text x="70" y="216" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="${dark ? "#475569" : "#334155"}">Challenge phrase: ${phrase}</text>
  <rect x="70" y="238" width="280" height="10" rx="5" fill="#cbd5e1"/>
  <rect x="70" y="238" width="${Math.max(6, Math.round((elapsedSec / durationSec) * 280))}" height="10" rx="5" fill="${color}"/>
  <g ${transform} ${clipAttr} ${blur}>${body}</g>
</svg>`;
}

async function makeVideo({ filename, role, color, repCount, durationSec = 60, variant = "clean" }) {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve an ffmpeg binary");
  const tmp = path.join(tmpdir(), `gamble-public-fixture-${filename}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    const framePaths = [];
    for (let i = 0; i < durationSec; i += 1) {
      const elapsedSec = variant === "static_loop" || variant === "no_text_static" ? 0 : i;
      const phase = variant === "static_loop" || variant === "no_text_static" ? "top" : pushupPhaseAt(repCount, durationSec, elapsedSec);
      const svg = svgFrame({ role, color, phase, elapsedSec, durationSec, variant });
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
    repCount: 12,
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
    repCount: 12,
    variant: "static_loop",
  }),
  await makeVideo({
    filename: "pushups-d-static-phrase.mp4",
    role: "PARTICIPANT B",
    color: "#b91c1c",
    repCount: 6,
    variant: "static_loop",
  }),
  await makeVideo({ filename: "pushups-bad-angle-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 12, variant: "bad_angle" }),
  await makeVideo({ filename: "pushups-bad-angle-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 6, variant: "bad_angle" }),
  await makeVideo({ filename: "pushups-partial-body-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 12, variant: "partial_body" }),
  await makeVideo({ filename: "pushups-partial-body-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 6, variant: "partial_body" }),
  await makeVideo({ filename: "pushups-dark-blurry-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 12, variant: "dark_blurry" }),
  await makeVideo({ filename: "pushups-dark-blurry-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 6, variant: "dark_blurry" }),
  await makeVideo({ filename: "pushups-cropped-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 12, variant: "cropped" }),
  await makeVideo({ filename: "pushups-cropped-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 6, variant: "cropped" }),
  await makeVideo({ filename: "pushups-short-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 6, durationSec: 20 }),
  await makeVideo({ filename: "pushups-short-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 3, durationSec: 20 }),
  await makeVideo({ filename: "pushups-tie-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 8 }),
  await makeVideo({ filename: "pushups-tie-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 8 }),
  await makeVideo({ filename: "pushups-non-pushup-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 4 }),
  await makeVideo({ filename: "pushups-non-pushup-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 1, variant: "non_pushup" }),
  await makeVideo({ filename: "pushups-no-label-a-static-phrase.mp4", role: "PARTICIPANT A", color: "#047857", repCount: 12, variant: "no_text_label" }),
  await makeVideo({ filename: "pushups-no-label-b-static-phrase.mp4", role: "PARTICIPANT B", color: "#b91c1c", repCount: 1, variant: "no_text_label" }),
];

console.log(JSON.stringify({ phrase, outputs }, null, 2));
