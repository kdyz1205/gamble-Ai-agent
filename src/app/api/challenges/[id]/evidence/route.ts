import { NextRequest, after } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, type TierId } from "@/lib/auth";
import { executeChallengeJudgment } from "@/lib/challenge-judgment";
import { ChallengeStatus } from "@/generated/prisma/enums";
import { assertChallengeTransition } from "@/lib/challenge-state-machine";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";

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
  const body = await req.json();
  const { type = "text", url, description, metadata } = body;

  // Verify challenge exists and user is participant
  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  if (!["open", "live", "matched"].includes(challenge.status)) {
    return Response.json(
      { error: "Evidence locked — challenge is judging, settled, or closed." },
      { status: 400 },
    );
  }

  const isParticipant = challenge.participants.some((p: { userId: string }) => p.userId === user.userId);
  if (!isParticipant) {
    return Response.json({ error: "You are not a participant in this challenge" }, { status: 403 });
  }

  // Create evidence
  const evidence = await prisma.evidence.create({
    data: {
      challengeId: id,
      userId: user.userId,
      type,
      url,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
    include: {
      user: { select: { id: true, username: true } },
    },
  });

  // Activity event
  await prisma.activityEvent.create({
    data: {
      type: "evidence_submitted",
      message: `${user.username} submitted ${type} evidence for "${challenge.title}"`,
      userId: user.userId,
      challengeId: id,
    },
  });

  await appendAuditLog({
    action: AuditActions.EVIDENCE_SUBMITTED,
    actorUserId: user.userId,
    challengeId: id,
    payload: { evidenceType: type, hasUrl: Boolean(url) },
  });

  // Check if all participants have submitted evidence
  const allEvidenceUsers = await prisma.evidence.findMany({
    where: { challengeId: id },
    select: { userId: true },
    distinct: ["userId"],
  });
  const activeParticipants = challenge.participants.filter((p: { status: string }) => p.status === "accepted");

  if (allEvidenceUsers.length >= activeParticipants.length) {
    assertChallengeTransition(challenge.status, ChallengeStatus.judging);
    await prisma.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.judging },
    });

    await appendAuditLog({
      action: AuditActions.CHALLENGE_STATUS,
      actorUserId: user.userId,
      challengeId: id,
      payload: { from: challenge.status, to: ChallengeStatus.judging, reason: "all_evidence_in" },
    });

    const evs = await prisma.evidence.findMany({
      where: { challengeId: id },
      orderBy: { createdAt: "desc" },
    });
    const latestByUser = new Map<string, (typeof evs)[number]>();
    for (const e of evs) {
      if (!latestByUser.has(e.userId)) latestByUser.set(e.userId, e);
    }
    const videoDuel =
      activeParticipants.length >= 2 &&
      activeParticipants.every((p) => {
        const e = latestByUser.get(p.userId);
        return e?.type === "video" && Boolean(String(e.url ?? "").trim());
      });

    if (videoDuel) {
      after(async () => {
        const r = await executeChallengeJudgment(id, 1 as TierId);
        if (!r.ok && !("skipped" in r && r.skipped)) {
          console.error("[auto-judge]", id, r);
        }
      });
    }
  }

  return Response.json({ evidence }, { status: 201 });
}

/**
 * GET /api/challenges/[id]/evidence — List evidence for a challenge
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const evidence = await prisma.evidence.findMany({
    where: { challengeId: id },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ evidence });
}
