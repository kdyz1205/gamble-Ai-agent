/**
 * Turn evidence URLs into JPEG tiles the vision models can actually see.
 * Video: duration-based frame budget via ffmpeg; image: fetch + sharp normalize.
 */

import sharp from "sharp";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { EvidencePayload } from "../evidence-types";
import {
  fetchBinaryCapped,
  isEvidenceUrlAllowed,
  isYouTubeUrl,
  looksLikeImageMime,
  looksLikeVideoMime,
} from "./evidence-url";
import { planVideoVisuals } from "./video-strategy";
import { ffprobeDurationFromUrl, extractScreenshotsFromUrl, extractSceneChangeFrames, ffmpegAvailable } from "./ffmpeg-helpers";

export interface JudgeVisionImage {
  caption: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64: string;
}

function pickEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max <= 1) return [items[0]];
  return Array.from({ length: max }, (_, i) => {
    const idx = Math.round((i * (items.length - 1)) / (max - 1));
    return items[idx];
  });
}

function pickMotionDiverse<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max <= 1) return [items[Math.floor(items.length / 2)]];

  const picked: T[] = [];
  const used = new Set<number>();
  const fractions = [0.2, 0.55, 0.85, 0.35, 0.7];

  for (let i = 0; i < max; i += 1) {
    const start = (i * items.length) / max;
    const end = ((i + 1) * items.length) / max;
    const raw = Math.floor(start + Math.max(0.01, end - start) * fractions[i % fractions.length]);
    let idx = Math.min(items.length - 1, Math.max(0, raw));
    while (used.has(idx) && idx < items.length - 1) idx += 1;
    while (used.has(idx) && idx > 0) idx -= 1;
    if (!used.has(idx)) {
      used.add(idx);
      picked.push(items[idx]);
    }
  }

  return picked.sort((left, right) => items.indexOf(left) - items.indexOf(right));
}

async function bufferToVisionImage(buffer: Buffer, caption: string): Promise<JudgeVisionImage | null> {
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  if (jpeg.length > 4.5 * 1024 * 1024) return null;
  return { caption, mimeType: "image/jpeg", base64: jpeg.toString("base64") };
}

async function buildFilmstripImage(
  participantLabel: string,
  frames: Array<{ index: number; buffer: Buffer }>,
  opts?: { durationSec?: number | null; mode?: string | null },
): Promise<JudgeVisionImage | null> {
  if (frames.length < 2) return null;

  const picked = pickEvenly(frames, 16);
  const tileW = 220;
  const tileH = 140;
  const labelH = 26;
  const cols = Math.min(4, picked.length);
  const rows = Math.ceil(picked.length / cols);
  const headerH = 52;
  const width = cols * tileW;
  const height = headerH + rows * (tileH + labelH);

  const composites: sharp.OverlayOptions[] = [];
  const header = Buffer.from(`
    <svg width="${width}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0f172a"/>
      <text x="12" y="22" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#f8fafc">${participantLabel} ordered video filmstrip</text>
      <text x="12" y="42" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#cbd5e1">Read left to right, top to bottom. ${opts?.durationSec ? `~${Math.round(opts.durationSec)}s` : "duration unknown"}${opts?.mode ? `, ${opts.mode}` : ""}</text>
    </svg>`);
  composites.push({ input: header, left: 0, top: 0 });

  for (let i = 0; i < picked.length; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * tileW;
    const top = headerH + row * (tileH + labelH);
    const frame = await sharp(picked[i].buffer)
      .rotate()
      .resize(tileW, tileH, { fit: "contain", background: "#f8fafc" })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    const approxSec =
      opts?.durationSec != null && frames.length > 0
        ? Math.round(((picked[i].index + 1) / (frames.length + 1)) * opts.durationSec)
        : null;
    const label = Buffer.from(`
      <svg width="${tileW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="8" y="18" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#f8fafc">#${picked[i].index + 1}${approxSec != null ? ` ~${approxSec}s` : ""}</text>
      </svg>`);
    composites.push({ input: frame, left, top });
    composites.push({ input: label, left, top: top + tileH });
  }

  const jpeg = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#020617",
    },
  })
    .composite(composites)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  if (jpeg.length > 4.5 * 1024 * 1024) return null;
  return {
    caption:
      `${participantLabel} - ordered filmstrip summary (${picked.length} frame(s)` +
      `${opts?.durationSec ? ` across ~${Math.round(opts.durationSec)}s` : ""}). Count motion by reading the strip in order.`,
    mimeType: "image/jpeg",
    base64: jpeg.toString("base64"),
  };
}

function isPhotoType(e: EvidencePayload): boolean {
  const t = e.type.toLowerCase();
  return t === "photo" || t === "image" || t === "picture";
}

function isVideoType(e: EvidencePayload): boolean {
  return e.type.toLowerCase() === "video";
}

function sniffIsJpeg(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

function sniffIsPng(buf: Buffer): boolean {
  return (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

function sniffIsGif(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
}

function sniffIsWebp(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
}

function sniffIsMp4(buf: Buffer): boolean {
  // 'ftyp' box typically at offset 4
  if (buf.length < 12) return false;
  return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
}

async function runVideoPipeline(
  participantLabel: string,
  url: string,
  preambleLines: string[],
): Promise<{ preambleLines: string[]; visuals: JudgeVisionImage[] }> {
  const visuals: JudgeVisionImage[] = [];
  if (!ffmpegAvailable()) {
    preambleLines.push(
      `  → Video URL present but ffmpeg binaries are unavailable on this host — set up ffmpeg or use direct image URLs.`,
    );
    return { preambleLines, visuals };
  }

  const duration = await ffprobeDurationFromUrl(url);
  const plan = planVideoVisuals(duration);
  preambleLines.push(`  → Video: ${plan.label} (fetch/stream handled by ffmpeg; cap hint ${Math.round(plan.maxDownloadBytes / (1024 * 1024))}MB).`);

  const tmp = await mkdtemp(join(tmpdir(), "evidence-vid-"));
  try {
    let paths: string[];
    let extractionLabel: string;

    if (plan.extractionMode === "scene_change") {
      const result = await extractSceneChangeFrames(url, plan.frameCount, tmp);
      paths = result.paths;
      extractionLabel = result.mode === "scene_change"
        ? "scene-change detected"
        : "uniform fallback (scene detection yielded too few)";
    } else {
      paths = await extractScreenshotsFromUrl(url, plan.frameCount, tmp);
      extractionLabel = "evenly spaced";
    }
    preambleLines.push(`  → Extraction mode: ${extractionLabel}, ${paths.length} frames captured.`);

    const frameBuffers = await Promise.all(
      paths.map(async (framePath, index) => ({ index, buffer: await readFile(framePath) })),
    );
    const filmstrip = await buildFilmstripImage(participantLabel, frameBuffers, {
      durationSec: duration,
      mode: extractionLabel,
    });
    if (filmstrip) visuals.push(filmstrip);

    const n = paths.length;
    for (let i = 0; i < n; i++) {
      const buf = await readFile(paths[i]);
      const approxSec =
        duration != null && n > 0 ? Math.round(((i + 1) / (n + 1)) * duration) : i + 1;
      const cap =
        duration != null
          ? `${participantLabel} — video frame ${i + 1}/${n} (~${approxSec}s of ~${Math.round(duration)}s) [${extractionLabel}]`
          : `${participantLabel} — video frame ${i + 1}/${n} [${extractionLabel}]`;
      const img = await bufferToVisionImage(buf, cap);
      if (img) visuals.push(img);
    }
  } catch (e) {
    preambleLines.push(`  → Video frame extraction failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  return { preambleLines, visuals };
}

export async function prepareParticipantVisuals(
  participantLabel: string,
  evidence: EvidencePayload | null,
): Promise<{ preambleLines: string[]; visuals: JudgeVisionImage[] }> {
  const preambleLines: string[] = [];
  const visuals: JudgeVisionImage[] = [];

  if (!evidence) {
    preambleLines.push(`${participantLabel}: (none submitted)`);
    return { preambleLines, visuals };
  }

  const meta = [
    `type=${evidence.type}`,
    evidence.description ? `description=${evidence.description}` : null,
    evidence.url ? `url=${evidence.url}` : null,
  ].filter(Boolean);
  preambleLines.push(`${participantLabel}: ${meta.join(" | ")}`);

  const url = evidence.url?.trim();
  if (!url) return { preambleLines, visuals };

  if (!isEvidenceUrlAllowed(url)) {
    preambleLines.push(`  → URL rejected for safety (public https file URLs only).`);
    return { preambleLines, visuals };
  }

  if (isYouTubeUrl(url)) {
    preambleLines.push(
      `  → YouTube pages cannot be fetched as raw media here — link a direct MP4/WebM (HTTPS) or image for automatic vision.`,
    );
    return { preambleLines, visuals };
  }

  try {
    if (isPhotoType(evidence) || looksLikeImageMime(null, url)) {
      const { buffer } = await fetchBinaryCapped(url, 12 * 1024 * 1024);
      const img = await bufferToVisionImage(buffer, `${participantLabel} — submitted image`);
      if (img) visuals.push(img);
      else preambleLines.push(`  → Image could not be normalized within model size limits.`);
      return { preambleLines, visuals };
    }

    if (isVideoType(evidence) || looksLikeVideoMime(null, url)) {
      return await runVideoPipeline(participantLabel, url, preambleLines);
    }

    // Ambiguous (e.g. text evidence with attachment URL): sniff body
    const { buffer, contentType } = await fetchBinaryCapped(url, 12 * 1024 * 1024);
    if (looksLikeImageMime(contentType, url) || sniffIsJpeg(buffer) || sniffIsPng(buffer) || sniffIsGif(buffer) || sniffIsWebp(buffer)) {
      const img = await bufferToVisionImage(buffer, `${participantLabel} — submitted image`);
      if (img) visuals.push(img);
      else preambleLines.push(`  → Image decode/resize failed.`);
      return { preambleLines, visuals };
    }

    if (looksLikeVideoMime(contentType, url) || sniffIsMp4(buffer)) {
      return await runVideoPipeline(participantLabel, url, preambleLines);
    }

    preambleLines.push(`  → URL is not a recognized image/video stream for auto vision.`);
    return { preambleLines, visuals };
  } catch (e) {
    preambleLines.push(`  → Media fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    return { preambleLines, visuals };
  }
}

/**
 * Keep provider latency/cost bounded, with TWO caps:
 *  1. maxTotal images (default 24)
 *  2. maxTotalBytes aggregate payload (default 12 MB)
 * Previously we only capped count, which meant a single participant uploading
 * 24 frames close to 4.5 MB each could push 100 MB+ of base64 payload to
 * the vision provider — slow, expensive, and sometimes rejected. Now we
 * progressively drop frames (starting from the denser side) until payload
 * fits the byte budget.
 */
export function capJudgeVisuals(
  a: JudgeVisionImage[],
  b: JudgeVisionImage[],
  maxTotal = 24,
  maxTotalBytes = 12 * 1024 * 1024,
): JudgeVisionImage[] {
  const participantBudget = (leftCount: number, rightCount: number) => {
    const leftBase = Math.min(leftCount, Math.floor(maxTotal / 2));
    const rightBase = Math.min(rightCount, maxTotal - leftBase);
    let left = leftBase;
    let right = rightBase;
    let spare = maxTotal - left - right;
    while (spare > 0 && (left < leftCount || right < rightCount)) {
      if (left < leftCount) {
        left += 1;
        spare -= 1;
      }
      if (spare > 0 && right < rightCount) {
        right += 1;
        spare -= 1;
      }
    }
    return { left, right };
  };

  const isFilmstrip = (item: JudgeVisionImage) => /filmstrip/i.test(item.caption);
  const capParticipant = (items: JudgeVisionImage[], budget: number) => {
    if (items.length <= budget) return items;
    if (budget <= 0) return [];
    const filmstrip = items.find(isFilmstrip);
    const frames = items.filter((item) => item !== filmstrip);
    const frameBudget = Math.max(0, budget - (filmstrip ? 1 : 0));
    return [...(filmstrip ? [filmstrip] : []), ...pickMotionDiverse(frames, frameBudget)];
  };

  const budget = participantBudget(a.length, b.length);
  let picked = [...capParticipant(a, budget.left), ...capParticipant(b, budget.right)];
  // Estimate payload by base64 length (each char = 1 byte).
  const size = (arr: JudgeVisionImage[]) => arr.reduce((acc, im) => acc + im.base64.length, 0);
  while (size(picked) > maxTotalBytes && picked.length > 2) {
    const reduced = picked.filter((item, i) => isFilmstrip(item) || i % 2 === 0);
    if (reduced.length === picked.length) break;
    picked = reduced;
  }
  return picked;
}

/**
 * FAST path used by the judge when evidence.preparedFrames has already been
 * populated by the evidence POST hook. Skips ffmpeg entirely — just fetches
 * the already-normalized JPEGs (public Blob URLs) in parallel.
 *
 * Returns null if no prepared frames exist so the caller falls back to the
 * live extraction path.
 */
export async function prepareParticipantVisualsFast(
  participantLabel: string,
  preparedFrames: string[],
  opts?: { durationSec?: number | null; mode?: string | null },
): Promise<{ preambleLines: string[]; visuals: JudgeVisionImage[] } | null> {
  if (!Array.isArray(preparedFrames) || preparedFrames.length === 0) return null;
  const preambleLines: string[] = [];
  const visuals: JudgeVisionImage[] = [];
  preambleLines.push(
    `${participantLabel}: ${preparedFrames.length} pre-extracted frame(s)${opts?.mode ? ` [${opts.mode}]` : ""}${opts?.durationSec ? ` (~${Math.round(opts.durationSec)}s video)` : ""} — served from cache.`,
  );

  const n = preparedFrames.length;
  const fetched = await Promise.all(
    preparedFrames.map(async (url, i) => {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        // Frames were already normalized at pre-extract time — don't re-encode.
        if (buf.length > 4.5 * 1024 * 1024) return null;
        const approxSec =
          opts?.durationSec != null && n > 0
            ? Math.round(((i + 1) / (n + 1)) * opts.durationSec)
            : null;
        const caption =
          approxSec != null
            ? `${participantLabel} — frame ${i + 1}/${n} (~${approxSec}s)`
            : `${participantLabel} — frame ${i + 1}/${n}`;
        return {
          index: i,
          buffer: buf,
          image: { caption, mimeType: "image/jpeg" as const, base64: buf.toString("base64") },
        };
      } catch {
        return null;
      }
    }),
  );
  const valid = fetched.filter((item): item is NonNullable<typeof item> => Boolean(item));
  const filmstrip = await buildFilmstripImage(
    participantLabel,
    valid.map((item) => ({ index: item.index, buffer: item.buffer })),
    opts,
  );
  if (filmstrip) visuals.push(filmstrip);
  const maxIndividualFrames = filmstrip ? 16 : 20;
  for (const f of pickEvenly(valid, maxIndividualFrames)) {
    visuals.push(f.image);
  }
  if (visuals.length === 0) {
    preambleLines.push(`  → All pre-extracted frame fetches failed; falling back to slow path.`);
    return null;
  }
  return { preambleLines, visuals };
}
