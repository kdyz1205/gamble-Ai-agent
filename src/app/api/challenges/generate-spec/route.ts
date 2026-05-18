import { NextRequest } from "next/server";
import { parseChallenge } from "@/lib/ai-engine";

function toSpec(inputText: string, parsed: Awaited<ReturnType<typeof parseChallenge>>) {
  return {
    challenge_title: parsed.title,
    challenge_type: parsed.type,
    participants: [
      { role: "creator", label: "You" },
      { role: "opponent", label: "Opponent" },
    ],
    stake_amount: parsed.suggestedStake,
    currency_or_points: "credits",
    public_or_private: parsed.isPublic ? "public" : "private",
    invite_mode: "invite_link",
    participation_mode: parsed.evidenceType === "video" ? "remote_live" : "remote_async",
    objective: parsed.proposition || parsed.title || inputText,
    winning_condition: parsed.proposition || parsed.rules || parsed.title || inputText,
    required_evidence: parsed.evidenceType || "video",
    video_capture_instructions: parsed.evidenceType === "video"
      ? "Record continuous video showing the full attempt and both participants when possible."
      : "Submit evidence that clearly proves the result.",
    start_condition: "Challenge starts when the opponent accepts.",
    end_condition: parsed.deadline || "24 hours",
    timing_method: parsed.deadline || "24 hours",
    valid_repetition_definition: parsed.rules || parsed.proposition || inputText,
    scoring_method: parsed.rules || "AI reviews submitted evidence against the challenge rules.",
    allowed_attempts: "One official attempt per participant unless both agree otherwise.",
    anti_cheat_rules: parsed.redFlags?.length
      ? parsed.redFlags
      : ["Evidence must be original, timestamped when possible, and not edited to misrepresent the result."],
    ai_judging_method: "AI recommends a verdict from submitted evidence; unclear cases require manual review.",
    dispute_window: "24 hours",
    fallback_manual_review: "Manual review required if AI confidence is low or evidence is ambiguous.",
    payout_rule: "Winner receives the internal credits according to the challenge stake.",
    safety_warning: "Do not attempt unsafe, illegal, or non-consensual challenges.",
    legal_compliance_flag: "internal_points_only",
    deadline: parsed.deadline || "24 hours",
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const inputText = String(body.inputText || body.input || body.message || "").trim();

  if (!inputText) {
    return Response.json({ error: "inputText is required" }, { status: 400 });
  }
  if (inputText.length > 2000) {
    return Response.json({ error: "Challenge prompt is too long. Keep it under 2000 characters." }, { status: 400 });
  }

  try {
    const parsed = await parseChallenge(inputText, typeof body.model === "string" ? body.model : undefined);
    return Response.json({
      rawPrompt: inputText,
      parsed,
      spec: toSpec(inputText, parsed),
      model: "compat-parse",
      source: "compat",
      providerId: "compat",
      externalApiCharged: false,
    });
  } catch (err) {
    console.error("[generate-spec compat]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to generate challenge spec" },
      { status: 500 },
    );
  }
}
