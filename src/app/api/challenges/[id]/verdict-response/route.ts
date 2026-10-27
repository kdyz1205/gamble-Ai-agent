import { readJsonObject } from "@/lib/request-input";
import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import {
  recordVerdictDecision,
  ReviewFlowError,
  VerdictDecision,
  type VerdictDecisionValue,
} from "@/lib/verdict-review";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = await readJsonObject(req);
  if (!body) return Response.json({ error: "A JSON object is required" }, { status: 400 });
  try {
    const decision = body.decision as VerdictDecisionValue;
    if (![VerdictDecision.accepted, VerdictDecision.reviewRequested].includes(decision)) {
      return Response.json({ error: "decision must be accepted or review_requested" }, { status: 400 });
    }
    const result = await recordVerdictDecision({
      challengeId: id,
      userId: user.userId,
      decision,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    return Response.json(result, { status: result.settled ? 200 : 202 });
  } catch (error) {
    const status = error instanceof ReviewFlowError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Verdict response failed" }, { status });
  }
}
