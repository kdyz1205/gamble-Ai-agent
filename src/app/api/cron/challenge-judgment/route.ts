import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { ChallengeStatus } from "@/lib/enums";
import { executeChallengeJudgment } from "@/lib/challenge-judgment";
import { sweepStuckJudgeJobs } from "@/lib/judge-async";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import { AI_REVIEW_STATUSES, EVIDENCE_WINDOW_STATUSES } from "@/lib/challenge-state-machine";
import { resolveOracleEvent } from "@/lib/event-resolution";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET/POST /api/cron/challenge-judgment
 *
 * Secured with Authorization: Bearer <CRON_SECRET>.
 * 1) Moves evidence-window challenges past `deadline` into `ai_reviewing`.
 * 2) Runs AI judgment for every AI-review challenge that has no completed judgment yet.
 *
 * Inference cost is charged to the challenge creator (same as manual POST /judge).
 * Configure periodic hits (e.g. Vercel Cron) and set CRON_SECRET in the environment.
 */
function authorize(req: NextRequest, secret: string): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function runCron() {
  const now = new Date();

  // (1) Sweep stuck async JudgeJobs first so their status stops blocking
  // the client's poll loop. Runs every cron tick so a crashed lambda's
  // judgment is failed within ~minutes, not "forever".
  const sweepResult = await sweepStuckJudgeJobs();

  // (2) Evidence window -> AI reviewing for any deadline that has passed.
  const transitioned = await prisma.challenge.updateMany({
    where: {
      status: { in: [...EVIDENCE_WINDOW_STATUSES] },
      deadline: { not: null, lte: now },
    },
    data: { status: ChallengeStatus.ai_reviewing },
  });

  if (transitioned.count > 0) {
    await appendAuditLog({
      action: AuditActions.CRON_TRANSITION,
      payload: { count: transitioned.count, at: now.toISOString() },
    });
  }

  // (3) Judge every AI-review challenge that has no completed judgment.
  // Cap take to 20 so one long-running judgment can't exhaust maxDuration
  // and strand the rest in limbo — whatever we don't get to this tick
  // will be picked up next tick.
  const pending = await prisma.challenge.findMany({
    where: {
      status: { in: [...AI_REVIEW_STATUSES] },
      judgments: { none: { status: "completed" } },
    },
    select: { id: true, title: true },
    take: 20,
    orderBy: { updatedAt: "asc" }, // oldest first so nothing starves
  });

  const outcomes: Array<{
    challengeId: string;
    title: string;
    result?: Awaited<ReturnType<typeof executeChallengeJudgment>>;
    error?: string;
  }> = [];

  for (const ch of pending) {
    // Per-challenge try/catch — one throw should not abort the whole batch.
    try {
      const result = await executeChallengeJudgment(ch.id, 1);
      outcomes.push({ challengeId: ch.id, title: ch.title, result });
    } catch (e) {
      outcomes.push({
        challengeId: ch.id,
        title: ch.title,
        error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
      });
    }
  }

  const dueOracleEvents = await prisma.challengeEvent.findMany({
    where: { status: { in: ["open", "submissions_open", "closed", "needs_review"] } },
    select: {
      id: true,
      title: true,
    },
    take: 20,
    orderBy: { updatedAt: "asc" },
  });

  const eventOutcomes: Array<{
    eventId: string;
    title: string;
    status: "skipped" | "finalized" | "not_due" | "needs_review" | "needs_repair" | "error";
    detail?: unknown;
  }> = [];

  for (const event of dueOracleEvents) {
    try {
      const result = await resolveOracleEvent(event.id, {
        kind: "cron",
      }, now);
      if (!result.ok) {
        eventOutcomes.push({
          eventId: event.id,
          title: event.title,
          status: result.status === "not_oracle" ? "skipped" : "error",
          detail: result.error,
        });
        continue;
      }
      eventOutcomes.push({
        eventId: event.id,
        title: event.title,
        status: result.status === "resolved" ? "finalized" : result.status,
        detail: {
          winnerId: result.resolution.winnerId,
          recommendation: result.resolution.recommendation,
          confidence: result.resolution.confidence,
          resolutionStatus: result.resolution.status,
        },
      });
    } catch (e) {
      eventOutcomes.push({
        eventId: event.id,
        title: event.title,
        status: "error",
        detail: e instanceof Error ? e.message.slice(0, 200) : "unknown",
      });
    }
  }

  return {
    sweptStuckJobs: sweepResult.swept,
    transitionedToJudging: transitioned.count,
    pendingCount: pending.length,
    outcomes,
    eventOutcomes,
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorize(req, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await runCron();
    return Response.json(body);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Cron failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
