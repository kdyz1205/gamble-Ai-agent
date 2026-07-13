import sharp from "sharp";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { fetchBinaryCapped, isEvidenceUrlAllowed } from "./evidence-url";
import {
  extractTimelineFrames,
  extractTimestampedRallyWindow,
  ffprobeDurationFromUrl,
  type TimestampedFrame,
} from "./ffmpeg-helpers";
import type { JudgeVisionImage } from "./prepare-evidence-visuals";

const SHEET_COLUMNS = 3;
const SHEET_ROWS = 3;
const TIMELINE_TILE_WIDTH = 480;
const TIMELINE_TILE_HEIGHT = 270;
const DETAIL_TILE_WIDTH = 640;
const DETAIL_TILE_HEIGHT = 360;
const FRAMES_PER_SHEET = SHEET_COLUMNS * SHEET_ROWS;
const MAX_SHEETS = 24;
const MAX_TIMELINE_FRAMES = FRAMES_PER_SHEET * MAX_SHEETS;

export interface ScoredTimelineVisuals {
  durationSec: number;
  framesPerSecond: number;
  frameCount: number;
  visuals: JudgeVisionImage[];
}

export interface RallyWindowCandidate {
  index: number;
  endSec: number;
}

export interface ScoredRallyDetailVisuals {
  framesPerSecond: number;
  frameCount: number;
  visuals: JudgeVisionImage[];
}

function timestampLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function labeledTile(
  frame: TimestampedFrame,
  sourceLabel: string,
  tileWidth: number,
  tileHeight: number,
): Promise<Buffer> {
  const rally = frame.rallyIndex != null ? `R${frame.rallyIndex} ` : "";
  const label = `${sourceLabel} ${rally}${timestampLabel(frame.timestampSec)}`;
  const overlay = Buffer.from(`
    <svg width="${tileWidth}" height="${tileHeight}">
      <rect x="0" y="${tileHeight - 46}" width="${tileWidth}" height="46" fill="rgba(0,0,0,0.82)" />
      <text x="12" y="${tileHeight - 15}" fill="#ffffff" font-family="Arial, sans-serif" font-size="25" font-weight="700">${escapeXml(label)}</text>
    </svg>
  `);
  return sharp(frame.path)
    .resize(tileWidth, tileHeight, { fit: "fill" })
    .composite([{ input: overlay, left: 0, top: 0 }])
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

async function framesToContactSheets(
  frames: TimestampedFrame[],
  sourceLabel: string,
  tileWidth = TIMELINE_TILE_WIDTH,
  tileHeight = TIMELINE_TILE_HEIGHT,
): Promise<JudgeVisionImage[]> {
  const visuals: JudgeVisionImage[] = [];
  const limited = frames.slice(0, MAX_TIMELINE_FRAMES);
  for (let offset = 0; offset < limited.length; offset += FRAMES_PER_SHEET) {
    const batch = limited.slice(offset, offset + FRAMES_PER_SHEET);
    const tiles = await Promise.all(batch.map((frame) => labeledTile(frame, sourceLabel, tileWidth, tileHeight)));
    const sheet = await sharp({
      create: {
        width: SHEET_COLUMNS * tileWidth,
        height: SHEET_ROWS * tileHeight,
        channels: 3,
        background: { r: 8, g: 12, b: 20 },
      },
    })
      .composite(tiles.map((input, index) => ({
        input,
        left: (index % SHEET_COLUMNS) * tileWidth,
        top: Math.floor(index / SHEET_COLUMNS) * tileHeight,
      })))
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    const first = batch[0];
    const last = batch[batch.length - 1];
    visuals.push({
      caption: `${sourceLabel} timeline ${timestampLabel(first.timestampSec)}-${timestampLabel(last.timestampSec)}`,
      mimeType: "image/jpeg",
      base64: sheet.toString("base64"),
    });
  }
  return visuals;
}

export function planScoredTimeline(durationSec: number): { framesPerSecond: number; frameCount: number } {
  const desiredFps = 2;
  const framesPerSecond = Math.min(desiredFps, MAX_TIMELINE_FRAMES / durationSec);
  return {
    framesPerSecond,
    frameCount: Math.min(MAX_TIMELINE_FRAMES, Math.ceil(durationSec * framesPerSecond)),
  };
}

export function planRallyDetailFps(candidateCount: number): number {
  if (candidateCount <= 0) return 0;
  const threeSecondWindows = candidateCount * 3;
  return Math.min(12, MAX_TIMELINE_FRAMES / threeSecondWindows);
}

/**
 * First pass: a complete, ordered match timeline with real timestamps burned
 * into the pixels. Scene-change sampling is intentionally not used here.
 */
export async function prepareScoredMatchTimeline(
  sourceLabel: string,
  url: string,
): Promise<ScoredTimelineVisuals> {
  if (!isEvidenceUrlAllowed(url)) throw new Error("Scored-match video must be a direct public HTTPS URL.");
  const durationSec = await ffprobeDurationFromUrl(url);
  if (durationSec == null) throw new Error("Could not measure scored-match video duration.");
  if (durationSec > 240) throw new Error("Short-match automatic judging requires a continuous video of 4 minutes or less.");

  const plan = planScoredTimeline(durationSec);
  if (plan.framesPerSecond < 0.9) {
    throw new Error(`Timeline density ${plan.framesPerSecond.toFixed(2)}fps is too low for reliable rally detection.`);
  }

  const temp = await mkdtemp(join(tmpdir(), "scored-timeline-"));
  try {
    const frames = await extractTimelineFrames(url, plan.framesPerSecond, plan.frameCount, temp);
    if (frames.length < 3) throw new Error("Too few timeline frames were extracted.");
    return {
      durationSec,
      framesPerSecond: plan.framesPerSecond,
      frameCount: frames.length,
      visuals: await framesToContactSheets(frames, sourceLabel),
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/** Second pass: 8fps windows around each candidate rally ending. */
export async function prepareRallyDetailVisuals(
  sourceLabel: string,
  url: string,
  candidates: RallyWindowCandidate[],
): Promise<ScoredRallyDetailVisuals> {
  if (!isEvidenceUrlAllowed(url)) throw new Error("Scored-match video must be a direct public HTTPS URL.");
  const temp = await mkdtemp(join(tmpdir(), "scored-detail-"));
  try {
    // Download once, then seek all rally windows locally. Seeking the remote
    // URL once per rally multiplies latency and bandwidth by up to 11x.
    const localVideo = join(temp, "source-video");
    const { buffer } = await fetchBinaryCapped(url, 160 * 1024 * 1024, 180_000);
    await writeFile(localVideo, buffer);
    const frameGroups: TimestampedFrame[][] = [];
    const limitedCandidates = candidates.slice(0, 11);
    const framesPerSecond = planRallyDetailFps(limitedCandidates.length);
    for (const candidate of limitedCandidates) {
      // Keep every image sequence isolated. ffmpeg's image2 muxer may clean
      // stale sequence members when another sequence is written nearby.
      const rallyDirectory = join(temp, `window-${String(candidate.index).padStart(2, "0")}`);
      await mkdir(rallyDirectory);
      frameGroups.push(await extractTimestampedRallyWindow(
        localVideo,
        candidate.index,
        candidate.endSec,
        rallyDirectory,
        {
          beforeSec: 1.5,
          afterSec: 1.5,
          fps: framesPerSecond,
          width: DETAIL_TILE_WIDTH,
          height: DETAIL_TILE_HEIGHT,
        },
      ));
    }
    const frames = frameGroups.flat().slice(0, MAX_TIMELINE_FRAMES);
    if (frames.length === 0) throw new Error("No dense rally-ending frames were extracted.");
    // Await before `finally` removes the frame files backing the sharp jobs.
    return {
      framesPerSecond,
      frameCount: frames.length,
      visuals: await framesToContactSheets(
        frames,
        sourceLabel,
        DETAIL_TILE_WIDTH,
        DETAIL_TILE_HEIGHT,
      ),
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
