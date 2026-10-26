import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchBinaryCapped } from "./evidence-url";
import { ffprobeDurationFromUrl } from "./ffmpeg-helpers";
import { planVideoVisuals } from "./video-strategy";
import { mediaTimeBudget } from "./media-budget";
import { stageTrustedEvidenceObject, type TrustedEvidenceSource } from "./trusted-evidence-storage";

/** Public URLs use the guarded HTTP transport. Private handles use a streamed
 * AWS SDK GET into the decoder's temp directory with an in-stream SHA-256
 * check. FFmpeg only receives a local file pathname.
 */
export type VideoEvidenceSource = string | TrustedEvidenceSource;

export async function stageEvidenceVideo(
  source: VideoEvidenceSource,
  directory: string,
  remaining = mediaTimeBudget(120_000),
) {
  const path = join(directory, "source-video");
  let bytes: number;
  if (typeof source === "string") {
    const { buffer } = await fetchBinaryCapped(
      source, 200 * 1024 * 1024, Math.min(90_000, remaining()),
    );
    await writeFile(path, buffer);
    bytes = buffer.length;
  } else {
    // No URL, presigned capability or full object buffer is used.
    await stageTrustedEvidenceObject(source, path);
    bytes = source.expectedSizeBytes;
  }
  const duration = await ffprobeDurationFromUrl(
    path, Math.min(25_000, remaining()),
  );
  const plan = planVideoVisuals(duration);
  if (bytes > plan.maxDownloadBytes) {
    throw new Error("Video exceeds the media byte budget for its duration");
  }
  return { path, duration, plan };
}
