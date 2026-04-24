/**
 * Agent Orchestrator — tool implementations.
 *
 * These are the ONLY functions the agent can use to affect state. Each one:
 *   - Validates its inputs.
 *   - Re-uses existing product helpers (credits ledger, challenge-judgment,
 *     confirm-verdict logic) rather than duplicating them.
 *   - Returns a small JSON-serializable result the orchestrator can hand
 *     back to the LLM on the next turn (so the AI can reason about what
 *     happened, e.g. "challenge created, here's the share link").
 *
 * Nothing here mutates user balances directly — it all goes through
 * credits.ts atomic helpers.
 */
import prisma from "@/lib/db";
import { spendCredits, addCredits, settleChallenge } from "@/lib/credits";
import { executeChallengeJudgment } from "@/lib/challenge-judgment";
import { ChallengeStatus } from "@/lib/enums";
import type { AgentToolName, DraftState } from "./types";

export interface ToolContext {
  userId: string;
  baseUrl: string; // used to construct share links
  draftState: DraftState;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/* ─────────────────────────────────────────────── */

async function createChallengeTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  // Source of truth is the current merged draftState; args can override.
  const draft = ctx.draftState;
  const title = String(args.title ?? draft.title ?? "").trim();
  const proposition = String(args.proposition ?? draft.proposition ?? title);
  const stake = Math.max(0, Math.floor(Number(args.stake ?? draft.stake ?? 0)));
  const evidenceType = String(args.evidenceType ?? draft.evidenceType ?? "self_report");
  const judgeRule = String(args.judgeRule ?? draft.judgeRule ?? "");
  const timeWindow = String(args.timeWindow ?? draft.timeWindow ?? "24 hours");
  // Default challenges to PUBLIC so /markets actually has something to show
  // and strangers can find + accept. Agent can override with isPublic=false
  // if the user explicitly says "just me and my friend" / "private".
  const rawIsPublic = args.isPublic;
  const isPublic = rawIsPublic === undefined ? true : Boolean(rawIsPublic);

  if (!title) return { ok: false, error: "title required" };

  // ── Sanity guard: reject unjudgeable / nonsense challenges ──
  //
  // Background: earlier agent versions occasionally called createChallenge
  // with the user's raw throwaway input as the title (e.g. "I'm so hungry",
  // "我好饿啊") and no judgeRule, producing markets that nobody can actually
  // settle. This guard is a last-line defense so bad drafts never reach the
  // DB even if the LLM misbehaves. The system prompt ALSO teaches the LLM
  // to refuse these — this is belt-and-suspenders.
  const looksLikeMoodOrGarbage =
    /^(i['']?m|我(好|很|超)?)\s*(so\s+)?(hungry|tired|bored|sad|happy|饿|累|困|饱|烦)/i.test(title) ||
    /^(hi|hello|hey|嗨|你好|哈喽|喂|在吗)[\s!?.]*$/i.test(title) ||
    /^(帮我|给我|随便).{0,8}(生成|来|做)/i.test(title);
  const propositionIsJustTitle = !proposition || proposition.trim() === title.trim();
  const judgeRuleTooThin = !judgeRule || judgeRule.trim().length < 20;
  if (looksLikeMoodOrGarbage || (propositionIsJustTitle && judgeRuleTooThin)) {
    return {
      ok: false,
      error:
        "This doesn't look like a judgeable challenge yet — I need a clear win condition (who does what, and how do we decide who wins). Can you tell me what you actually want to compete on?",
    };
  }

  // Parse timeWindow into a deadline Date, same logic as POST /api/challenges
  const deadline = parseTimeWindowToDate(timeWindow);

  // Atomic escrow then create; refund on throw — same pattern POST /api/challenges uses.
  if (stake > 0) {
    const spend = await spendCredits(ctx.userId, stake, "stake", `Staked ${stake} credits on "${title.slice(0, 40)}"`);
    if (!spend.success) return { ok: false, error: spend.error || "Insufficient credits" };
  }

  let challenge;
  try {
    challenge = await prisma.challenge.create({
      data: {
        creatorId: ctx.userId,
        title,
        description: proposition,
        marketType: "challenge",
        proposition,
        type: inferTypeFromTitle(title),
        stake,
        stakeToken: "credits",
        deadline,
        rules: judgeRule || proposition || title,
        evidenceType,
        settlementMode: "mutual_confirmation",
        isPublic,
        visibility: isPublic ? "public" : "private",
        maxParticipants: 2,
        aiReview: true,
        status: "open",
        participants: {
          create: { userId: ctx.userId, role: "creator", status: "accepted" },
        },
      },
    });
  } catch (err) {
    if (stake > 0) {
      await addCredits(ctx.userId, stake, "refund", `Refund — challenge creation failed`);
    }
    return { ok: false, error: err instanceof Error ? err.message : "Challenge create failed" };
  }

  await prisma.activityEvent.create({
    data: {
      type: "challenge_created",
      message: `Challenge "${title}" created via agent`,
      userId: ctx.userId,
      challengeId: challenge.id,
    },
  });

  return {
    ok: true,
    data: {
      challengeId: challenge.id,
      title: challenge.title,
      status: challenge.status,
      stake: challenge.stake,
      evidenceType: challenge.evidenceType,
      shareUrl: `${ctx.baseUrl}/join/${challenge.id}`,
      marketUrl: `${ctx.baseUrl}/market/${challenge.id}`,
    },
  };
}

function parseTimeWindowToDate(tw: string): Date {
  const s = tw.toLowerCase();
  const now = Date.now();
  const hr = /(\d+)\s*hour/i.exec(s);
  const min = /(\d+)\s*(min|minute)/i.exec(s);
  const day = /(\d+)\s*day/i.exec(s);
  const week = /(\d+)\s*week/i.exec(s);
  let addMs = 24 * 60 * 60 * 1000;
  if (hr) addMs = Number(hr[1]) * 60 * 60 * 1000;
  else if (min) addMs = Number(min[1]) * 60 * 1000;
  else if (day) addMs = Number(day[1]) * 24 * 60 * 60 * 1000;
  else if (week) addMs = Number(week[1]) * 7 * 24 * 60 * 60 * 1000;
  return new Date(now + addMs);
}

function inferTypeFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/\b(pushup|push-up|plank|run|sprint|fitness|squat|burpee)\b/.test(t) || /(俯卧撑|平板|跑|跳|引体)/.test(title)) return "Fitness";
  if (/\b(cook|recipe|bake|meal)\b/.test(t) || /(做菜|烹饪|煮|炒)/.test(title)) return "Cooking";
  if (/\b(code|leetcode|bug|compile)\b/.test(t) || /(编程|刷题)/.test(title)) return "Coding";
  if (/\b(read|book|chapter|study)\b/.test(t) || /(读书|看书|学习)/.test(title)) return "Learning";
  if (/\b(btc|eth|price|stock|election)\b/.test(t) || /(价格|涨到|跌到|预测)/.test(title)) return "Prediction";
  if (/\b(chess|basketball|soccer|golf|game)\b/.test(t) || /(下棋|篮球|足球|游戏)/.test(title)) return "Games";
  return "General";
}

/* ─────────────────────────────────────────────── */

async function acceptChallengeTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const challengeId = String(args.challengeId ?? "").trim();
  if (!challengeId) return { ok: false, error: "challengeId required" };
  // Delegate to the existing atomic accept logic via direct prisma transaction.
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { participants: true },
  });
  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (challenge.status !== "open") return { ok: false, error: `Challenge not open (status=${challenge.status})` };
  if (challenge.creatorId === ctx.userId) return { ok: false, error: "You cannot accept your own challenge" };
  if (challenge.participants.some((p) => p.userId === ctx.userId)) {
    return { ok: false, error: "You are already in this challenge" };
  }

  if (challenge.stake > 0) {
    const spend = await spendCredits(ctx.userId, challenge.stake, "stake", `Staked ${challenge.stake} credits on "${challenge.title.slice(0, 40)}"`, challengeId);
    if (!spend.success) return { ok: false, error: spend.error || "Insufficient credits" };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.participant.count({
        where: { challengeId, status: { in: ["pending", "accepted"] } },
      });
      if (count >= challenge.maxParticipants) throw new Error("FULL");
      await tx.participant.create({
        data: { challengeId, userId: ctx.userId, role: "opponent", status: "accepted" },
      });
    });
  } catch (e) {
    if (challenge.stake > 0) {
      await addCredits(ctx.userId, challenge.stake, "refund", `Refund — could not join "${challenge.title.slice(0, 40)}"`, challengeId);
    }
    return { ok: false, error: e instanceof Error ? e.message === "FULL" ? "Challenge full — stake refunded" : e.message : "Accept failed" };
  }

  const fresh = await prisma.participant.count({
    where: { challengeId, status: { in: ["pending", "accepted"] } },
  });
  const newStatus = fresh >= challenge.maxParticipants ? "live" : "open";
  await prisma.challenge.update({ where: { id: challengeId }, data: { status: newStatus } });

  return { ok: true, data: { challengeId, status: newStatus } };
}

/* ─────────────────────────────────────────────── */

async function generateShareLinkTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const challengeId = String(args.challengeId ?? "").trim();
  if (!challengeId) return { ok: false, error: "challengeId required" };
  const ch = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true, creatorId: true } });
  if (!ch) return { ok: false, error: "Challenge not found" };
  if (ch.creatorId !== ctx.userId) return { ok: false, error: "Only the creator can share this link" };
  return {
    ok: true,
    data: {
      shareUrl: `${ctx.baseUrl}/join/${challengeId}`,
      marketUrl: `${ctx.baseUrl}/market/${challengeId}`,
    },
  };
}

/* ─────────────────────────────────────────────── */

async function uploadEvidenceTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const challengeId = String(args.challengeId ?? "").trim();
  const type = String(args.type ?? "text");
  const description = args.description ? String(args.description) : null;
  const url = args.url ? String(args.url) : null;
  if (!challengeId) return { ok: false, error: "challengeId required" };

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { participants: true },
  });
  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (!["live", "matched"].includes(challenge.status)) {
    return { ok: false, error: `Challenge is not active (status=${challenge.status})` };
  }
  if (!challenge.participants.some((p) => p.userId === ctx.userId)) {
    return { ok: false, error: "You are not a participant" };
  }

  const evidence = await prisma.evidence.upsert({
    where: { challengeId_userId: { challengeId, userId: ctx.userId } },
    create: { challengeId, userId: ctx.userId, type, url, description },
    update: {
      type,
      url,
      description,
      preparedFrames: null,
      preparedAt: null,
      preparedDurationSec: null,
      preparedMode: null,
      prepareError: null,
    },
  });

  const activeParticipants = challenge.participants.filter((p) => p.status === "accepted");
  const evCount = await prisma.evidence.findMany({
    where: { challengeId },
    select: { userId: true },
    distinct: ["userId"],
  });
  if (evCount.length >= activeParticipants.length) {
    await prisma.challenge.updateMany({
      where: { id: challengeId, status: { in: ["live", "matched"] } },
      data: { status: "judging" },
    });
  }

  return { ok: true, data: { evidenceId: evidence.id, challengeId, type, hasUrl: !!url } };
}

/* ─────────────────────────────────────────────── */

async function runVisionJudgeTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const challengeId = String(args.challengeId ?? "").trim();
  if (!challengeId) return { ok: false, error: "challengeId required" };

  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (challenge.creatorId !== ctx.userId) return { ok: false, error: "Only the creator can run judgment" };

  const result = await executeChallengeJudgment(challengeId, 1);
  if (!result.ok) {
    return { ok: false, error: "error" in result ? result.error : "judge failed" };
  }
  return {
    ok: true,
    data: {
      judgmentId: result.judgment.id,
      winnerId: result.judgment.winnerId,
      confidence: result.judgment.confidence,
      aiModel: result.judgment.aiModel,
      reasoning: (result.judgment.reasoning ?? "").slice(0, 500),
    },
  };
}

/* ─────────────────────────────────────────────── */

async function confirmVerdictTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const challengeId = String(args.challengeId ?? "").trim();
  if (!challengeId) return { ok: false, error: "challengeId required" };

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      participants: { where: { status: "accepted" } },
      judgments: { where: { method: "ai", status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (challenge.creatorId !== ctx.userId) return { ok: false, error: "Only the creator can confirm" };
  if (challenge.status === ChallengeStatus.settled) return { ok: false, error: "Already settled" };
  const confirmableStatuses: string[] = [ChallengeStatus.disputed, ChallengeStatus.judging];
  if (!confirmableStatuses.includes(challenge.status)) {
    return { ok: false, error: `Not confirmable (status=${challenge.status})` };
  }
  const j = challenge.judgments[0];
  if (!j) return { ok: false, error: "No AI recommendation to confirm yet" };

  if (challenge.stake > 0) {
    const claim = await prisma.challenge.updateMany({
      where: { id: challengeId, status: { in: [ChallengeStatus.disputed, ChallengeStatus.judging] } },
      data: { status: ChallengeStatus.pending_settlement },
    });
    if (claim.count === 0) return { ok: false, error: "Already being settled by another request" };
    const settlement = await settleChallenge(
      challengeId,
      j.winnerId,
      challenge.stake,
      challenge.participants.map((p) => ({ userId: p.userId })),
    );
    if (!settlement.success) return { ok: false, error: settlement.error || "Settlement failed" };
  }
  await prisma.challenge.updateMany({
    where: { id: challengeId, status: { in: [ChallengeStatus.pending_settlement, ChallengeStatus.disputed, ChallengeStatus.judging] } },
    data: { status: ChallengeStatus.settled },
  });

  return { ok: true, data: { challengeId, winnerId: j.winnerId, status: "settled" } };
}

/* ─────────────────────────────────────────────── */

/**
 * findOpenMarkets — list public open challenges the user could accept.
 * The agent uses this when the user says things like "给我找个挑战" /
 * "match me with someone" / "有什么可以玩的". Returns up to `limit` items
 * with enough info for the agent to summarize naturally.
 */
async function findOpenMarketsTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Math.max(1, Math.floor(Number(args.limit ?? 10))), 50);
  const typeFilter = typeof args.type === "string" ? args.type : undefined;
  const markets = await prisma.challenge.findMany({
    where: {
      status: "open",
      isPublic: true,
      // Don't suggest user's own markets
      creatorId: { not: ctx.userId },
      // Hide full ones (shouldn't be status=open if full, but belt+suspenders)
      participants: { none: { userId: ctx.userId } },
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, proposition: true, type: true, stake: true,
      evidenceType: true, deadline: true, createdAt: true,
      creator: { select: { username: true } },
      _count: { select: { participants: true } },
    },
  });
  return {
    ok: true,
    data: {
      count: markets.length,
      markets: markets.map((m) => ({
        id: m.id,
        title: m.title,
        proposition: m.proposition,
        type: m.type,
        stake: m.stake,
        evidenceType: m.evidenceType,
        creator: m.creator.username,
        participants: m._count.participants,
        shareUrl: `${ctx.baseUrl}/join/${m.id}`,
      })),
    },
  };
}

/**
 * matchMe — auto-accept the best-fitting open public market for the user.
 * Picks the newest non-full, non-owned, public, open challenge; falls back
 * to "no match available" if nothing fits. Accepts it under the user's
 * identity (atomic race-safe via the same acceptChallenge tool).
 */
async function matchMeTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const typeFilter = typeof args.type === "string" ? args.type : undefined;
  const maxStake = typeof args.maxStake === "number" ? args.maxStake : undefined;

  // Pick one — newest-first, not user's own, not full.
  const candidate = await prisma.challenge.findFirst({
    where: {
      status: "open",
      isPublic: true,
      creatorId: { not: ctx.userId },
      participants: { none: { userId: ctx.userId } },
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(maxStake !== undefined ? { stake: { lte: maxStake } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, stake: true, maxParticipants: true, type: true },
  });

  if (!candidate) {
    return {
      ok: true,
      data: {
        matched: false,
        message: "No open public markets matched right now. Create your own — opponents will find it.",
      },
    };
  }

  // Reuse the same atomic accept logic (stake escrow + race-safe participant insert).
  const accept = await acceptChallengeTool(ctx, { challengeId: candidate.id });
  if (!accept.ok) {
    return {
      ok: true,
      data: {
        matched: false,
        candidateId: candidate.id,
        title: candidate.title,
        reason: accept.error,
      },
    };
  }
  return {
    ok: true,
    data: {
      matched: true,
      challengeId: candidate.id,
      title: candidate.title,
      stake: candidate.stake,
      type: candidate.type,
      marketUrl: `${ctx.baseUrl}/market/${candidate.id}`,
    },
  };
}

/* ─────────────────────────────────────────────── */

async function updateDraftTool(_ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  // The server already merges draftPatch from every LLM response. This tool
  // is exposed so the LLM can EXPLICITLY request a full replacement — we just
  // surface the args back as the patch for the caller to merge.
  return { ok: true, data: args };
}

/* ─────────────────────────────────────────────── */

export async function executeAgentTool(
  name: AgentToolName,
  ctx: ToolContext,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  switch (name) {
    case "createChallenge":    return createChallengeTool(ctx, args);
    case "acceptChallenge":    return acceptChallengeTool(ctx, args);
    case "generateShareLink":  return generateShareLinkTool(ctx, args);
    case "uploadEvidence":     return uploadEvidenceTool(ctx, args);
    case "runVisionJudge":     return runVisionJudgeTool(ctx, args);
    case "confirmVerdict":     return confirmVerdictTool(ctx, args);
    case "findOpenMarkets":    return findOpenMarketsTool(ctx, args);
    case "matchMe":            return matchMeTool(ctx, args);
    case "updateDraft":        return updateDraftTool(ctx, args);
    case "extractVideoFrames":
      // Pre-extraction runs automatically inside evidence POST. Expose as a
      // no-op so the LLM doesn't error when it names this tool.
      return { ok: true, data: { note: "extraction is triggered automatically on evidence submit" } };
    case "settleCredits":
      // Intentionally not callable directly — must go through confirmVerdict.
      return { ok: false, error: "settleCredits is only reachable via confirmVerdict (safety gate)" };
    default:
      return { ok: false, error: `Unknown tool: ${name as string}` };
  }
}
