import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { getCredits } from "@/lib/credits";
import { completeOraclePrompt } from "@/lib/llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";

/**
 * POST /api/challenges/adjust-draft
 *
 * FREE — no credit charge. This is a UX helper, not a game action.
 * Takes the current draft + user instruction in natural language,
 * returns the adjusted fields + a confirmation message.
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

  const system = `You are a draft-adjustment assistant for a challenge platform. The user wants to modify their challenge draft. You MUST understand instructions in ANY language (English, Chinese, Spanish, etc.) and respond in the SAME language the user writes in.

CURRENT DRAFT:
title: "${draft.title}"
type: "${draft.type}"
stake: ${draft.stake} credits
deadline: "${draft.deadline}"
rules: "${draft.rules}"
evidence: "${draft.evidence}"
isPublic: ${draft.isPublic}
user_credits: ${credits}

TASK: Parse the user's instruction. Return ONLY a JSON object with two keys:
- "changes": object containing ONLY fields that change. Valid keys and types:
  title (string), type (string), stake (number ≥ 0), deadline (string), rules (string), evidence (one of "Video proof"|"Photo evidence"|"GPS tracking"|"Self-report"), isPublic (boolean)
- "message": short confirmation in the user's language. If new stake > ${credits}, warn them.

IMPORTANT: If the user's intent is clear, ALWAYS return changes. Never return empty changes when you can infer the modification. Common patterns:
- "免费/free/gratis" → stake: 0
- "降低/lower/reduce" + number → stake: that number
- "改成/change to/switch" + evidence type → evidence field
- "公开/public" → isPublic: true; "私密/private" → isPublic: false
- Any number alone likely refers to stake

Output raw JSON only. No markdown. No wrapping.`;

  try {
    const raw = await completeOraclePrompt({
      providerId,
      model,
      system,
      user: instruction,
      maxTokens: 300,
      temperature: 0,
    });

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({
        changes: {},
        message: "I couldn't understand that adjustment. Try something like: 'lower stake to 5' or 'change to photo evidence'.",
      });
    }

    const result = JSON.parse(jsonMatch[0]);
    const changes = result.changes ?? {};
    const message = result.message ?? "Draft updated.";

    // Sanitize: ensure stake is a number, isPublic is boolean
    if ("stake" in changes) changes.stake = Math.max(0, Math.floor(Number(changes.stake) || 0));
    if ("isPublic" in changes) changes.isPublic = Boolean(changes.isPublic);
    if ("evidence" in changes) {
      const valid = ["Video proof", "Photo evidence", "GPS tracking", "Self-report"];
      if (!valid.includes(changes.evidence)) delete changes.evidence;
    }

    return Response.json({ changes, message, credits });
  } catch (err) {
    console.error("[adjust-draft]", err);
    return Response.json({
      changes: {},
      message: "Something went wrong adjusting your draft. Try again or edit the fields directly.",
    });
  }
}
