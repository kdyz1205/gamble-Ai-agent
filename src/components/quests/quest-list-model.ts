import type { ChallengeData } from "@/lib/api-client";

export type QuestView = "all" | "proof" | "results";
export function questView(value: string | null): QuestView {
  return value === "proof" || value === "results" ? value : "all";
}
export function matchesQuestView(quest: ChallengeData, view: QuestView): boolean {
  if (view === "proof") return ["live", "judging"].includes(quest.status);
  if (view === "results") return ["settled", "cancelled", "disputed", "pending_settlement"].includes(quest.status);
  return true;
}
export function questNextStep(quest: ChallengeData): string {
  switch (quest.status) {
    case "draft": return "Review the quest terms before publishing.";
    case "open": return "Open the invitation to invite or accept a challenger.";
    case "live": return "Open the quest to submit proof before its deadline.";
    case "judging": return "Open the quest to request or check the Familiar result.";
    case "disputed": return "A result awaits player agreement or human review.";
    case "pending_settlement": return "Settlement is pending. Check the quest for its latest status.";
    case "settled": return "Open the quest to view its result receipt.";
    case "cancelled": return "This quest is closed. Open it to inspect the outcome.";
    default: return "Open the quest to check its latest status.";
  }
}
