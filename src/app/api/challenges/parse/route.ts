import { NextRequest } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { parseChallenge, generateClarifications } from "@/lib/ai-engine";

/**
 * POST /api/challenges/parse — Parse natural language into structured challenge
 */
export async function POST(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) return unauthorized();

  try {
    const { input } = await req.json();

    if (!input || typeof input !== "string") {
      return Response.json({ error: "input string is required" }, { status: 400 });
    }

    const parsed = parseChallenge(input);
    const clarifications = generateClarifications(parsed);

    return Response.json({ parsed, clarifications });
  } catch (err) {
    console.error("Parse error:", err);
    return Response.json({ error: "Failed to parse challenge" }, { status: 500 });
  }
}
