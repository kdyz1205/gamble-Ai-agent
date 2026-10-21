import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { preExtractAndPersistFrames } from "@/lib/media/pre-extract-frames";
import { submitChallengeEvidence, EvidenceSubmissionError } from "@/lib/evidence-submission";
import { canReadQuestProof } from "@/lib/quest-proof-access";

// Vision frame extraction + Blob upload can take 5-20s for a longer video.
// Allow the background `after()` task to run up to 5min (Vercel Pro/Enterprise).
export const maxDuration = 300;

/**
 * POST /api/challenges/[id]/evidence — Submit evidence for a challenge
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  try {
    const { evidence, shouldPrepare } = await submitChallengeEvidence(user, id, body);
    const { type, url } = evidence;
    // Media preparation runs only after proof and readiness have committed.
    if (shouldPrepare && url && ["video", "photo", "image"].includes(type)) {
      after(() => preExtractAndPersistFrames({ evidenceId: evidence.id, challengeId: id, userId: user.userId,
        type, url, description: evidence.description, metadata: evidence.metadata }));
    }
    return Response.json({ evidence }, { status: 201 });
  } catch (error) {
    if (error instanceof EvidenceSubmissionError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[evidence] submission transaction failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Proof could not be saved. Please retry." }, { status: 500 });
  }
}

/**
 * GET /api/challenges/[id]/evidence — List evidence for a challenge
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const quest = await prisma.challenge.findUnique({ where: { id }, include: { participants: { select: { userId: true, status: true } } } });
  if (!quest) return Response.json({ error: "Quest not found" }, { status: 404 });
  if (!await canReadQuestProof(quest)) return Response.json({ error: "Private proof is available only to quest participants" }, { status: 403 });
  const evidence = await prisma.evidence.findMany({
    where: { challengeId: id },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ evidence }, { headers: { "Cache-Control": "private, no-store" } });
}
