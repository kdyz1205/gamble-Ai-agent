import { remainingAiTimeMs } from "../ai-governance";

/** One elapsed-time budget covers download, probe, extraction and retries. */
export function mediaTimeBudget(maxMs: number): () => number {
  const expiresAt = Date.now() + remainingAiTimeMs(maxMs);
  return () => {
    const left = Math.min(expiresAt - Date.now(), remainingAiTimeMs(maxMs));
    if (left <= 0) throw new Error("Media processing time limit reached; proof needs review");
    return left;
  };
}
