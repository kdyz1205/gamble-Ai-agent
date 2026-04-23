/**
 * Pre-extract vision frames when evidence is submitted, so that when the judge
 * later runs we can skip ffmpeg entirely — just fetch already-normalized JPEGs
 * from Vercel Blob. This trades a one-time post-upload cost (user is done
 * uploading anyway) for a ~10-15s reduction in judge latency.
 *
 * Fast path (judge-time): prepareParticipantVisualsFast reads preparedFrames
 *                         URLs and fetches them in parallel.
 * Slow path (fallback):   prepareParticipantVisuals runs ffmpeg + sharp live.
 */

import { put } from "@vercel/blob";
import sharp from "sharp";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import prisma from "../db";
import {
  fetchBinaryCapped,
  isEvidenceUrlAllowed,
  isYouTubeUrl,
  looksLikeImageMime,
  looksLikeVideoMime,
} from "./evidence-url";
import { planVideoVisuals } from "./video-strategy";
import {
  ffprobeDurationFromUrl,
  extractScreenshotsFromUrl,
  extractSceneChangeFrames,
  ffmpegAvailable,
} from "./ffmpeg-helpers";

interface PrepareInput {
  evidenceId: string;
  challengeId: string;
  userId: string;
  type: string;
  url: string | null;
}

interface PrepareOutput {
  frames: string[];       // public URLs to normalized JPEGs
  durationSec: number | null;
  mode: "scene_change" | "uniform_fallback" | "photo" | "none";
  error: string | null;
}

function normalizeType(t: string): "video" | "photo" | "other" {
  const s = t.toLowerCase();
  if (s === "video") return "video";
  if (s === "photo" || s === "image" || s === "picture") return "photo";
  return "other";
}

async function normalizeJpegBuffer(buf: Buffer): Promise<Buffer | null> {
  try {
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    // vision providers cap ~5MB per image; leave margin.
    if (jpeg.length > 4.5 * 1024 * 1024) return null;
    return jpeg;
  } catch {
    return null;
  }
}

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

async function uploadFrame(
  challengeId: string,
  evidenceId: string,
  idx: number,
  jpeg: Buffer,
): Promise<string> {
  // Stable-ish path so we don't orphan: one evidenceId = one group of frames.
  // addRandomSuffix keeps it deterministic-per-attempt without clobbering.
  const pathname = `evidence-frames/${challengeId}/${evidenceId}/frame-${String(idx).padStart(3, "0")}.jpg`;
  const blob = await put(pathname, jpeg, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

/** Photo path: one normalized frame. */
async function preparePhoto(
  input: PrepareInput,
  url: string,
): Promise<PrepareOutput> {
  const { buffer } = await fetchBinaryCapped(url, 12 * 1024 * 1024);
  const jpeg = await normalizeJpegBuffer(buffer);
  if (!jpeg) {
    return { frames: [], durationSec: null, mode: "photo", error: "Image normalization failed (too large?)." };
  }
  const frameUrl = await uploadFrame(input.challengeId, input.evidenceId, 0, jpeg);
  return { frames: [frameUrl], durationSec: null, mode: "photo", error: null };
}

/** Video path: ffmpeg extract + sharp normalize + blob upload. */
async function prepareVideo(
  input: PrepareInput,
  url: string,
): Promise<PrepareOutput> {
  if (!ffmpegAvailable()) {
    return { frames: [], durationSec: null, mode: "none", error: "ffmpeg unavailable on host." };
  }

  const duration = await ffprobeDurationFromUrl(url);
  const plan = planVideoVisuals(duration);

  const tmp = await mkdtemp(join(tmpdir(), "preextract-"));
  try {
    let paths: string[];
    let mode: "scene_change" | "uniform_fallback" = "uniform_fallback";

    // One retry on transient failures (network blip, partial read).
    // Scene-change extraction can fail on weird codecs; if so we try uniform
    // once before giving up entirely.
    const tryExtract = async () => {
      if (plan.extractionMode === "scene_change") {
        const result = await extractSceneChangeFrames(url, plan.frameCount, tmp);
        return { paths: result.paths, mode: result.mode };
      }
      return {
        paths: await extractScreenshotsFromUrl(url, plan.frameCount, tmp),
        mode: "uniform_fallback" as const,
      };
    };

    try {
      const result = await tryExtract();
      paths = result.paths;
      mode = result.mode;
    } catch (firstErr) {
      console.warn("[pre-extract] first extraction attempt failed, retrying uniform:", firstErr);
      try {
        paths = await extractScreenshotsFromUrl(url, plan.frameCount, tmp);
        mode = "uniform_fallback";
      } catch (secondErr) {
        return {
          frames: [],
          durationSec: duration,
          mode: "none",
          error: secondErr instanceof Error ? secondErr.message.slice(0, 200) : String(secondErr),
        };
      }
    }

    if (paths.length === 0) {
      return { frames: [], durationSec: duration, mode, error: "No frames captured." };
    }

    const urls: string[] = [];
    for (let i = 0; i < paths.length; i++) {
      const raw = await readFile(paths[i]);
      const jpeg = await normalizeJpegBuffer(raw);
      if (!jpeg) continue;
      try {
        const blobUrl = await uploadFrame(input.challengeId, input.evidenceId, i, jpeg);
        urls.push(blobUrl);
      } catch (e) {
        // best-effort: skip this frame, keep the rest
        console.error("[pre-extract] frame upload failed", e);
      }
    }

    if (urls.length === 0) {
      return { frames: [], durationSec: duration, mode, error: "All frame uploads failed." };
    }

    return { frames: urls, durationSec: duration, mode, error: null };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function prepareFrames(input: PrepareInput): Promise<PrepareOutput> {
  if (!input.url?.trim()) {
    return { frames: [], durationSec: null, mode: "none", error: null };
  }
  if (!blobConfigured()) {
    return { frames: [], durationSec: null, mode: "none", error: "BLOB_READ_WRITE_TOKEN not set — frames can't be cached." };
  }
  if (!isEvidenceUrlAllowed(input.url)) {
    return { frames: [], durationSec: null, mode: "none", error: "URL rejected (public https only)." };
  }
  if (isYouTubeUrl(input.url)) {
    return { frames: [], durationSec: null, mode: "none", error: "YouTube pages can't be pre-extracted." };
  }

  const kind = normalizeType(input.type);
  try {
    if (kind === "photo" || (kind === "other" && looksLikeImageMime(null, input.url))) {
      return await preparePhoto(input, input.url);
    }
    if (kind === "video" || (kind === "other" && looksLikeVideoMime(null, input.url))) {
      return await prepareVideo(input, input.url);
    }
    // Ambiguous: sniff by fetching once
    const { buffer, contentType } = await fetchBinaryCapped(input.url, 12 * 1024 * 1024);
    if (looksLikeImageMime(contentType, input.url)) {
      const jpeg = await normalizeJpegBuffer(buffer);
      if (!jpeg) return { frames: [], durationSec: null, mode: "photo", error: "Image normalize failed." };
      const url = await uploadFrame(input.challengeId, input.evidenceId, 0, jpeg);
      return { frames: [url], durationSec: null, mode: "photo", error: null };
    }
    if (looksLikeVideoMime(contentType, input.url)) {
      return await prepareVideo(input, input.url);
    }
    return { frames: [], durationSec: null, mode: "none", error: "Unrecognized media type." };
  } catch (e) {
    return {
      frames: [],
      durationSec: null,
      mode: "none",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Fire-and-forget hook called from `after()` in the evidence POST route.
 * Writes results back to Evidence row; does NOT throw — errors are recorded
 * in Evidence.prepareError so the judge can fall back to the slow path
 * with full observability.
 */
export async function preExtractAndPersistFrames(input: PrepareInput): Promise<void> {
  const started = Date.now();
  try {
    const out = await prepareFrames(input);
    await prisma.evidence.update({
      where: { id: input.evidenceId },
      data: {
        preparedFrames: out.frames.length > 0 ? JSON.stringify(out.frames) : null,
        preparedAt: new Date(),
        preparedDurationSec: out.durationSec,
        preparedMode: out.mode,
        prepareError: out.error,
      },
    });
    const ms = Date.now() - started;
    console.log(
      `[pre-extract] evidence=${input.evidenceId} frames=${out.frames.length} mode=${out.mode} dur=${out.durationSec ?? "?"}s in ${ms}ms${out.error ? ` error="${out.error}"` : ""}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await prisma.evidence.update({
        where: { id: input.evidenceId },
        data: {
          preparedFrames: null,
          preparedAt: new Date(),
          prepareError: msg.slice(0, 500),
          preparedMode: "none",
        },
      });
    } catch {
      /* db update best-effort */
    }
    console.error(`[pre-extract] evidence=${input.evidenceId} failed:`, msg);
  }
}
