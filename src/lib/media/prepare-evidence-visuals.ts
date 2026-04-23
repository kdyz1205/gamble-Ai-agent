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

async function bufferToVisionImage(buffer: Buffer, caption: string): Promise<JudgeVisionImage | null> {
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  if (jpeg.length > 4.5 * 1024 * 1024) return null;
  return { caption, mimeType: "image/jpeg", base64: jpeg.toString("base64") };
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

/** Keep provider latency/cost bounded. */
export function capJudgeVisuals(a: JudgeVisionImage[], b: JudgeVisionImage[], maxTotal = 24): JudgeVisionImage[] {
  const all = [...a, ...b];
  if (all.length <= maxTotal) return all;
  const step = Math.ceil(all.length / maxTotal);
  return all.filter((_, i) => i % step === 0).slice(0, maxTotal);
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
        const res = await fetch(url, { cache: "no-store" });
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
        return { caption, mimeType: "image/jpeg" as const, base64: buf.toString("base64") };
      } catch {
        return null;
      }
    }),
  );
  for (const f of fetched) if (f) visuals.push(f);
  if (visuals.length === 0) {
    preambleLines.push(`  → All pre-extracted frame fetches failed; falling back to slow path.`);
    return null;
  }
  return { preambleLines, visuals };
}
