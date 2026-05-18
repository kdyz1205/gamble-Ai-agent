export type RuleSafetyDecision = {
  allowed: boolean;
  category: "allowed" | "blocked" | "review";
  reason: string;
  flags: string[];
};

type Rule = {
  flag: string;
  pattern: RegExp;
  reason: string;
};

const BLOCK_RULES: Rule[] = [
  {
    flag: "violence",
    pattern: /\b(fight|punch|hit|kick|beat|choke|strangle|assault|attack)\b|打架|殴打|攻击|勒|掐/i,
    reason: "Physical violence or assault challenges are not allowed.",
  },
  {
    flag: "self_harm",
    pattern: /\b(self[- ]?harm|suicide|cut myself|hurt myself|bleed)\b|自残|自杀|割腕/i,
    reason: "Self-harm challenges are not allowed.",
  },
  {
    flag: "drugs_or_alcohol",
    pattern: /\b(drug|cocaine|weed|marijuana|meth|opioid|drink alcohol|chug beer|shots of vodka|vodka|whiskey)\b|毒品|吸毒|喝酒|白酒|啤酒/i,
    reason: "Drug or alcohol consumption challenges are not allowed.",
  },
  {
    flag: "non_consensual_or_harassment",
    pattern: /\b(stalk|harass|doxx|secretly record|without consent|spy on|prank stranger)\b|偷拍|骚扰|人肉|未经同意|跟踪/i,
    reason: "Non-consensual recording, harassment, or targeting other people is not allowed.",
  },
  {
    flag: "illegal_activity",
    pattern: /\b(steal|shoplift|trespass|break into|hack account|fake id|illegal)\b|偷|盗窃|闯入|违法|非法/i,
    reason: "Illegal activity cannot be turned into a challenge.",
  },
  {
    flag: "chance_or_real_money_gambling",
    pattern: /\b(coin flip|dice|roulette|slot machine|lottery|random number|blackjack|poker|casino|real money|cash payout|withdraw cash)\b|硬币|骰子|彩票|老虎机|赌场|真钱|提现|现金赔付/i,
    reason: "Chance-based or real-money gambling is blocked. Use internal-credit skill challenges only.",
  },
];

const REVIEW_RULES: Rule[] = [
  {
    flag: "high_physical_risk",
    pattern: /\b(fasting|no sleep|hold breath|extreme heat|ice bath|roof|jump from|speeding|dangerous)\b|禁食|憋气|跳楼|飙车|危险/i,
    reason: "This looks physically risky and needs a safer version before publishing.",
  },
  {
    flag: "private_third_party",
    pattern: /\b(wife|husband|girlfriend|boyfriend|boss|teacher|coworker)\b|老婆|老公|女友|男友|老板|老师|同事/i,
    reason: "Challenges involving third parties need consent and privacy checks.",
  },
];

export function evaluateRuleSafety(input: string): RuleSafetyDecision {
  const text = input.trim();
  const blocked = BLOCK_RULES.filter((rule) => rule.pattern.test(text));
  if (blocked.length > 0) {
    return {
      allowed: false,
      category: "blocked",
      reason: blocked[0].reason,
      flags: blocked.map((rule) => rule.flag),
    };
  }

  const review = REVIEW_RULES.filter((rule) => rule.pattern.test(text));
  if (review.length > 0) {
    return {
      allowed: false,
      category: "review",
      reason: review[0].reason,
      flags: review.map((rule) => rule.flag),
    };
  }

  return {
    allowed: true,
    category: "allowed",
    reason: "Challenge is allowed as an internal-credit skill challenge.",
    flags: [],
  };
}
