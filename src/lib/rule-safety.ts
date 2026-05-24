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
    pattern: /\b(fight|punch|hit|kick|beat\s+up|choke|strangle|assault|attack|weapon|knife|gun)\b|\u6253\u67b6|\u6bb4\u6253|\u653b\u51fb|\u52d2|\u6390|\u5200|\u67aa/i,
    reason: "Physical violence or assault challenges are not allowed.",
  },
  {
    flag: "self_harm",
    pattern: /\b(self[- ]?harm|suicide|cut myself|hurt myself|bleed|overdose)\b|\u81ea\u6b8b|\u81ea\u6740|\u5272\u8155/i,
    reason: "Self-harm challenges are not allowed.",
  },
  {
    flag: "drugs_or_alcohol",
    pattern: /\b(drug|cocaine|weed|marijuana|meth|opioid|drink alcohol|chug beer|beer chug|shots of vodka|vodka|whiskey|drug tolerance)\b|\u6bd2\u54c1|\u5438\u6bd2|\u559d\u9152|\u767d\u9152|\u5564\u9152/i,
    reason: "Drug or alcohol consumption challenges are not allowed.",
  },
  {
    flag: "non_consensual_or_harassment",
    pattern: /\b(stalk|harass|doxx|secretly record|without consent|spy on|prank stranger|follow someone)\b|\u5077\u62cd|\u9a9a\u6270|\u4eba\u8089|\u672a\u7ecf\u540c\u610f|\u8ddf\u8e2a/i,
    reason: "Non-consensual recording, harassment, or targeting other people is not allowed.",
  },
  {
    flag: "illegal_activity",
    pattern: /\b(steal|shoplift|trespass|break into|hack account|fake id|illegal|vandalize)\b|\u5077|\u76d7\u7a83|\u95ef\u5165|\u8fdd\u6cd5|\u975e\u6cd5/i,
    reason: "Illegal activity cannot be turned into a challenge.",
  },
  {
    flag: "chance_or_real_money_gambling",
    pattern: /\b(coin flip|dice|roulette|slot machine|lottery|blackjack|casino|cash payout|withdraw cash)\b|\b(real money|cash|usd|\$)\b.{0,40}\b(coin flip|dice|roulette|slot|lottery|blackjack|casino|random number)\b|\u786c\u5e01|\u9ab0\u5b50|\u5f69\u7968|\u8001\u864e\u673a|\u8d4c\u573a|\u63d0\u73b0|\u73b0\u91d1\u8d54\u4ed8/i,
    reason: "Chance-based or cash-out gambling is blocked. Use internal-credit skill challenges only.",
  },
];

const REVIEW_RULES: Rule[] = [
  {
    flag: "high_physical_risk",
    pattern: /\b(fasting|no sleep|hold breath|extreme heat|ice bath|sauna|extreme spicy|ghost pepper|roof|jump from|speeding|dangerous)\b|\u7981\u98df|\u618b\u6c14|\u8df3\u697c|\u98d9\u8f66|\u5371\u9669/i,
    reason: "This looks physically risky and needs a safer version before publishing.",
  },
  {
    flag: "private_third_party",
    pattern: /\b(wife|husband|girlfriend|boyfriend|boss|teacher|coworker)\b|\u8001\u5a46|\u8001\u516c|\u5973\u53cb|\u7537\u53cb|\u8001\u677f|\u8001\u5e08|\u540c\u4e8b/i,
    reason: "Challenges involving third parties need consent and privacy checks.",
  },
  {
    flag: "minor_or_child",
    pattern: /\b(minor|child|kid|underage|teen)\b|\u672a\u6210\u5e74|\u5c0f\u5b69|\u5b69\u5b50/i,
    reason: "Challenges involving minors need strict review and cannot auto-settle.",
  },
];

function normalizeSafetyText(input: string) {
  return input
    .trim()
    .replace(/\b[A-Z][A-Z0-9-]{1,15}\s+(?:token|coin|ticker|price)\b/g, "[crypto_asset]")
    .replace(/\b[A-Za-z][A-Za-z0-9-]{1,15}\s+(?:token|ticker|price)\b/gi, "[crypto_asset]")
    .replace(/\b(?:token|coin|ticker)\s+[A-Z][A-Z0-9-]{1,15}\b/g, "[crypto_asset]")
    .replace(/\bhit\s+(?=\$|\d|above|below|over|under|the\s+target|price\b)/gi, "reach ")
    .replace(/\bhack\s+(?:an?\s+)?account\b/gi, "hack account")
    .replace(/\bhold\s+(?:my|your|their|his|her|our)?\s*breath\b/gi, "hold breath");
}

export function evaluateRuleSafety(input: string): RuleSafetyDecision {
  const safetyText = normalizeSafetyText(input);
  const blocked = BLOCK_RULES.filter((rule) => rule.pattern.test(safetyText));
  if (blocked.length > 0) {
    return {
      allowed: false,
      category: "blocked",
      reason: blocked[0].reason,
      flags: blocked.map((rule) => rule.flag),
    };
  }

  const review = REVIEW_RULES.filter((rule) => rule.pattern.test(safetyText));
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
