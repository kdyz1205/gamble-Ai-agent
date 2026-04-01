/**
 * Pick frame count & download budget from measured duration (seconds).
 * Goal: short clips → fewer frames (fast); long → more coverage without exploding cost.
 */

export interface VideoVisualPlan {
  frameCount: number;
  maxDownloadBytes: number;
  label: string;
}

export function planVideoVisuals(durationSec: number | null): VideoVisualPlan {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return {
      frameCount: 4,
      maxDownloadBytes: 40 * 1024 * 1024,
      label: "duration unknown — using 4 evenly spaced frames, ≤40MB fetch cap",
    };
  }
  if (durationSec <= 30) {
    return {
      frameCount: 4,
      maxDownloadBytes: 45 * 1024 * 1024,
      label: `~${Math.round(durationSec)}s short clip — 4 frames, ≤45MB`,
    };
  }
  if (durationSec <= 120) {
    return {
      frameCount: 8,
      maxDownloadBytes: 70 * 1024 * 1024,
      label: `~${Math.round(durationSec)}s — 8 frames, ≤70MB`,
    };
  }
  if (durationSec <= 600) {
    return {
      frameCount: 12,
      maxDownloadBytes: 110 * 1024 * 1024,
      label: `~${Math.round(durationSec / 60)}min — 12 frames, ≤110MB`,
    };
  }
  if (durationSec <= 3600) {
    return {
      frameCount: 16,
      maxDownloadBytes: 160 * 1024 * 1024,
      label: `~${Math.round(durationSec / 60)}min long — 16 frames, ≤160MB`,
    };
  }
  return {
    frameCount: 20,
    maxDownloadBytes: 200 * 1024 * 1024,
    label: `>${Math.round(durationSec / 3600)}h very long — 20 frames (sparse), ≤200MB`,
  };
}
