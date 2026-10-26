import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, getAiModel, unauthorized, noCredits, type TierId } from "@/lib/auth";
import { getCredits, TIER_MULTIPLIER } from "@/lib/credits";
import { getOrCreateJudgeJob, runJudgeJob } from "@/lib/judge-async";
import { isEvidenceUrlAllowed } from "@/lib/media/evidence-url";
import {QUIZ_RULE_VERSION} from "@/lib/quiz/quiz-bank";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/challenges/[id]/judge/async
 * Body: { tier?, providerId?, model?, webhookUrl? }
 *
 * Returns 202 immediately; work continues via `after()` (ffmpeg + vision + recommendation).
 * Poll GET /api/judge-jobs/[jobId] or receive optional HTTPS webhook.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let tierId: TierId = 1;
  let providerId: string | undefined;
  let model: string | undefined;
  let webhookUrl: string | undefined;
  try {
    const body = await req.json();
    if ([1, 2, 3].includes(body?.tier)) tierId = body.tier as TierId;
    if (typeof body?.providerId === "string") providerId = body.providerId;
    if (typeof body?.model === "string") model = body.model;
    if (typeof body?.webhookUrl === "string") webhookUrl = body.webhookUrl.trim() || undefined;
  } catch {
    /* defaults */
  }

  if (webhookUrl && !isEvidenceUrlAllowed(webhookUrl)) {
    return Response.json({ error: "webhookUrl must be a safe public https URL" }, { status: 400 });
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { creatorId: true, status: true, title: true, stake: true, evidenceType: true,arbiter:true,
      participants: { where: { status: "accepted", role: { in: ["creator", "opponent"] } }, select: { userId: true, role: true } },
      evidence: { select: { id: true, userId: true, type: true,
        url: true, description: true } } },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only the creator can trigger judgment" }, { status: 403 });
  }
  if(challenge.arbiter===QUIZ_RULE_VERSION)
    return Response.json({error:"Only the sealed Quiz answer-key service can grade this challenge"},
      {status:409});
  if (challenge.status !== "judging") {
    return Response.json(
      {
        error:
          "AI verdict is unlocked after every player submits evidence. When all sides are in, status becomes Judging.",
      },
      { status: 400 },
    );
  }
  // An unloaded private-upload table cannot break the legacy app preview.
  // Query it only when the feature is explicitly enabled.
  const linkedRows = process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS === "true"
    && ["video", "photo"].includes(challenge.evidenceType)
    ? await prisma.trustedEvidenceUpload.findMany({
      where: { challengeId: id, evidenceId: {
        in: challenge.evidence.map(row => row.id),
      } },
      select: { id: true, evidenceId: true, status: true, userId: true,
        challengeId: true, sha256: true, contentType: true },
    })
    : [];
  const linkedByEvidence = new Map(linkedRows.filter(row => row.evidenceId)
    .map(row => [row.evidenceId!, row] as const));
  const players = challenge.participants;
  const complete = players.length === 2 && players.some((p) => p.role === "creator" && p.userId === challenge.creatorId)
    && players.some((p) => p.role === "opponent") && players.every((p) => {
      const proof = challenge.evidence.find((e) => e.userId === p.userId);
      if (!proof) return false;
      if (["photo", "video"].includes(challenge.evidenceType)) {
        const receipt = linkedByEvidence.get(proof.id);
        const trusted = Boolean(receipt &&
          receipt.status === "consumed" && receipt.userId === proof.userId &&
          receipt.challengeId === id && /^[a-f0-9]{64}$/i.test(receipt.sha256 ?? "") &&
          (proof.type === "video" ? receipt.contentType.startsWith("video/") :
            receipt.contentType.startsWith("image/")));
        if (process.env.TRUSTED_EVIDENCE_REQUIRED_FOR_MEDIA === "true") return trusted;
        return proof.type === challenge.evidenceType && (trusted || !!proof.url?.trim());
      }
      return !!proof.description?.trim();
    });
  if (!complete) return Response.json({ error: "Background review needs valid proof from both players. Use the deadline-rule review when proof is missing." }, { status: 409 });

  const cost = challenge.stake > 0 ? TIER_MULTIPLIER[tierId] : 0;
  const balance = await getCredits(user.userId);
  if (balance < cost) return noCredits(cost, balance, getAiModel(tierId).displayName);

  // Serialize intake across instances; retries share the active job rather than
  // creating competing runners or failing a recoverable client request.
  const { job, reused } = await getOrCreateJudgeJob({
    challengeId: id,
    requestedByUserId: user.userId,
    tierId,
    providerId: providerId ?? null,
    model: model ?? null,
    webhookUrl: webhookUrl ?? null,
  });

  after(() => runJudgeJob(job.id));

  const origin = req.headers.get("x-forwarded-host")
    ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}`
    : "";
  const pollUrl = `${origin}/api/judge-jobs/${job.id}`;

  return Response.json(
    {
      status: "processing",
      jobId: job.id,
      reused,
      pollUrl: `/api/judge-jobs/${job.id}`,
      pollUrlAbsolute: origin ? pollUrl : undefined,
      message:
        "AI recommendation runs in the background (video frames + vision). Poll pollUrl or use webhookUrl; both participants must accept the result before credits settle.",
    },
    { status: 202 },
  );
}
