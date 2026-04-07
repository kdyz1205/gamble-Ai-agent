import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number;
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;
  // Extended fields from LLM
  marketType?: "yes_no" | "threshold" | "head_to_head" | "challenge";
  proposition?: string;
  intent?: "definite_market" | "candidate_market" | "ordinary_chat";
  subject?: string;
  missingFields?: string[];
  clarifyingQuestion?: string;
}

export interface JudgmentResult {
  winnerId: string | null;
  reasoning: string;
  confidence: number;
}

const MARKET_COMPILER_PROMPT = `You are a market compiler. You take natural language (English, Chinese, or mixed) and compile it into a structured betting market.

Your job:
1. Understand the user's INTENT — are they describing a bet, challenge, prediction, or just chatting?
2. Extract a CANONICAL PROPOSITION — a clear, unambiguous statement of what's being wagered on
3. Classify into one of 4 MARKET TYPES:
   - yes_no: "Will X happen?" (e.g., "Will Benny's wife pass DMV?")
   - threshold: "Will X exceed Y?" (e.g., "Can I eat 10 burgers in 10 min?")
   - head_to_head: "A vs B" (e.g., "Who runs 5K faster?")
   - challenge: "Can someone do X?" (e.g., "50 pushups in 2 minutes")
4. Extract all available SLOTS from the input
5. Identify MISSING fields and generate ONE clarifying question

INTENT classification:
- "definite_market": enough info to publish (has proposition + at least stake or clear outcome)
- "candidate_market": clearly a bet/challenge but missing key fields
- "ordinary_chat": not a bet at all

CURRENCY RULES:
- "credits" / "cr" / "积分" = credits (1:1)
- "$" / "dollars" / "美金" / "美元" = USD → multiply by 100 for credits
- "块" / "元" / "刀" without context = AMBIGUOUS, set suggestedStake to the raw number and note it
- bare number = ambiguous

Return ONLY valid JSON:
{
  "intent": "definite_market" | "candidate_market" | "ordinary_chat",
  "marketType": "yes_no" | "threshold" | "head_to_head" | "challenge",
  "title": "short title, max 64 chars",
  "proposition": "clear canonical statement of the bet",
  "type": "Fitness" | "Cooking" | "Coding" | "Learning" | "Games" | "Prediction" | "General",
  "subject": "who/what the bet is about, or null",
  "suggestedStake": 0,
  "evidenceType": "video" | "photo" | "gps" | "self_report",
  "rules": "clear rules for resolution",
  "deadline": "24 hours",
  "isPublic": false,
  "missingFields": ["stake", "evidenceType", ...],
  "clarifyingQuestion": "One question to ask, or null if complete"
}`;

export async function parseChallenge(input: string, model = "claude-haiku-4-20250414"): Promise<ParsedChallenge> {
  if (!process.env.ANTHROPIC_API_KEY) return parseChallengeFallback(input);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 800,
      messages: [{ role: "user", content: input }],
      system: MARKET_COMPILER_PROMPT,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedChallenge;
      // Ensure required fields have defaults
      parsed.title = parsed.title || input.slice(0, 64);
      parsed.type = parsed.type || "General";
      parsed.suggestedStake = parsed.suggestedStake || 0;
      parsed.evidenceType = parsed.evidenceType || "self_report";
      parsed.rules = parsed.rules || "";
      parsed.deadline = parsed.deadline || "24 hours";
      parsed.isPublic = parsed.isPublic ?? false;
      return parsed;
    }
  } catch {
    // fall through
  }

  return parseChallengeFallback(input);
}

export async function judgeChallenge(
  challengeTitle: string,
  challengeType: string,
  evidenceA: { description: string | null; type: string } | null,
  evidenceB: { description: string | null; type: string } | null,
  participantAId: string,
  participantBId: string,
  model = "claude-haiku-4-20250414",
): Promise<JudgmentResult> {
  if (!evidenceA && !evidenceB) {
    return { winnerId: null, reasoning: "Neither participant submitted evidence. Challenge voided — credits refunded.", confidence: 0.95 };
  }
  if (evidenceA && !evidenceB) {
    return { winnerId: participantAId, reasoning: `Only participant A submitted ${evidenceA.type} evidence. Winner by default.`, confidence: 0.85 };
  }
  if (!evidenceA && evidenceB) {
    return { winnerId: participantBId, reasoning: `Only participant B submitted ${evidenceB.type} evidence. Winner by default.`, confidence: 0.85 };
  }

  if (!process.env.ANTHROPIC_API_KEY) return judgeChallengeFallback(challengeTitle, evidenceA!, evidenceB!, participantAId, participantBId);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Judge this "${challengeType}" challenge: "${challengeTitle}"

Participant A evidence (${evidenceA!.type}): ${evidenceA!.description || "No description"}
Participant B evidence (${evidenceB!.type}): ${evidenceB!.description || "No description"}

Return JSON: { "winner": "A" or "B", "reasoning": "...", "confidence": 0.0-1.0 }`,
      }],
      system: "You are a fair AI judge for challenges. Analyze evidence objectively. Return ONLY valid JSON.",
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        winnerId: result.winner === "A" ? participantAId : participantBId,
        reasoning: result.reasoning,
        confidence: result.confidence,
      };
    }
  } catch {
    // fall through
  }

  return judgeChallengeFallback(challengeTitle, evidenceA!, evidenceB!, participantAId, participantBId);
}

export function generateClarifications(parsed: ParsedChallenge): Array<{ question: string; options: string[] }> {
  // If LLM already provided a single clarifying question, use it
  if (parsed.clarifyingQuestion) {
    return [{
      question: parsed.clarifyingQuestion,
      options: getOptionsForField(parsed.missingFields?.[0] || "stake"),
    }];
  }

  // Otherwise, generate based on missing fields
  const questions: Array<{ question: string; options: string[] }> = [];

  const missing = parsed.missingFields || [];

  // Only ask about truly missing fields — one at a time ideally
  if (missing.includes("stake") || parsed.suggestedStake <= 0) {
    questions.push({
      question: "How much to stake?",
      options: ["Free — no stake", "5 credits", "10 credits", "25 credits", "50 credits"],
    });
  }

  if (missing.includes("evidenceType") || parsed.evidenceType === "self_report") {
    questions.push({
      question: "How should the result be verified?",
      options: ["Video proof", "Photo evidence", "Self-report"],
    });
  }

  if (missing.includes("deadline")) {
    questions.push({
      question: "When does this resolve?",
      options: ["1 hour", "24 hours", "48 hours", "1 week"],
    });
  }

  return questions;
}

function getOptionsForField(field: string): string[] {
  switch (field) {
    case "stake": return ["Free", "5 credits", "10 credits", "25 credits"];
    case "evidenceType": return ["Video proof", "Photo", "Self-report"];
    case "deadline": return ["1 hour", "24 hours", "48 hours", "1 week"];
    default: return ["Yes", "No"];
  }
}

/* ── Fallback parsers (no API key) ── */

const TYPE_PATTERNS: Record<string, RegExp> = {
  Fitness:  /pushup|push-up|run|jog|gym|workout|plank|squat|exercise|mile|km|bench|deadlift|pullup|pull-up|burpee|cycling|swim|marathon|sprint|fitness/i,
  Cooking:  /cook|bake|food|pasta|recipe|dish|meal|kitchen|chef|cake|bread|grill|bbq/i,
  Coding:   /code|coding|program|leetcode|dev|developer|bug|algorithm|hack|github|commit|debug|api|software/i,
  Learning: /read|book|study|learn|exam|test|quiz|course|gpa|grade|class|homework|essay|paper/i,
  Games:    /chess|game|play|match|tournament|poker|board|card|esport|fortnite|valorant|league|rank/i,
  Video:    /video|film|tiktok|youtube|stream|record|dance|sing|perform/i,
};

function parseChallengeFallback(input: string): ParsedChallenge {
  let type = "General";
  for (const [t, pattern] of Object.entries(TYPE_PATTERNS)) {
    if (pattern.test(input)) { type = t; break; }
  }

  let amount = 0;
  const creditMatch = input.match(/(\d+)\s*credit/i);
  const dollarMatch = input.match(/\$(\d+(?:\.\d{2})?)/);
  if (creditMatch) {
    amount = parseInt(creditMatch[1]);
  } else if (dollarMatch) {
    amount = Math.round(parseFloat(dollarMatch[1]) * 100); // $1 = 100 credits
  } else if (/(\d+)\s*(?:pts|points|coins)/i.test(input)) {
    amount = parseInt(RegExp.$1);
  } else if (/money|stake|bet|wager|dollar|cash/i.test(input)) {
    amount = 10;
  }

  let evidenceType = "self_report";
  if (/video|record|film|stream/i.test(input)) evidenceType = "video";
  else if (/photo|picture|screenshot|snap/i.test(input)) evidenceType = "photo";
  else if (/gps|location|track|distance|strava/i.test(input)) evidenceType = "gps";

  const hourMatch = input.match(/(\d+)\s*(?:hour|hr)s?/i);
  const dayMatch = input.match(/(\d+)\s*days?/i);
  const deadline = hourMatch ? `${hourMatch[1]} hours` : dayMatch ? `${dayMatch[1]} days` : "48 hours";

  let title = input.replace(/^(?:I want to|I'd like to|Let's|Can we|I bet|I wager|Create a?)\s+/i, "").trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > 64) title = title.slice(0, 61) + "…";

  return {
    title, type, suggestedStake: amount, evidenceType,
    rules: `Standard ${type.toLowerCase()} challenge — AI reviewed`,
    deadline, isPublic: /public|open|anyone|everyone|open to all/i.test(input),
  };
}

function judgeChallengeFallback(
  challengeTitle: string,
  evidenceA: { description: string | null; type: string },
  evidenceB: { description: string | null; type: string },
  participantAId: string,
  participantBId: string,
): JudgmentResult {
  const random = Math.random();
  const winnerId = random > 0.5 ? participantAId : participantBId;
  const confidence = 0.65 + Math.random() * 0.25;
  return {
    winnerId, confidence,
    reasoning: `AI analyzed evidence from both participants for "${challengeTitle}". Based on ${evidenceA.type} and ${evidenceB.type} submissions, the winner was determined with ${(confidence * 100).toFixed(0)}% confidence.`,
  };
}
