type ChallengeLike = {
  title: string;
  rules?: string | null;
  evidenceType?: string | null;
  stake?: number | null;
  stakeToken?: string | null;
  disputeWindow?: string | null;
  proofWindow?: string | null;
  settlementMode?: string | null;
  fallbackRule?: string | null;
};

export type ChallengeRuleCard = {
  label: string;
  value: string;
};

const RULE_LABELS: Record<string, string> = {
  objective: "Goal",
  "winning condition": "Win condition",
  evidence: "Evidence required",
  recording: "Recording standard",
  start: "Start",
  end: "Time limit",
  timing: "Timing method",
  "valid rep": "Valid action",
  scoring: "Scoring",
  attempts: "Attempts",
  dispute: "Dispute window",
  settlement: "Settlement",
  safety: "Safety",
};

const CARD_ORDER = [
  "Goal",
  "Win condition",
  "Evidence required",
  "Recording standard",
  "Time limit",
  "Valid action",
  "Scoring",
  "Dispute window",
  "Settlement",
  "Safety",
];

function normalizeRuleKey(raw: string) {
  return raw.trim().toLowerCase();
}

export function parseChallengeRules(challenge: ChallengeLike): ChallengeRuleCard[] {
  const cards: ChallengeRuleCard[] = [];
  const seen = new Set<string>();

  for (const line of (challenge.rules || "").split(/\n+/)) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const label = RULE_LABELS[normalizeRuleKey(match[1])];
    const value = match[2]?.trim();
    if (!label || !value || seen.has(label)) continue;
    cards.push({ label, value });
    seen.add(label);
  }

  if (!seen.has("Goal")) {
    cards.unshift({ label: "Goal", value: challenge.title });
    seen.add("Goal");
  }
  if (!seen.has("Evidence required") && challenge.evidenceType) {
    cards.push({ label: "Evidence required", value: challenge.evidenceType.replace(/_/g, " ") });
    seen.add("Evidence required");
  }
  if (!seen.has("Dispute window") && challenge.disputeWindow) {
    cards.push({ label: "Dispute window", value: challenge.disputeWindow });
    seen.add("Dispute window");
  }
  if (!seen.has("Settlement")) {
    const stake = Math.max(0, Math.floor(challenge.stake ?? 0));
    cards.push({
      label: "Settlement",
      value: stake > 0
        ? `${stake} ${challenge.stakeToken || "credits"} per player is escrowed before play. Winner receives the internal credit pool after verdict confirmation.`
        : "No stake. The result is recorded without moving credits.",
    });
  }

  return cards.sort((a, b) => {
    const ai = CARD_ORDER.indexOf(a.label);
    const bi = CARD_ORDER.indexOf(b.label);
    return (ai === -1 ? CARD_ORDER.length : ai) - (bi === -1 ? CARD_ORDER.length : bi);
  });
}

export function acceptanceContract(challenge: ChallengeLike): string[] {
  const stake = Math.max(0, Math.floor(challenge.stake ?? 0));
  return [
    "I agree to the rules and win condition shown above.",
    `I agree to submit ${challenge.evidenceType ? challenge.evidenceType.replace(/_/g, " ") : "required"} evidence that matches the recording standard.`,
    "I agree that AI gives a recommendation and low-confidence or disputed cases require manual review.",
    challenge.disputeWindow
      ? `I understand the dispute window is ${challenge.disputeWindow}.`
      : "I understand disputes must be raised before settlement is final.",
    stake > 0
      ? `I agree that ${stake} ${challenge.stakeToken || "credits"} will be escrowed when I join.`
      : "I understand this challenge has no credit stake.",
  ];
}

export function settlementSummary(challenge: ChallengeLike): string {
  const stake = Math.max(0, Math.floor(challenge.stake ?? 0));
  if (stake <= 0) return "Free challenge: no credits escrowed or paid out.";
  return `${stake} ${challenge.stakeToken || "credits"} per accepted player is escrowed. Settlement happens only after the AI recommendation is confirmed.`;
}
