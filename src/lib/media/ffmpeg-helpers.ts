/**
 * Optional local ffmpeg/ffprobe (bundled binaries). Used for video duration + frame grab.
 * Supports three extraction modes:
 *  1. Uniform — evenly spaced (legacy default)
 *  2. Scene-change — ffmpeg scene-detection filter for action-dense areas
 *  3. Highlight — dense 4fps around a user-provided timestamp
 */

import { readdir } from "fs/promises";
import { existsSync } from "node:fs";
import { join } from "path";
import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export function ffmpegAvailable(): boolean {
  return Boolean(ffmpegPath && existsSync(ffmpegPath) && ffprobeStatic.path && existsSync(ffprobeStatic.path));
}

function ensureConfigured(): boolean {
  return ffmpegAvailable();
}

function requireLocalInput(path: string): void {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) {
    throw new Error("Decoder requires a staged local media file");
  }
  if (path.startsWith("\\\\") || path.startsWith("//")) throw new Error("Network media paths are forbidden");
}

export function ffprobeDurationFromUrl(url: string, timeoutMs = 45_000): Promise<number | null> {
  requireLocalInput(url);
  if (!ensureConfigured()) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(ffprobeStatic.path, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration", "-of", "json", url],
      { timeout: timeoutMs, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) return resolve(null);
        try {
          const duration = Number(JSON.parse(stdout).format?.duration);
          resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
        } catch { resolve(null); }
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

async function collectJpgsWithPrefix(outDir: string, prefix: string): Promise<string[]> {
  const names = await readdir(outDir);
  return names
    .filter((name) => name.startsWith(prefix) && name.endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => join(outDir, name));
}

export interface TimestampedFrame {
  path: string;
  timestampSec: number;
  rallyIndex?: number;
}

/**
 * Uniform temporal sampling with calculable timestamps. Unlike scene-change
 * extraction, this preserves order and cannot silently skip a quiet rally end.
 */
export async function extractTimelineFrames(
  url: string,
  framesPerSecond: number,
  maxFrames: number,
  outDir: string,
  timeoutMs = 180_000,
): Promise<TimestampedFrame[]> {
  requireLocalInput(url);
  if (!ensureConfigured()) throw new Error("ffmpeg/ffprobe not available");
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0 || maxFrames <= 0) return [];

  const fps = Math.min(8, Math.max(0.1, framesPerSecond));
  const prefix = "timeline-";
  const outPattern = join(outDir, `${prefix}%05d.jpg`);
  const args = [
    "-y",
    "-threads", "2", "-filter_threads", "1", "-filter_complex_threads", "1",
    "-protocol_whitelist", "file,pipe",
    "-i", url, "-threads", "2",
    "-vf", `fps=${fps.toFixed(6)},scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:black`,
    "-frames:v", String(maxFrames),
    "-q:v", "4",
    "-start_number", "0",
    outPattern,
  ];

  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath!, args, { timeout: timeoutMs, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const paths = await collectJpgsWithPrefix(outDir, prefix);
  return paths.map((path, index) => ({ path, timestampSec: index / fps }));
}

/** Dense frames around one candidate rally end for the second-pass point call. */
export async function extractTimestampedRallyWindow(
  url: string,
  rallyIndex: number,
  endSec: number,
  outDir: string,
  options?: { beforeSec?: number; afterSec?: number; fps?: number; width?: number; height?: number; timeoutMs?: number },
): Promise<TimestampedFrame[]> {
  requireLocalInput(url);
  if (!ensureConfigured()) throw new Error("ffmpeg/ffprobe not available");
  const beforeSec = options?.beforeSec ?? 1.5;
  const afterSec = options?.afterSec ?? 1.5;
  const fps = options?.fps ?? 8;
  const width = options?.width ?? 480;
  const height = options?.height ?? 270;
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const startSec = Math.max(0, endSec - beforeSec);
  const durationSec = beforeSec + afterSec;
  const maxFrames = Math.ceil(durationSec * fps);
  const prefix = `rally-${String(rallyIndex).padStart(2, "0")}-`;
  const outPattern = join(outDir, `${prefix}%05d.jpg`);
  const args = [
    "-y",
    "-ss", startSec.toFixed(3),
    "-threads", "2", "-filter_threads", "1", "-filter_complex_threads", "1",
    "-protocol_whitelist", "file,pipe",
    "-i", url, "-threads", "2",
    "-t", durationSec.toFixed(3),
    "-vf", `fps=${fps.toFixed(6)},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    "-frames:v", String(maxFrames),
    "-q:v", "3",
    "-start_number", "0",
    outPattern,
  ];

  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath!, args, { timeout: timeoutMs, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const paths = await collectJpgsWithPrefix(outDir, prefix);
  return paths.map((path, index) => ({
    path,
    timestampSec: startSec + index / fps,
    rallyIndex,
  }));
}

/** Evenly spaced JPEG screenshots saved to folder; returns absolute file paths sorted. */
export async function extractScreenshotsFromUrl(
  url: string,
  count: number,
  outDir: string,
  timeoutMs = 180_000,
): Promise<string[]> {
  requireLocalInput(url);
  if (!ensureConfigured()) throw new Error("ffmpeg/ffprobe not available");
  if (count <= 0) return [];
  const expiresAt = Date.now() + timeoutMs;
  const duration = await ffprobeDurationFromUrl(url, Math.min(timeoutMs, 45_000));
  if (duration == null) throw new Error("Cannot sample video without a measured duration");
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) throw new Error("Video sampling time limit reached");
  const args = ["-y", "-threads", "2", "-filter_threads", "1", "-filter_complex_threads", "1", "-protocol_whitelist", "file,pipe", "-i", url, "-threads", "2",
    "-vf", `fps=${count / duration},scale=1280:-1`, "-frames:v", String(count),
    "-q:v", "3", join(outDir, "evidence-%04d.jpg")];
  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath!, args, { timeout: remaining, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 },
      (error) => error ? reject(error) : resolve());
  });
  return collectJpgsWithPrefix(outDir, "evidence-");
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
  requireLocalInput(url);
  if (!ensureConfigured()) throw new Error("ffmpeg/ffprobe not available");
  if (maxFrames <= 0) return { paths: [], mode: "scene_change" };

  const expiresAt = Date.now() + timeoutMs;
  const remaining = () => {
    const left = expiresAt - Date.now();
    if (left <= 0) throw new Error("Video extraction time limit reached");
    return left;
  };
  const bin = ffmpegPath!;
  const outPattern = join(outDir, "scene-%04d.jpg");

  // scene threshold 0.25 = moderate sensitivity; captures action without noise
  const args = [
    "-threads", "2", "-filter_threads", "1", "-filter_complex_threads", "1",
    "-protocol_whitelist", "file,pipe",
    "-i", url, "-threads", "2",
    "-vf", `select='gt(scene\\,0.25)',scale=1280:-1`, // <-- scene-change filter
    "-vsync", "vfr",
    "-frames:v", String(maxFrames * 2), // grab extra, we'll trim
    "-q:v", "3",
    outPattern,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(bin, args, { timeout: timeoutMs, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    let paths = await collectJpgsWithPrefix(outDir, "scene-");

    // Evenly subsample if we got too many
    if (paths.length > maxFrames) {
      const step = Math.ceil(paths.length / maxFrames);
      paths = paths.filter((_, i) => i % step === 0).slice(0, maxFrames);
    }

    // If scene-change yielded too few useful frames (< 50% of budget), fall back
    if (paths.length < Math.max(2, Math.floor(maxFrames * 0.5))) {
      return {
        paths: await extractScreenshotsFromUrl(url, maxFrames, outDir, remaining()),
        mode: "uniform_fallback",
      };
    }

    return { paths, mode: "scene_change" };
  } catch {
    // Fallback to uniform if scene-change filter fails (e.g. codec issues)
    return {
      paths: await extractScreenshotsFromUrl(url, maxFrames, outDir, remaining()),
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
  requireLocalInput(url);
  if (!ensureConfigured()) throw new Error("ffmpeg/ffprobe not available");

  const bin = ffmpegPath!;
  const start = Math.max(0, highlightSec - windowSec);
  const duration = windowSec * 2;
  const outPattern = join(outDir, "highlight-%04d.jpg");

  const args = [
    "-ss", String(start),
    "-threads", "2", "-filter_threads", "1", "-filter_complex_threads", "1",
    "-protocol_whitelist", "file,pipe",
    "-i", url, "-threads", "2",
    "-t", String(duration),
    "-vf", `fps=${fps},scale=1280:-1`,
    "-q:v", "3",
    outPattern,
  ];

  await new Promise<void>((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return collectJpgs(outDir);
}
