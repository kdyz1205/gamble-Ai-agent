import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import { ChallengeStatus, type ChallengeStatus as ChallengeStatusValue } from "@/lib/enums";
import {
  VERDICT_READY_STATUSES,
  assertChallengeTransition,
  isTerminalStatus,
  validateChallengeTransition,
} from "@/lib/challenge-state-machine";

export const runtime = "nodejs";

const REVIEW_REQUESTABLE_STATUSES: readonly ChallengeStatusValue[] = [
  ...VERDICT_READY_STATUSES,
  ChallengeStatus.ai_reviewing,
  ChallengeStatus.evidence_invalid,
  ChallengeStatus.evidence_missing,
];

function challengeDetailInclude() {
  return {
    creator: { select: { id: true, username: true, image: true } },
    participants: {
      include: { user: { select: { id: true, username: true, image: true } } },
    },
    evidence: {
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" as const },
    },
    judgments: {
      include: { winner: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" as const },
    },
    _count: { select: { evidence: true, participants: true } },
  };
}

async function readReason(req: NextRequest): Promise<string | null> {
  try {
    const body = await req.json();
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    return reason ? reason.slice(0, 1000) : null;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const reason = await readReason(req);

  try {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        participants: true,
        judgments: {
          where: { status: "completed" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });

    const isParticipant = challenge.participants.some(
      (participant) => participant.userId === user.userId && participant.status === "accepted",
    );
    if (challenge.creatorId !== user.userId && !isParticipant) {
      return Response.json({ error: "Only accepted participants can request review" }, { status: 403 });
    }

    const status = challenge.status as ChallengeStatusValue;
    if (isTerminalStatus(status)) {
      return Response.json({ error: `Challenge is already terminal (status=${status})` }, { status: 409 });
    }
    if (!REVIEW_REQUESTABLE_STATUSES.includes(status)) {
      return Response.json(
        { error: `Manual review can only be requested after evidence or a verdict (status=${status})` },
        { status: 409 },
      );
    }

    const nextStatus =
      status === ChallengeStatus.disputed
        ? ChallengeStatus.disputed
        : validateChallengeTransition(status, ChallengeStatus.disputed)
          ? ChallengeStatus.disputed
          : validateChallengeTransition(status, ChallengeStatus.manual_review_required)
            ? ChallengeStatus.manual_review_required
            : null;

    if (!nextStatus) {
      return Response.json(
        { error: `No safe manual-review transition exists from ${status}` },
        { status: 409 },
      );
    }

    assertChallengeTransition(status, nextStatus);

    if (challenge.judgments[0]) {
      await prisma.judgment.update({
        where: { id: challenge.judgments[0].id },
        data: { status: "disputed" },
      });
    }

    const updated = await prisma.challenge.update({
      where: { id },
      data: { status: nextStatus },
      include: challengeDetailInclude(),
    });

    await appendAuditLog({
      action: AuditActions.CHALLENGE_DISPUTED,
      actorUserId: user.userId,
      challengeId: id,
      payload: {
        previousStatus: status,
        newStatus: nextStatus,
        latestJudgmentId: challenge.judgments[0]?.id ?? null,
        reason,
      },
    });

    await prisma.activityEvent.create({
      data: {
        type: "challenge_disputed",
        message: `${user.username} requested manual review for "${challenge.title}"`,
        userId: user.userId,
        challengeId: id,
        metadata: JSON.stringify({ reason }),
      },
    });

    return Response.json({
      challenge: updated,
      review: {
        status: nextStatus,
        reason,
        latestJudgmentId: challenge.judgments[0]?.id ?? null,
      },
    });
  } catch (err) {
    console.error(`[dispute ${id}] uncaught:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Manual review request failed" },
      { status: 500 },
    );
  }
}
