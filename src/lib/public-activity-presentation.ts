type Activity = {
  type: string;
  user?: { username: string } | null;
  challenge?: { title: string } | null;
};

/** Presentation only: keep original messages in the event/audit store. Unknown
 * future event kinds do not expose provider names or raw internal identifiers.
 * No winning, payment, XP or settlement is inferred from a recommendation.
 */
export function publicActivityPresentation(event: Activity): { label: string; message: string } {
  const player = event.user?.username || "A Summoner";
  const quest = event.challenge ? `“${event.challenge.title}”` : "a Quest";
  switch (event.type) {
    case "user_joined": return { label: "New Summoner", message: `${player} joined Summoners World.` };
    case "challenge_created": return { label: "Quest created", message: `${player} created ${quest}.` };
    case "quiz_created": return { label: "Quiz invitation", message: `${player} created a Quiz invitation.` };
    case "challenge_accepted": return { label: "Rules accepted", message: `${player} accepted the rules for ${quest}.` };
    case "evidence_submitted": return { label: "Proof submitted", message: `${player} submitted proof for ${quest}.` };
    case "challenge_verdict_recommended": return { label: "Referee recommendation", message: `A referee recommendation was recorded for ${quest}. Open the Quest to check its current review and result status.` };
    case "challenge_settled": return { label: "Result confirmed", message: `A confirmed result was recorded for ${quest}. View the result receipt for details.` };
    case "challenge_refunded": return { label: "No-winner result", message: `A no-winner result was recorded for ${quest}. View the result receipt for details.` };
    case "challenge_cancelled": return { label: "Quest cancelled", message: `The cancellation of ${quest} was recorded.` };
    default: return { label: "Community update", message: "A public community update was recorded." };
  }
}
