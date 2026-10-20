import type { AgentDraftState } from "./api-client";

export interface ComposerSettings {
  stake: string;
  opponentMode: string;
  proofWindow: string;
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
