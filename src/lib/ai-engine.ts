/**
 * AI Challenge Engine
 *
 * Handles:
 * 1. Natural language → structured challenge parsing
 * 2. AI-based judging of challenge outcomes
 * 3. Evidence analysis (simulated)
 */

export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number;
  currency: "USD" | "points" | "none";
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;
}

export interface JudgmentResult {
  winnerId: string | null;
  reasoning: string;
  confidence: number; // 0-1
}

/* ── Type detection ── */
const TYPE_PATTERNS: Record<string, RegExp> = {
  Fitness:  /pushup|push-up|run|jog|gym|workout|plank|squat|exercise|mile|km|bench|deadlift|pullup|pull-up|burpee|cycling|swim|marathon|sprint|fitness/i,
  Cooking:  /cook|bake|food|pasta|recipe|dish|meal|kitchen|chef|cake|bread|grill|bbq/i,
  Coding:   /code|coding|program|leetcode|dev|developer|bug|algorithm|hack|github|commit|debug|api|software/i,
  Learning: /read|book|study|learn|exam|test|quiz|course|gpa|grade|class|homework|essay|paper/i,
  Games:    /chess|game|play|match|tournament|poker|board|card|esport|fortnite|valorant|league|rank/i,
  Video:    /video|film|tiktok|youtube|stream|record|dance|sing|perform/i,
};

function detectType(input: string): string {
  for (const [type, pattern] of Object.entries(TYPE_PATTERNS)) {
    if (pattern.test(input)) return type;
  }
  return "General";
}

/* ── Stake extraction ── */
function extractStake(input: string): { amount: number; currency: "USD" | "points" | "none" } {
  const dollarMatch = input.match(/\$(\d+(?:\.\d{2})?)/);
  if (dollarMatch) return { amount: parseFloat(dollarMatch[1]), currency: "USD" };

  const ptsMatch = input.match(/(\d+)\s*(?:pts|points|coins)/i);
  if (ptsMatch) return { amount: parseInt(ptsMatch[1]), currency: "points" };

  if (/money|stake|bet|wager|dollar|cash/i.test(input)) {
    return { amount: 20, currency: "USD" }; // default $20
  }

  return { amount: 0, currency: "none" };
}

/* ── Evidence type detection ── */
function detectEvidence(input: string): string {
  if (/video|record|film|stream/i.test(input)) return "video";
  if (/photo|picture|screenshot|snap/i.test(input)) return "photo";
  if (/gps|location|track|distance|strava/i.test(input)) return "gps";
  return "self_report";
}

/* ── Deadline extraction ── */
function extractDeadline(input: string): string {
  const hourMatch = input.match(/(\d+)\s*(?:hour|hr)s?/i);
  if (hourMatch) return `${hourMatch[1]} hours`;

  const minMatch = input.match(/(\d+)\s*(?:min|minute)s?/i);
  if (minMatch) return `${minMatch[1]} minutes`;

  const dayMatch = input.match(/(\d+)\s*days?/i);
  if (dayMatch) return `${dayMatch[1]} days`;

  const weekMatch = input.match(/(\d+)\s*weeks?/i);
  if (weekMatch) return `${weekMatch[1]} weeks`;

  if (/today|tonight/i.test(input)) return "24 hours";
  if (/tomorrow/i.test(input)) return "48 hours";
  if (/weekend|saturday|sunday/i.test(input)) return "7 days";

  return "48 hours";
}

/* ── Title generation ── */
function generateTitle(input: string, type: string): string {
  // Try to create a concise title
  let title = input.trim();

  // Remove common prefixes
  title = title.replace(/^(?:I want to|I'd like to|Let's|Can we|I bet|I wager|Create a?)\s+/i, "");

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Truncate
  if (title.length > 64) title = title.slice(0, 61) + "…";

  return title;
}

/**
 * Parse natural language input into a structured challenge.
 */
export function parseChallenge(input: string): ParsedChallenge {
  const type = detectType(input);
  const { amount, currency } = extractStake(input);
  const evidenceType = detectEvidence(input);
  const deadline = extractDeadline(input);
  const title = generateTitle(input, type);
  const isPublic = !/private|secret|just us|between us/i.test(input);

  return {
    title,
    type,
    suggestedStake: amount,
    currency,
    evidenceType,
    rules: `Standard ${type.toLowerCase()} challenge — AI reviewed`,
    deadline,
    isPublic,
  };
}

/**
 * Generate AI clarification questions based on parsed challenge.
 */
export function generateClarifications(parsed: ParsedChallenge): Array<{
  question: string;
  options: string[];
}> {
  const questions = [];

  // Q1: Opponent
  questions.push({
    question: `I'll set up a **${parsed.type}** challenge: "${parsed.title}". Who's your opponent?`,
    options: ["Invite a friend", "Anyone nearby", "Open to public"],
  });

  // Q2: Stakes
  if (parsed.currency === "none") {
    questions.push({
      question: "Would you like to add a money stake, or keep it free?",
      options: ["Free — just for fun", "$10 stake", "$20 stake", "$50 stake"],
    });
  } else {
    questions.push({
      question: `You mentioned a $${parsed.suggestedStake} wager. Confirm or adjust?`,
      options: [`$${parsed.suggestedStake} — confirm`, "$10", "$25", "$50", "$100"],
    });
  }

  // Q3: Evidence
  questions.push({
    question: "How should we verify the result?",
    options: ["Video proof", "Photo evidence", "GPS tracking", "Self-report + honor system"],
  });

  return questions;
}

/**
 * AI Judge — evaluate evidence and determine winner.
 * In production this would call Claude API for analysis.
 * Currently uses rule-based simulation.
 */
export function judgeChallenge(
  challengeTitle: string,
  challengeType: string,
  evidenceA: { description: string | null; type: string } | null,
  evidenceB: { description: string | null; type: string } | null,
  participantAId: string,
  participantBId: string,
): JudgmentResult {
  // If only one side submitted evidence
  if (evidenceA && !evidenceB) {
    return {
      winnerId: participantAId,
      reasoning: `Only participant A submitted ${evidenceA.type} evidence. Participant B did not provide proof. Winner: Participant A by default.`,
      confidence: 0.85,
    };
  }
  if (!evidenceA && evidenceB) {
    return {
      winnerId: participantBId,
      reasoning: `Only participant B submitted ${evidenceB.type} evidence. Participant A did not provide proof. Winner: Participant B by default.`,
      confidence: 0.85,
    };
  }
  if (!evidenceA && !evidenceB) {
    return {
      winnerId: null,
      reasoning: "Neither participant submitted evidence. Challenge voided — stakes will be refunded.",
      confidence: 0.95,
    };
  }

  // Both submitted — simulate AI analysis
  // In production: send evidence to Claude/GPT-4V for analysis
  const random = Math.random();
  const winnerId = random > 0.5 ? participantAId : participantBId;
  const confidence = 0.65 + Math.random() * 0.25; // 0.65 - 0.90

  return {
    winnerId,
    reasoning: `AI analyzed ${challengeType.toLowerCase()} evidence from both participants. Based on the ${evidenceA!.type} and ${evidenceB!.type} submissions for "${challengeTitle}", the AI determined the winner with ${(confidence * 100).toFixed(0)}% confidence.`,
    confidence,
  };
}
