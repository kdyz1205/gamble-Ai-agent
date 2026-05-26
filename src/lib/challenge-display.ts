import { cleanDeadlineArtifactsForDisplay, formatChallengeDeadline, stripDeadlineArtifacts } from "@/lib/challenge-time";

type ChallengeLike = {
  title: string;
  rules?: string | null;
  evidenceType?: string | null;
  deadline?: string | Date | null;
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

function normalizeRuleValue(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanRuleDisplayValue(raw: string, label: string) {
  const withoutDeadline = label === "Time limit"
    ? stripDeadlineArtifacts(raw)
    : cleanDeadlineArtifactsForDisplay(raw);
  const withoutSettlement = label === "Time limit"
    ? withoutDeadline.replace(/\bNo stake\.?\s*(?:The result is recorded without moving credits\.?)?/i, "")
    : withoutDeadline;
  return withoutSettlement
    .replace(/\bDeadline passed\b\s*\.?\s*\bDeadline passed\b/g, "Deadline passed")
    .trim();
}

function pickCard(cards: ChallengeRuleCard[], labels: string[]) {
  return labels
    .map((label) => cards.find((card) => card.label === label))
    .find((card): card is ChallengeRuleCard => Boolean(card));
}

function joinUnique(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    const normalized = normalizeRuleValue(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value);
  }
  return out.join(" ");
}

function withoutTrailingSentencePunctuation(value: string) {
  return value.trim().replace(/[.!?]+$/g, "");
}

function joinSentences(first: string, second: string) {
  const a = withoutTrailingSentencePunctuation(first);
  const b = second.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}. ${b}`;
}

function joinSentencesForLanguage(first: string, second: string, zh: boolean) {
  if (!zh) return joinSentences(first, second);
  const a = first.trim().replace(/[.!?。！？]+$/g, "");
  const b = second.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}。${b}`;
}

function compactDeadlineLabel(timeLimit: string | undefined, deadlineLabel: string | null, zh = false) {
  if (!deadlineLabel) return null;
  // Old AI drafts sometimes stored placeholder absolute dates that are now in the past.
  // If we already have a human-readable time rule, keep the compact card focused on that
  // instead of appending a confusing "Deadline passed" artifact.
  if (timeLimit && deadlineLabel === "Deadline passed") return null;
  if (!zh) return deadlineLabel;
  if (deadlineLabel === "Deadline passed") return "已过期";
  return `截止 ${deadlineLabel}`;
}

function usesChineseCopy(challenge: ChallengeLike) {
  return /[\u3400-\u9FFF]/.test([
    challenge.title,
    challenge.rules,
    challenge.proofWindow,
    challenge.disputeWindow,
  ].filter(Boolean).join("\n"));
}

export function challengeUsesChineseCopy(challenge: ChallengeLike) {
  return usesChineseCopy(challenge);
}

function compactSettlementSummary(challenge: ChallengeLike) {
  const stake = Math.max(0, Math.floor(challenge.stake ?? 0));
  const zh = usesChineseCopy(challenge);
  if (stake <= 0) return zh ? "不移动积分。" : "No credits move.";
  return zh
    ? `${stake} ${challenge.stakeToken || "credits"} 已托管，赢家获得奖池。`
    : `${stake} ${challenge.stakeToken || "credits"} escrowed. Winner gets the pool.`;
}

function buildChallengeRuleCards(challenge: ChallengeLike): ChallengeRuleCard[] {
  const cards: ChallengeRuleCard[] = [];
  const seen = new Set<string>();
  const seenValues = new Set<string>();

  for (const line of (challenge.rules || "").split(/\n+/)) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const label = RULE_LABELS[normalizeRuleKey(match[1])];
    if (!label) continue;
    const value = cleanRuleDisplayValue(match[2] ?? "", label);
    const normalizedValue = value ? normalizeRuleValue(value) : "";
    if (!value || seen.has(label) || seenValues.has(normalizedValue)) continue;
    cards.push({ label, value });
    seen.add(label);
    seenValues.add(normalizedValue);
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
    const zh = usesChineseCopy(challenge);
    cards.push({
      label: "Settlement",
      value: stake > 0
        ? zh
          ? `每人赛前托管 ${stake} ${challenge.stakeToken || "credits"}。判定确认后，赢家获得积分奖池。`
          : `${stake} ${challenge.stakeToken || "credits"} per player is escrowed before play. Winner receives the internal credit pool after verdict confirmation.`
        : zh
          ? "无积分押注。结果只记录，不移动积分。"
          : "No stake. The result is recorded without moving credits.",
    });
  }

  return cards.sort((a, b) => {
    const ai = CARD_ORDER.indexOf(a.label);
    const bi = CARD_ORDER.indexOf(b.label);
    return (ai === -1 ? CARD_ORDER.length : ai) - (bi === -1 ? CARD_ORDER.length : bi);
  });
}

const RULE_LABELS_ZH: Record<string, string> = {
  Goal: "目标",
  "Win condition": "胜利条件",
  "Evidence required": "证据要求",
  "Recording standard": "录制要求",
  Start: "开始",
  "Time limit": "时间限制",
  "Timing method": "计时方式",
  "Valid action": "有效动作",
  Scoring: "计分",
  Attempts: "次数",
  "Dispute window": "争议期",
  Settlement: "结算",
  Safety: "安全",
};

function localizeRuleCards(cards: ChallengeRuleCard[], zh: boolean) {
  if (!zh) return cards;
  return cards.map((card) => ({
    ...card,
    label: RULE_LABELS_ZH[card.label] ?? card.label,
  }));
}

export function parseChallengeRules(challenge: ChallengeLike): ChallengeRuleCard[] {
  return localizeRuleCards(buildChallengeRuleCards(challenge), usesChineseCopy(challenge));
}

export function compactChallengeRules(challenge: ChallengeLike): ChallengeRuleCard[] {
  const cards = buildChallengeRuleCards(challenge);
  const zh = usesChineseCopy(challenge);
  const goal = pickCard(cards, ["Goal"])?.value || challenge.title;
  const win = pickCard(cards, ["Scoring", "Win condition"])?.value || goal;
  const evidence = joinUnique([
    pickCard(cards, ["Evidence required"])?.value,
    pickCard(cards, ["Recording standard"])?.value,
  ]) || (challenge.evidenceType ? challenge.evidenceType.replace(/_/g, " ") : "Required evidence");
  const timeLimit = pickCard(cards, ["Time limit"])?.value;
  const rawDeadlineLabel = formatChallengeDeadline(challenge.deadline, { includePrefix: !zh });
  const deadlineLabel = compactDeadlineLabel(timeLimit, rawDeadlineLabel, zh);
  const time = timeLimit && deadlineLabel
    ? joinSentencesForLanguage(timeLimit, deadlineLabel, zh)
    : timeLimit || deadlineLabel || challenge.proofWindow || "Before the challenge window closes";
  const dispute = pickCard(cards, ["Dispute window"])?.value;
  const stake = Math.max(0, Math.floor(challenge.stake ?? 0));
  const settlement = stake > 0 ? compactSettlementSummary(challenge) : "";
  const review = dispute && settlement
    ? joinSentencesForLanguage(dispute, settlement, zh)
    : dispute || settlement;
  const timeReview = review ? joinSentencesForLanguage(time, review, zh) : time;

  return [
    { label: zh ? "挑战" : "Match", value: goal },
    { label: zh ? "胜利条件" : "How to win", value: win },
    { label: zh ? "证据" : "Evidence", value: evidence },
    { label: zh ? "时间与复核" : "Time + review", value: timeReview },
  ];
}

export function acceptanceContract(challenge: ChallengeLike): string[] {
  const stake = Math.max(0, Math.floor(challenge.stake ?? 0));
  const zh = usesChineseCopy(challenge);
  if (zh) {
    return [
      "我同意上方显示的规则和胜利条件。",
      `我同意提交符合录制要求的${challenge.evidenceType ? challenge.evidenceType.replace(/_/g, " ") : "必要"}证据。`,
      "我同意 AI 给出判定建议；低置信度或有争议时进入人工复核。",
      challenge.disputeWindow
        ? `我理解争议期为 ${challenge.disputeWindow}。`
        : "我理解必须在最终结算前提出争议。",
      stake > 0
        ? `我同意加入时托管 ${stake} ${challenge.stakeToken || "credits"}。`
        : "我理解这个挑战没有积分押注。",
    ];
  }
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
  const zh = usesChineseCopy(challenge);
  if (stake <= 0) return zh ? "免费挑战：不托管或支付积分。" : "Free challenge: no credits escrowed or paid out.";
  return zh
    ? `每位接受者托管 ${stake} ${challenge.stakeToken || "credits"}。AI 判定确认后结算。`
    : `${stake} ${challenge.stakeToken || "credits"} per accepted player is escrowed. Settlement happens only after the AI recommendation is confirmed.`;
}
