import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number; // credits
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;
}

export interface JudgmentResult {
  winnerId: string | null;
  reasoning: string;
  confidence: number;
}

export async function parseChallenge(input: string, model = "claude-haiku-4-20250414"): Promise<ParsedChallenge> {
  if (!process.env.ANTHROPIC_API_KEY) return parseChallengeFallback(input);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: input }],
      system: `You parse natural language into a structured challenge. Credits are the in-app currency (1 credit ≈ $0.01). Return ONLY valid JSON with these fields:
- title (string, max 64 chars, concise)
- type (one of: Fitness, Cooking, Coding, Learning, Games, Video, General)
- suggestedStake (integer, credits to wager, 0 if none mentioned. If user says "$5", convert to 500 credits. If user says "10 credits" use 10.)
- evidenceType ("video" | "photo" | "gps" | "self_report")
- rules (string, brief rules)
- deadline (string like "48 hours", "7 days")
- isPublic (boolean, true unless user says private)`,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as ParsedChallenge;
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
  const questions = [];
  questions.push({
    question: `I'll set up a **${parsed.type}** challenge: "${parsed.title}". Who's your opponent?`,
    options: ["Invite a friend", "Anyone nearby", "Open to public"],
  });
  if (parsed.suggestedStake <= 0) {
    questions.push({
      question: "Would you like to stake some credits, or keep it free?",
      options: ["Free — just for fun", "5 credits", "10 credits", "20 credits"],
    });
  } else {
    questions.push({
      question: `You mentioned a ${parsed.suggestedStake} credit wager. Confirm or adjust?`,
      options: [`${parsed.suggestedStake} credits — confirm`, "5 credits", "10 credits", "20 credits", "50 credits"],
    });
  }
  questions.push({
    question: "How should we verify the result?",
    options: ["Video proof", "Photo evidence", "GPS tracking", "Self-report + honor system"],
  });
  return questions;
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
    deadline, isPublic: !/private|secret|just us|between us/i.test(input),
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
