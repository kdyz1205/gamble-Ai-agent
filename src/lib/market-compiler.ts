/**
 * Market Compiler — transforms natural language into structured market drafts.
 *
 * Not a "challenge detector". A compiler.
 * Every input gets classified into one of 3 levels:
 *   - definite_market: enough info to publish immediately
 *   - candidate_market: clearly a bet/challenge, but missing fields
 *   - ordinary_chat: genuinely not a market
 *
 * Markets map to 4 primitives:
 *   - yes_no: "Will X happen?"
 *   - threshold: "Will X exceed Y?"
 *   - head_to_head: "A vs B, who wins?"
 *   - challenge: "Can I/someone do X?"
 */

import { parseAmount, normalizeTranscript } from "./amount-parser";

// ── Types ──

export type MarketType = "yes_no" | "threshold" | "head_to_head" | "challenge";
export type CompileLevel = "definite_market" | "candidate_market" | "ordinary_chat";

export interface MarketDraft {
  marketType: MarketType;
  proposition: string;
  title: string;
  subject: string | null;
  stake: number;
  stakeUnit: "credits" | "usd" | "ambiguous" | "unset";
  evidenceType: string;
  eventTime: string | null;
  joinWindow: string | null;
  proofSource: string | null;
  arbiter: string | null;
  fallbackRule: string | null;
  visibility: "private" | "public";
  // For ChallengeDraft compatibility
  type: string;
  deadline: string;
  rules: string;
  aiReview: boolean;
  isPublic: boolean;
}

export interface Clarification {
  field: keyof MarketDraft;
  question: string;
  options: Array<{
    label: string;
    value: string | number | boolean;
    patch: Partial<MarketDraft>;
  }>;
}

export interface CompileResult {
  level: CompileLevel;
  draft: MarketDraft | null;
  understanding: string; // human-readable summary of what system understood
  missingFields: string[];
  nextQuestion: Clarification | null;
  allClarifications: Clarification[];
  stakeNeedsConfirmation: boolean;
  stakeConfirmPrompt: string | null;
}

// ── Slot extractors ──

function extractMarketType(s: string): { type: MarketType; confidence: number } {
  const lower = s.toLowerCase();

  // Head-to-head: "A vs B", "who is faster", "谁先", "比谁"
  if (/\bvs\b|versus|比谁|谁先|谁能|who.*faster|who.*first|who.*better|who.*more|race|比赛/i.test(lower)) {
    return { type: "head_to_head", confidence: 0.9 };
  }

  // Threshold: "exceed", "break", "涨超", "超过", "within X minutes"
  if (/exceed|break|surpass|超过|涨超|破|within \d|在\d.*内|能不能.*\d/i.test(lower)) {
    return { type: "threshold", confidence: 0.8 };
  }

  // Yes/No: "will X", "会不会", "能不能过", "是不是"
  if (/will\b|会不会|能不能过|是不是|whether|gonna|going to|会过|会赢|会输/i.test(lower)) {
    return { type: "yes_no", confidence: 0.8 };
  }

  // Challenge: "I can", "我能", "dare", "bet I can", "challenge"
  if (/i can|我能|dare|bet i|i bet|challenge|能做到|做完|吃完|跑完/i.test(lower)) {
    return { type: "challenge", confidence: 0.85 };
  }

  // Default: if there's any bet-like language, default to yes_no
  if (/bet|赌|wager|stake|打赌|credit|\$/i.test(lower)) {
    return { type: "yes_no", confidence: 0.5 };
  }

  return { type: "challenge", confidence: 0.2 };
}

function extractProposition(input: string): string {
  let prop = input.trim();
  // Remove bet/wager preamble
  prop = prop.replace(/^(i bet|我赌|我打赌|bet that|赌)\s*/i, "");
  // Remove trailing stake info
  prop = prop.replace(/[,，]\s*(\d+\s*(credit|dollar|块|刀|u\b).*$)/i, "");
  // Clean up
  prop = prop.replace(/\s+/g, " ").trim();
  if (prop.length > 80) prop = prop.slice(0, 77) + "…";
  return prop || input.slice(0, 80);
}

function extractSubject(s: string): string | null {
  const lower = s.toLowerCase();
  // Named subjects: "Benny's wife", "Jennifer", etc.
  const nameMatch = s.match(/(?:^|\s)([A-Z][a-z]+(?:'s?\s+\w+)?)/);
  if (nameMatch && !/^(I|We|You|My|The|This|That|It|He|She)\b/.test(nameMatch[1])) {
    return nameMatch[1];
  }
  // Chinese name patterns
  const cnMatch = s.match(/([\u4e00-\u9fff]{2,4}(?:的\w+)?)/);
  if (cnMatch && !/^(我能|我赌|我打|谁能|谁先|会不会|能不能)/.test(cnMatch[1])) {
    return cnMatch[1];
  }
  if (/\bi\b|我/i.test(lower)) return "self";
  return null;
}

function extractEvidenceType(s: string): string {
  const lower = s.toLowerCase();
  if (/video|录像|视频|record|拍/i.test(lower)) return "Video proof";
  if (/photo|照片|pic|截图|screenshot/i.test(lower)) return "Photo evidence";
  if (/gps|location|位置/i.test(lower)) return "GPS tracking";
  return "unset";
}

function extractEventTime(s: string): string | null {
  // Absolute dates
  const dateMatch = s.match(/(\d{1,2}月\d{1,2}[号日]|\w+ \d{1,2}(?:th|st|nd|rd)?|tomorrow|今天|明天|后天|下周)/i);
  if (dateMatch) return dateMatch[0];
  // Relative time
  const relMatch = s.match(/(\d+\s*(?:min|hour|day|week|分钟|小时|天|周))/i);
  if (relMatch) return relMatch[0];
  return null;
}

function extractProofSource(s: string): string | null {
  const match = s.match(/(\w+)\s*(?:发结果|来发|provides?|submits?|reports?)/i);
  if (match) return match[1];
  return null;
}

function extractArbiter(s: string): string | null {
  const match = s.match(/(\w+)\s*(?:裁定|裁决|judges?|decides?|arbitrates?)/i);
  if (match) return match[1];
  return null;
}

function extractFallbackRule(s: string): string | null {
  if (/退款|refund|没人发就退|no.*proof.*refund/i.test(s)) return "refund_if_no_proof";
  if (/forfeit|罚没|没.*发.*判输/i.test(s)) return "forfeit_if_no_proof";
  return null;
}

function extractActivityType(s: string): string {
  const lower = s.toLowerCase();
  if (/pushup|squat|plank|run|fitness|gym|workout|俯卧撑|跑步|健身/i.test(lower)) return "Fitness";
  if (/cook|bake|food|pasta|做饭|烘焙/i.test(lower)) return "Cooking";
  if (/code|coding|program|写代码|编程/i.test(lower)) return "Coding";
  if (/read|book|study|learn|exam|阅读|学习|考试/i.test(lower)) return "Learning";
  if (/chess|game|play|match|游戏|比赛/i.test(lower)) return "Games";
  if (/btc|eth|bitcoin|stock|crypto|coin|token|涨|跌/i.test(lower)) return "Prediction";
  if (/dmv|driver|license|驾照|考试/i.test(lower)) return "Prediction";
  return "General";
}

// ── Compile level classifier ──

function classifyLevel(input: string, extracted: Partial<MarketDraft>): CompileLevel {
  const s = input.toLowerCase();
  let score = 0;

  // Strong market signals
  if (/\$\d|credit|stake|wager|bet|赌|打赌|对赌|下注/i.test(s)) score += 4;
  if (extracted.stake && extracted.stake > 0) score += 3;

  // Medium signals: competitive/outcome language
  if (/who|can|will|能|会|谁|比|dare|challenge|versus|vs/i.test(s)) score += 2;
  if (extracted.eventTime) score += 1;
  if (extracted.subject) score += 1;

  // Proposition strength
  if (extracted.proposition && extracted.proposition.length > 15) score += 1;

  // Activity type recognized
  if (extracted.type && extracted.type !== "General") score += 1;

  // Anti-signals
  if (/^(hi|hello|hey|你好|嗨|how are|what is|help|帮我|怎么用)\b/i.test(s)) score -= 5;
  if (s.length < 5) score -= 3;

  if (score >= 5) return "definite_market";
  if (score >= 2) return "candidate_market";
  return "ordinary_chat";
}

// ── Main compiler ──

export function compileMarket(rawInput: string): CompileResult {
  const input = normalizeTranscript(rawInput);

  // Extract all slots
  const { type: marketType } = extractMarketType(input);
  const proposition = extractProposition(input);
  const subject = extractSubject(input);
  const amountResult = parseAmount(input);
  const evidenceType = extractEvidenceType(input);
  const eventTime = extractEventTime(input);
  const proofSource = extractProofSource(input);
  const arbiter = extractArbiter(input);
  const fallbackRule = extractFallbackRule(input);
  const activityType = extractActivityType(input);

  const stake = amountResult && !amountResult.needsConfirmation ? amountResult.credits : 0;
  const stakeUnit = amountResult ? amountResult.unit : "unset" as const;

  const draft: MarketDraft = {
    marketType,
    proposition,
    title: proposition,
    subject,
    stake,
    stakeUnit,
    evidenceType,
    eventTime,
    joinWindow: null,
    proofSource,
    arbiter,
    fallbackRule,
    visibility: "private",
    type: activityType,
    deadline: eventTime || "24 hours",
    rules: proposition,
    aiReview: true,
    isPublic: false,
  };

  // Classify
  const level = classifyLevel(input, draft);

  if (level === "ordinary_chat") {
    return {
      level,
      draft: null,
      understanding: "This doesn't seem like a bet or challenge. Try describing what you want to wager on.",
      missingFields: [],
      nextQuestion: null,
      allClarifications: [],
      stakeNeedsConfirmation: false,
      stakeConfirmPrompt: null,
    };
  }

  // Find missing fields
  const missing: string[] = [];
  const clarifications: Clarification[] = [];

  if (stake === 0 && stakeUnit === "unset") {
    missing.push("stake");
    clarifications.push({
      field: "stake",
      question: "How much to stake?",
      options: [
        { label: "Free — no stake", value: 0, patch: { stake: 0, stakeUnit: "credits" } },
        { label: "5 credits", value: 5, patch: { stake: 5, stakeUnit: "credits" } },
        { label: "10 credits", value: 10, patch: { stake: 10, stakeUnit: "credits" } },
        { label: "25 credits", value: 25, patch: { stake: 25, stakeUnit: "credits" } },
      ],
    });
  }

  if (evidenceType === "unset") {
    missing.push("evidenceType");
    clarifications.push({
      field: "evidenceType",
      question: "How will the result be verified?",
      options: [
        { label: "Video proof", value: "Video proof", patch: { evidenceType: "Video proof" } },
        { label: "Photo", value: "Photo evidence", patch: { evidenceType: "Photo evidence" } },
        { label: "Self-report", value: "Self-report", patch: { evidenceType: "Self-report" } },
      ],
    });
  }

  if (!eventTime) {
    missing.push("deadline");
    clarifications.push({
      field: "deadline",
      question: "When does this resolve?",
      options: [
        { label: "1 hour", value: "1 hour", patch: { deadline: "1 hour", eventTime: "1 hour" } },
        { label: "24 hours", value: "24 hours", patch: { deadline: "24 hours", eventTime: "24 hours" } },
        { label: "1 week", value: "7 days", patch: { deadline: "7 days", eventTime: "7 days" } },
      ],
    });
  }

  // Build understanding string
  const parts: string[] = [];
  parts.push(`**${marketType.replace(/_/g, " ")}** market`);
  if (subject && subject !== "self") parts.push(`about ${subject}`);
  parts.push(`→ "${proposition}"`);
  if (stake > 0) parts.push(`| ${stake} credits`);
  if (eventTime) parts.push(`| by ${eventTime}`);
  if (evidenceType !== "unset") parts.push(`| ${evidenceType.toLowerCase()}`);

  const understanding = missing.length === 0
    ? `Ready to publish: ${parts.join(" ")}`
    : `I understood: ${parts.join(" ")}. Missing: ${missing.join(", ")}.`;

  return {
    level,
    draft,
    understanding,
    missingFields: missing,
    nextQuestion: clarifications[0] || null,
    allClarifications: clarifications,
    stakeNeedsConfirmation: amountResult?.needsConfirmation || false,
    stakeConfirmPrompt: amountResult?.confirmationPrompt || null,
  };
}
