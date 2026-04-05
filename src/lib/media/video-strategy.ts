/**
 * Pick frame count & download budget from measured duration (seconds).
 * Goal: short clips → fewer frames (fast); long → more coverage without exploding cost.
 *
 * extractionMode controls how frames are sampled:
 *  - "scene_change" (default): Use ffmpeg scene-detection for action-dense extraction.
 *  - "uniform": Legacy evenly-spaced extraction (fallback).
 */

export type ExtractionMode = "scene_change" | "uniform";

export interface VideoVisualPlan {
  frameCount: number;
  maxDownloadBytes: number;
  label: string;
  /** Preferred extraction strategy. Scene-change is default for better action coverage. */
  extractionMode: ExtractionMode;
}

export function planVideoVisuals(durationSec: number | null): VideoVisualPlan {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return {
      frameCount: 4,
      maxDownloadBytes: 40 * 1024 * 1024,
      label: "duration unknown — using 4 scene-change frames, ≤40MB fetch cap",
      extractionMode: "scene_change",
    };
  }
  if (durationSec <= 30) {
    return {
      frameCount: 6,
      maxDownloadBytes: 45 * 1024 * 1024,
      label: `~${Math.round(durationSec)}s short clip — 6 scene-change frames, ≤45MB`,
      extractionMode: "scene_change",
    };
  }
  if (durationSec <= 120) {
    return {
      frameCount: 10,
      maxDownloadBytes: 70 * 1024 * 1024,
      label: `~${Math.round(durationSec)}s — 10 scene-change frames, ≤70MB`,
      extractionMode: "scene_change",
    };
  }
  if (durationSec <= 600) {
    return {
      frameCount: 14,
      maxDownloadBytes: 110 * 1024 * 1024,
      label: `~${Math.round(durationSec / 60)}min — 14 scene-change frames, ≤110MB`,
      extractionMode: "scene_change",
    };
  }
  if (durationSec <= 3600) {
    return {
      frameCount: 18,
      maxDownloadBytes: 160 * 1024 * 1024,
      label: `~${Math.round(durationSec / 60)}min long — 18 scene-change frames, ≤160MB`,
      extractionMode: "scene_change",
    };
  }
  return {
    frameCount: 22,
    maxDownloadBytes: 200 * 1024 * 1024,
    label: `>${Math.round(durationSec / 3600)}h very long — 22 scene-change frames (sparse), ≤200MB`,
    extractionMode: "scene_change",
  };
}
