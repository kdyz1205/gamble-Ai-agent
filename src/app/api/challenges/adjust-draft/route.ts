import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { getCredits } from "@/lib/credits";
import { completeOraclePrompt } from "@/lib/llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";
import type { ParsedChallenge } from "@/lib/ai-engine";

/**
 * POST /api/challenges/adjust-draft
 *
 * FREE — no credit charge (UX helper). The user types a natural-language tweak
 * ("raise stake to 100", "make it photo evidence", "30 days instead"), plus the
 * CURRENT full draft. We re-run the AI to produce an UPDATED FULL draft —
 * stakeOptions, evidenceOptions, deadlineOptions, reasoning, everything —
 * cascading the tweak through the whole draft coherently.
 *
 * Example: user raised stake from 25 to 500 → AI might now recommend a witness
 * as evidence (because stakes are higher) and a longer deadline (because more
 * commitment). The whole draft re-thinks, not just the one field.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { instruction, draft } = await req.json();
  if (!instruction || typeof instruction !== "string" || !draft) {
    return Response.json({ error: "instruction and draft required" }, { status: 400 });
  }

  const credits = await getCredits(user.userId);

  const providerId = DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  const model = def?.defaultModel ?? "claude-haiku-4-5-20251001";

  const apiKey = process.env[def?.envVar ?? "ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return Response.json({ error: "AI not configured" }, { status: 503 });
  }

  // Serialize the current draft compactly so the AI can see what it's modifying.
  const currentJson = JSON.stringify({
    title: draft.title,
    proposition: draft.proposition,
    marketType: draft.marketType,
    type: draft.type,
    suggestedStake: draft.suggestedStake ?? draft.stake,
    evidenceType: draft.evidenceType ?? draft.evidence,
    deadline: draft.deadline,
    rules: draft.rules,
    isPublic: draft.isPublic,
    stakeOptions: draft.stakeOptions,
    evidenceOptions: draft.evidenceOptions,
    deadlineOptions: draft.deadlineOptions,
    redFlags: draft.redFlags,
  }, null, 2);

  const system = `You are the AI brain of a challenge/betting platform. The user has a DRAFT and wants to tweak it using natural language. You must respond in the user's input language for all human-facing strings.

Your job: take the current draft + the user's tweak, and return a NEW COMPLETE draft with the tweak applied. Don't just change one field — cascade the change through the whole draft coherently.

Examples of cascading:
- User raises stake from 25 → 500 cr: you may now recommend witness evidence (higher stakes = stronger verification), longer deadline (more commitment), add redFlag about risk.
- User changes evidence from video → self_report: you may lower stakeOptions (less verification = less trust), add redFlag about manipulation risk.
- User extends deadline 1 day → 30 days: you may suggest a habit-tracking evidence mode if it fits.

Be thoughtful — the draft is a coherent whole, not isolated fields.

User's challenge budget: ${credits} credits. If the user raises stake above this, add a redFlag about insufficient balance.

Return ONLY valid JSON with the SAME SHAPE as ParsedChallenge:
{
  "intent": "definite_market" | "candidate_market",
  "title": "...",
  "proposition": "...",
  "marketType": "yes_no" | "threshold" | "head_to_head" | "challenge",
  "type": "Fitness" | "Cooking" | "Coding" | "Learning" | "Games" | "Prediction" | "General",
  "subject": "..." | null,
  "isPublic": boolean,
  "suggestedStake": number,
  "evidenceType": "video" | "photo" | "gps" | "self_report" | "witness" | ...,
  "deadline": "...",
  "rules": "...",
  "stakeOptions": [{ "amount": n, "label": "...", "reasoning": "..." }, ...],
  "evidenceOptions": [{ "type": "...", "label": "...", "reasoning": "...", "required": bool }, ...],
  "deadlineOptions": [{ "duration": "...", "reasoning": "..." }, ...],
  "redFlags": ["..."] | [],
  "recommendationSummary": "one sentence in user's language explaining the updated shape",
  "missingFields": [],
  "clarifyingQuestion": null | "question in user's language",
  "tweakMessage": "one short sentence in the user's language confirming what you changed and why"
}

CURRENT DRAFT:
${currentJson}`;

  try {
    const raw = await completeOraclePrompt({
      providerId,
      model,
      system,
      user: instruction,
      maxTokens: 2000,
      temperature: 0.3,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({
        draft,
        message: "I couldn't understand that adjustment. Try rewording — e.g. 'raise stake to 50 cr' or 'make evidence a video'.",
        credits,
      });
    }

    const result = JSON.parse(jsonMatch[0]) as ParsedChallenge & { tweakMessage?: string };

    // Sanitize — the new draft must be sane or we reject it.
    result.title = result.title || draft.title || "Untitled";
    result.type = result.type || "General";
    result.suggestedStake = typeof result.suggestedStake === "number" ? Math.max(0, Math.floor(result.suggestedStake)) : 0;
    result.evidenceType = result.evidenceType || "self_report";
    result.deadline = result.deadline || "24 hours";
    result.rules = result.rules || "";
    result.isPublic = Boolean(result.isPublic);
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.missingFields)) result.missingFields = [];

    return Response.json({
      draft: result,
      message: result.tweakMessage || "Draft updated.",
      credits,
    });
  } catch (err) {
    console.error("[adjust-draft]", err);
    return Response.json({
      draft,
      message: "Something went wrong adjusting your draft. Try again or tap a chip directly.",
      credits,
    }, { status: 200 }); // 200 + original draft = frontend keeps working
  }
}
