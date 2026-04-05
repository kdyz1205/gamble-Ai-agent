/**
 * Optional local ffmpeg/ffprobe (bundled binaries). Used for video duration + frame grab.
 * Supports three extraction modes:
 *  1. Uniform — evenly spaced (legacy default)
 *  2. Scene-change — ffmpeg scene-detection filter for action-dense areas
 *  3. Highlight — dense 4fps around a user-provided timestamp
 */

import { readdir } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

let configured = false;

export function ffmpegAvailable(): boolean {
  return Boolean(ffmpegPath && ffprobeStatic.path);
}

function ensureConfigured(): boolean {
  if (configured) return ffmpegAvailable();
  configured = true;
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  if (ffprobeStatic.path) ffmpeg.setFfprobePath(ffprobeStatic.path);
  return ffmpegAvailable();
}

export function ffprobeDurationFromUrl(url: string, timeoutMs = 45_000): Promise<number | null> {
  if (!ensureConfigured()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    ffmpeg.ffprobe(url, (err, meta) => {
      clearTimeout(t);
      if (err) return resolve(null);
      const d = Number(meta.format?.duration);
      resolve(Number.isFinite(d) && d > 0 ? d : null);
    });
  });
}

async function collectJpgs(outDir: string): Promise<string[]> {
  const names = await readdir(outDir);
  return names
    .filter((n) => n.endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((n) => join(outDir, n));
}

/** Evenly spaced JPEG screenshots saved to folder; returns absolute file paths sorted. */
export function extractScreenshotsFromUrl(
  url: string,
  count: number,
  outDir: string,
  timeoutMs = 180_000,
): Promise<string[]> {
  if (!ensureConfigured()) return Promise.reject(new Error("ffmpeg/ffprobe not available"));
  if (count <= 0) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ffmpeg screenshot timeout")), timeoutMs);
    ffmpeg(url)
      .screenshots({
        count,
        folder: outDir,
        filename: "evidence-%i.jpg",
        size: "1280x?",
      })
      .on("end", async () => {
        clearTimeout(t);
        try {
          resolve(await collectJpgs(outDir));
        } catch (e) {
          reject(e);
        }
      })
      .on("error", (err: Error) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

/**
 * Scene-change detection: uses ffmpeg's select filter to grab frames at visual
 * cuts/transitions. Captures moments where the pixel difference between consecutive
 * frames exceeds a threshold — exactly the "action" frames uniform sampling misses.
 *
 * Falls back to uniform extraction if scene detection yields too few frames.
 */
export async function extractSceneChangeFrames(
  url: string,
  maxFrames: number,
  outDir: string,
  timeoutMs = 180_000,
): Promise<{ paths: string[]; mode: "scene_change" | "uniform_fallback" }> {
  if (!ensureConfigured()) throw new Error("ffmpeg/ffprobe not available");
  if (maxFrames <= 0) return { paths: [], mode: "scene_change" };

  const bin = ffmpegPath!;
  const outPattern = join(outDir, "scene-%04d.jpg");

  // scene threshold 0.25 = moderate sensitivity; captures action without noise
  const args = [
    "-i", url,
    "-vf", `select='gt(scene\\,0.25)',scale=1280:-1`, // <-- scene-change filter
    "-vsync", "vfr",
    "-frames:v", String(maxFrames * 2), // grab extra, we'll trim
    "-q:v", "3",
    outPattern,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("scene-change extraction timeout")), timeoutMs);
      execFile(bin, args, { timeout: timeoutMs }, (err) => {
        clearTimeout(t);
        if (err) reject(err);
        else resolve();
      });
    });

    let paths = await collectJpgs(outDir);

    // Evenly subsample if we got too many
    if (paths.length > maxFrames) {
      const step = Math.ceil(paths.length / maxFrames);
      paths = paths.filter((_, i) => i % step === 0).slice(0, maxFrames);
    }

    // If scene-change yielded too few useful frames (< 50% of budget), fall back
    if (paths.length < Math.max(2, Math.floor(maxFrames * 0.5))) {
      return {
        paths: await extractScreenshotsFromUrl(url, maxFrames, outDir, timeoutMs),
        mode: "uniform_fallback",
      };
    }

    return { paths, mode: "scene_change" };
  } catch {
    // Fallback to uniform if scene-change filter fails (e.g. codec issues)
    return {
      paths: await extractScreenshotsFromUrl(url, maxFrames, outDir, timeoutMs),
      mode: "uniform_fallback",
    };
  }
}

/**
 * Highlight-timestamp dense extraction: grabs frames at 4fps in a window
 * around a user-specified key moment (±2 seconds by default).
 * This catches fast actions (e.g. a 1.5-second gunshot, a flip, a sprint finish).
 */
export async function extractHighlightFrames(
  url: string,
  highlightSec: number,
  outDir: string,
  windowSec = 2,
  fps = 4,
  timeoutMs = 120_000,
): Promise<string[]> {
  if (!ensureConfigured()) throw new Error("ffmpeg/ffprobe not available");

  const bin = ffmpegPath!;
  const start = Math.max(0, highlightSec - windowSec);
  const duration = windowSec * 2;
  const outPattern = join(outDir, "highlight-%04d.jpg");

  const args = [
    "-ss", String(start),
    "-i", url,
    "-t", String(duration),
    "-vf", `fps=${fps},scale=1280:-1`,
    "-q:v", "3",
    outPattern,
  ];

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("highlight extraction timeout")), timeoutMs);
    execFile(bin, args, { timeout: timeoutMs }, (err) => {
      clearTimeout(t);
      if (err) reject(err);
      else resolve();
    });
  });

  return collectJpgs(outDir);
}
