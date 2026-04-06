/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";

export const AuditActions = {
  CHALLENGE_CREATED: "challenge.created",
  CHALLENGE_STATUS: "challenge.status_changed",
  CHALLENGE_ACCEPTED: "challenge.accepted",
  EVIDENCE_SUBMITTED: "evidence.submitted",
  JUDGMENT_COMPLETED: "judgment.completed",
  CRON_TRANSITION: "cron.deadline_to_judging",
} as const;

/**
 * Best-effort append-only audit row. Never throws to callers.
 */
export async function appendAuditLog(entry: {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  challengeId?: string | null;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? undefined,
        targetUserId: entry.targetUserId ?? undefined,
        challengeId: entry.challengeId ?? undefined,
        payload: entry.payload ?? undefined,
      },
    });
  } catch (e) {
    console.error("[audit-log]", entry.action, e);
  }
}
