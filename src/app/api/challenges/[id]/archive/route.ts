import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

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
    _count: { select: { evidence: true, judgments: true, judgeJobs: true, participants: true } },
  };
}

async function readArchived(req: NextRequest): Promise<boolean> {
  try {
    const body = await req.json();
    return body?.archived === false ? false : true;
  } catch {
    return true;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const archived = await readArchived(req);

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: {
      id: true,
      creatorId: true,
      title: true,
      status: true,
      isPublic: true,
      visibility: true,
    },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only the creator can archive this challenge" }, { status: 403 });
  }

  const nextVisibility = archived ? "archived" : "private";
  const updated = await prisma.challenge.update({
    where: { id },
    data: {
      isPublic: false,
      visibility: nextVisibility,
    },
    include: challengeDetailInclude(),
  });

  await appendAuditLog({
    action: AuditActions.CHALLENGE_STATUS,
    actorUserId: user.userId,
    challengeId: id,
    payload: {
      previousVisibility: challenge.visibility,
      previousIsPublic: challenge.isPublic,
      nextVisibility,
      nextIsPublic: false,
      statusPreserved: challenge.status,
      reason: archived ? "creator_archived_challenge" : "creator_restored_challenge_private",
    },
  }).catch(() => null);

  return Response.json({
    challenge: updated,
    archive: {
      archived,
      visibility: nextVisibility,
      removedFromDiscovery: true,
      statusPreserved: challenge.status,
    },
  });
}
