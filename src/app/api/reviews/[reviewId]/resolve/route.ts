import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { resolveReviewCase, ReviewFlowError, type ReviewResolution } from "@/lib/verdict-review";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { reviewId } = await params;

  try {
    const body = await req.json() as { resolution?: unknown; winnerId?: unknown; notes?: unknown };
    const resolution = body.resolution as ReviewResolution;
    if (!["uphold", "override", "refund"].includes(resolution)) {
      return Response.json({ error: "resolution must be uphold, override, or refund" }, { status: 400 });
    }
    const result = await resolveReviewCase({
      reviewId,
      reviewerUserId: user.userId,
      resolution,
      winnerId: typeof body.winnerId === "string" ? body.winnerId : null,
      notes: typeof body.notes === "string" ? body.notes : "",
    });
    return Response.json(result);
  } catch (error) {
    const status = error instanceof ReviewFlowError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Review resolution failed" }, { status });
  }
}
