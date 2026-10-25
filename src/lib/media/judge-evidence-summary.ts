/**
 * Presentation-only rendering for model prompts. Signed private S3/R2 read
 * capabilities are exclusively transport data for the server-side decoder.
 * Models receive decoded frames and human-readable provenance, never tokens.
 */
export type PromptEvidence = {
  type: string;
  description: string | null;
  url?: string | null;
  privateMedia?: boolean;
};

export function describeEvidenceForJudge(
  participant: "A" | "B",
  evidence: PromptEvidence,
): string {
  const source = evidence.privateMedia
    ? "server-verified private object"
    : evidence.url?.trim() || null;
  return `Participant ${participant} evidence (${evidence.type}):
description: ${evidence.description || "(none)"}${source ? `\nmedia: ${source}` : ""}`;
}
