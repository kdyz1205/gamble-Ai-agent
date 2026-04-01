/**
 * Optional local ffmpeg/ffprobe (bundled binaries). Used for video duration + frame grab.
 */

import { readdir } from "fs/promises";
import { join } from "path";
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
          const names = await readdir(outDir);
          const jpgs = names.filter((n) => n.endsWith(".jpg")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          resolve(jpgs.map((n) => join(outDir, n)));
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
