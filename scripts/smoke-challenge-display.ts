import { compactChallengeRules, parseChallengeRules } from "../src/lib/challenge-display";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const stalePlaceholderChallenge = {
  title: "与喜欢的人见面",
  rules: [
    "Objective: 与喜欢的人见面",
    "Winning condition: 与喜欢的人见面",
    "Evidence: 见面视频",
    "End: 见面结束. 2023-12-31T23:59:59ZNo stake. The result is recorded without moving credits.",
  ].join("\n"),
  evidenceType: "video",
  deadline: "2023-12-31T23:59:59Z",
  stake: 0,
  stakeToken: "credits",
  disputeWindow: null,
  proofWindow: null,
};

const compact = compactChallengeRules(stalePlaceholderChallenge);
const full = parseChallengeRules(stalePlaceholderChallenge);
const compactText = compact.map((card) => `${card.label}: ${card.value}`).join("\n");
const fullText = full.map((card) => `${card.label}: ${card.value}`).join("\n");

assert(!compactText.includes("2023-12-31"), "compact rules must hide stale raw ISO dates");
assert(!fullText.includes("2023-12-31"), "full rules must hide stale raw ISO dates");
assert(!compactText.includes("Deadline passed"), "compact rules must not append stale placeholder deadline when a natural time rule exists");
assert(compactText.includes("见面结束"), "compact rules should preserve the human-readable end condition");

console.log(JSON.stringify({
  challengeDisplaySmokeReady: true,
  compact,
  full,
}, null, 2));
