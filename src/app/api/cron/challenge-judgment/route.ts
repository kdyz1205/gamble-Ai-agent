import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { ChallengeStatus } from "@/generated/prisma/enums";
import { executeChallengeJudgment } from "@/lib/challenge-judgment";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET/POST /api/cron/challenge-judgment
 *
 * Secured with Authorization: Bearer <CRON_SECRET>.
 * 1) Moves `live` / `matched` challenges past `deadline` into `judging`.
 * 2) Runs AI judgment for every `judging` challenge that has no completed judgment yet.
 *
 * Inference cost is charged to the challenge creator (same as manual POST /judge).
 * Configure periodic hits (e.g. Vercel Cron) and set CRON_SECRET in the environment.
 */
function authorize(req: NextRequest, secret: string): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function runCron() {
  const now = new Date();

  const transitioned = await prisma.challenge.updateMany({
    where: {
      status: { in: [ChallengeStatus.live, ChallengeStatus.matched] },
      deadline: { not: null, lte: now },
    },
    data: { status: ChallengeStatus.judging },
  });

  if (transitioned.count > 0) {
    await appendAuditLog({
      action: AuditActions.CRON_TRANSITION,
      payload: { count: transitioned.count, at: now.toISOString() },
    });
  }

  const pending = await prisma.challenge.findMany({
    where: {
      status: ChallengeStatus.judging,
      judgments: { none: { status: "completed" } },
    },
    select: { id: true, title: true },
  });

  const outcomes: Array<{
    challengeId: string;
    title: string;
    result: Awaited<ReturnType<typeof executeChallengeJudgment>>;
  }> = [];

  for (const ch of pending) {
    const result = await executeChallengeJudgment(ch.id, 1);
    outcomes.push({ challengeId: ch.id, title: ch.title, result });
  }

  return {
    transitionedToJudging: transitioned.count,
    pendingCount: pending.length,
    outcomes,
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
