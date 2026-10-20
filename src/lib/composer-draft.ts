import type { AgentDraftState, AgentTurn } from "./api-client";

export interface ComposerSettings {
  stake: string;
  opponentMode: string;
  proofWindow: string;
}

export const COMPOSER_AUTH_CHECKPOINT = "summoner:composer:auth-return:v1";
export interface ComposerCheckpoint {
  ownerId: string | null;
  savedAt: number;
  input: string;
  settings: ComposerSettings;
  draft: AgentDraftState;
  turns: AgentTurn[];
}

/** One-use, same-tab OAuth return; never restore another signed-in owner's draft. */
export function readComposerCheckpoint(raw: string, ownerId: string | null, now = Date.now()): ComposerCheckpoint | null {
  if (raw.length > 128_000) return null;
  try {
    const value = JSON.parse(raw) as ComposerCheckpoint;
    if (!value || (value.ownerId !== null && value.ownerId !== ownerId)
      || !Number.isFinite(value.savedAt) || now - value.savedAt < 0 || now - value.savedAt > 30 * 60_000
      || typeof value.input !== "string" || value.input.length > 8_000
      || !value.settings || typeof value.settings.stake !== "string"
      || !["Invite only", "Open match", "Public pool"].includes(value.settings.opponentMode)
      || typeof value.settings.proofWindow !== "string" || value.settings.proofWindow.length > 80
      || !value.draft || typeof value.draft.readyToPublish !== "boolean"
      || !Array.isArray(value.draft.safetyNotes) || !value.draft.safetyNotes.every(note => typeof note === "string")
      || ![null, "credits", "none"].includes(value.draft.stakeType)
      || ![null, "video", "photo", "text"].includes(value.draft.evidenceType)
      || (value.draft.stake !== null && (!Number.isSafeInteger(value.draft.stake) || value.draft.stake < 0))
      || !Array.isArray(value.turns) || value.turns.length > 32
      || !value.turns.every(turn => turn && ["user", "ai"].includes(turn.role) && typeof turn.content === "string" && turn.content.length <= 8_000)) return null;
    for (const field of ["title", "proposition", "participants", "judgeRule", "timeWindow"] as const) {
      if (value.draft[field] !== null && (typeof value.draft[field] !== "string" || value.draft[field].length > 8_000)) return null;
    }
    return value;
  } catch { return null; }
}

/** Server-confirmed conversational edits take precedence over initial controls. */
export function draftForComposer(base: AgentDraftState, settings: ComposerSettings): AgentDraftState {
  const parsed = settings.stake.trim() === "" ? null : Number(settings.stake);
  const fallbackStake = parsed !== null && Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed) : null;
  const stake = base.stake ?? fallbackStake;
  return {
    ...base,
    participants: base.participants || (settings.opponentMode === "Public pool"
      ? "you + 1 opponent from the public pool"
      : settings.opponentMode === "Open match" ? "you + 1 open opponent" : "you + 1 invited friend"),
    stake,
    stakeType: stake === null ? null : stake === 0 ? "none" : "credits",
    timeWindow: base.timeWindow || settings.proofWindow,
    readyToPublish: base.readyToPublish && stake !== null && Number.isFinite(stake) && stake >= 0,
  };
}
