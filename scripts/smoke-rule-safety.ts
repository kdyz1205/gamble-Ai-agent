import assert from "node:assert/strict";
import { evaluateRuleSafety } from "../src/lib/rule-safety";

const blockedCases = [
  ["violence", "Fight challenge: winner is whoever punches harder."],
  ["self_harm", "Cut myself less than last time challenge."],
  ["drugs_or_alcohol", "Let's bet who can chug beer fastest."],
  ["non_consensual_or_harassment", "Secretly record my coworker and bet what they do."],
  ["illegal_activity", "Who can hack an account first?"],
  ["chance_or_real_money_gambling", "Real money coin flip for $100."],
] as const;

for (const [flag, prompt] of blockedCases) {
  const decision = evaluateRuleSafety(prompt);
  assert.equal(decision.allowed, false, prompt);
  assert.equal(decision.category, "blocked", prompt);
  assert.ok(decision.flags.includes(flag), `${prompt} should include ${flag}`);
}

const reviewCases = [
  ["high_physical_risk", "Who can stay in a sauna the longest?"],
  ["private_third_party", "I bet my coworker arrives late tomorrow."],
  ["minor_or_child", "My kid can run fastest at school."],
] as const;

for (const [flag, prompt] of reviewCases) {
  const decision = evaluateRuleSafety(prompt);
  assert.equal(decision.allowed, false, prompt);
  assert.equal(decision.category, "review", prompt);
  assert.ok(decision.flags.includes(flag), `${prompt} should include ${flag}`);
}

const allowedCases = [
  "I bet Jerry I can beat his chess score in 10 minutes.",
  "I bet BEAT token reaches $2 by Friday.",
  "Who can finish a bottle of water fastest?",
  "\u6211\u60f3\u548c\u670b\u53cb\u6bd4\u8c01\u505a\u4fef\u5367\u6491\u66f4\u591a",
];

for (const prompt of allowedCases) {
  const decision = evaluateRuleSafety(prompt);
  assert.equal(decision.allowed, true, prompt);
  assert.equal(decision.category, "allowed", prompt);
}

console.log(JSON.stringify({
  ok: true,
  blocked: blockedCases.map(([flag]) => flag),
  review: reviewCases.map(([flag]) => flag),
  allowedCount: allowedCases.length,
}, null, 2));
