import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchBinaryCapped } from "./evidence-url";
import { ffprobeDurationFromUrl } from "./ffmpeg-helpers";
import { planVideoVisuals } from "./video-strategy";
import { mediaTimeBudget } from "./media-budget";

/** Download once through the guarded transport; decoders never access the network. */
export async function stageEvidenceVideo(url: string, directory: string, remaining = mediaTimeBudget(120_000)) {
  const { buffer } = await fetchBinaryCapped(url, 200 * 1024 * 1024, Math.min(90_000, remaining()));
  const path = join(directory, "source-video");
  await writeFile(path, buffer);
  const duration = await ffprobeDurationFromUrl(path, Math.min(25_000, remaining()));
  const plan = planVideoVisuals(duration);
  if (buffer.length > plan.maxDownloadBytes) {
    throw new Error(`Video exceeds ${plan.maxDownloadBytes} byte budget for its duration`);
  }
  return { path, duration, plan };
}
