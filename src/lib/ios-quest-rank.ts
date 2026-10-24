/**
 * Read-only Quest milestone levels, not the future server-owned XP economy.
 * The current mine-list endpoint is limited to 50 rows. Do not manufacture
 * an account-wide rank when the queried history may be truncated.
 */
export type QuestMilestoneRecord = {id: string; status: string};

const stages = [
  { level: 1, title: "Seed", minSettled: 0 },
  { level: 2, title: "Explorer", minSettled: 1 },
  { level: 3, title: "Maker", minSettled: 3 },
  { level: 4, title: "Pathfinder", minSettled: 8 },
  { level: 5, title: "Beacon", minSettled: 20 },
] as const;

export type QuestMilestoneRank =
  | {status: "ready"; level: number; title: string; settled: number;
      nextThreshold: number | null; percent: number; source: "loaded-settled-quests"}
  | {status: "unknown"; reason: "history-limit" | "invalid-record"};

export function deriveQuestMilestoneRank(
  quests: readonly QuestMilestoneRecord[],
  queryLimit = 50
): QuestMilestoneRank {
  if (!Number.isInteger(queryLimit) || queryLimit < 1) {
    return {status:"unknown",reason:"invalid-record"};
  }
  if (quests.length >= queryLimit) {
    return {status:"unknown",reason:"history-limit"};
  }
  const ids = new Map<string, string>();
  for (const quest of quests) {
    if (!quest || typeof quest.id !== "string" || !quest.id.trim() ||
        typeof quest.status !== "string") {
      return {status:"unknown",reason:"invalid-record"};
    }
    // Conflicting states for one Quest are not evidence of completion.
    if (ids.has(quest.id) && ids.get(quest.id) !== quest.status) {
      return {status:"unknown",reason:"invalid-record"};
    }
    ids.set(quest.id, quest.status);
  }
  const settled = [...ids.values()].filter(status=>status==="settled").length;
  const stage = [...stages].reverse().find(entry=>settled>=entry.minSettled) || stages[0];
  const next = stages.find(entry=>entry.minSettled>settled);
  const percent = next === undefined ? 100
    : Math.round(100 * (settled - stage.minSettled) / (next.minSettled - stage.minSettled));
  return {
    status:"ready",
    level:stage.level,
    title:stage.title,
    settled,
    nextThreshold:next?.minSettled ?? null,
    percent,
    source:"loaded-settled-quests",
  };
}
