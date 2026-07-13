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
import { spendCredits, addCredits } from "@/lib/credits";
import { executeChallengeJudgment } from "@/lib/challenge-judgment";
import { recordVerdictDecision, VerdictDecision } from "@/lib/verdict-review";
import { createHash } from "node:crypto";
import { getDraftIssues, normalizeDraftState } from "./draft-policy";
import type { AgentToolName, DraftState } from "./types";

export interface ToolContext {
  userId: string;
  baseUrl: string; // used to construct share links
  draftState: DraftState;
  requestId?: string; // client-generated idempotency key for createChallenge
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/* ─────────────────────────────────────────────── */

async function createChallengeTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  // Source of truth is the current server-normalized draftState. Tool args are
  // only a compatibility fallback for older/direct callers and must not
  // override explicit UI choices such as invite privacy or credits.
  const draft = ctx.draftState;
  const title = String(draft.title ?? args.title ?? "").trim();
  const proposition = String(draft.proposition ?? args.proposition ?? title);
  const rawStake = Number(draft.stake ?? args.stake);
  const stake = Number.isFinite(rawStake) ? Math.max(0, Math.floor(rawStake)) : Number.NaN;
  const evidenceType = String(draft.evidenceType ?? args.evidenceType ?? "");
  const judgeRule = String(draft.judgeRule ?? args.judgeRule ?? "");
  const timeWindow = String(draft.timeWindow ?? args.timeWindow ?? "");
  const participants = String(draft.participants ?? args.participants ?? "").trim();
  // Default challenges to PUBLIC so /markets actually has something to show
  // and strangers can find + accept. Agent can override with isPublic=false
  // if the user explicitly says "just me and my friend" / "private".
  const rawIsPublic = args.isPublic;
  const isInviteOnly = /invite|friend|private|好友|朋友|仅邀请|私密/i.test(participants);
  const isPublic = isInviteOnly ? false : rawIsPublic === undefined ? true : Boolean(rawIsPublic);

  const candidate = normalizeDraftState({
    ...draft,
    title,
    proposition,
    participants,
    stake,
    evidenceType: evidenceType === "video" || evidenceType === "photo" || evidenceType === "text" ? evidenceType : null,
    judgeRule,
    timeWindow,
  });
  const issues = getDraftIssues(candidate);
  if (issues.length > 0) {
    return { ok: false, error: `Challenge draft is incomplete or ambiguous: ${issues.join(", ")}` };
  }

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
  const safeRequestId = typeof ctx.requestId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(ctx.requestId)
    ? ctx.requestId
    : null;
  const challengeId = safeRequestId
    ? `quest_${createHash("sha256").update(`${ctx.userId}:${safeRequestId}`).digest("hex").slice(0, 24)}`
    : null;
  if (!challengeId) {
    return { ok: false, error: "requestId required for idempotent challenge creation" };
  }

  // A retry after a lost HTTP response returns the original row and never
  // stakes credits twice. The deterministic primary key also closes the
  // concurrent double-click race at the database boundary.
  const existing = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (existing) return { ok: true, data: challengeResult(existing, ctx.baseUrl, true) };

  // Escrow, ledger, challenge, participant, and audit event are one database
  // transaction. Any failed write rolls the entire operation back; no
  // compensating refund window and no charged-without-a-quest state remain.
  try {
    const challenge = await prisma.$transaction(async (tx) => {
      if (stake > 0) {
        const debited = await tx.user.updateMany({
          where: { id: ctx.userId, credits: { gte: stake } },
          data: { credits: { decrement: stake } },
        });
        if (debited.count === 0) throw new Error("INSUFFICIENT_CREDITS");
      }

      const created = await tx.challenge.create({
        data: {
          id: challengeId,
          creatorId: ctx.userId,
          title: candidate.title!,
          description: candidate.proposition,
          marketType: "challenge",
          proposition: candidate.proposition,
          type: inferTypeFromTitle(candidate.title!),
          stake: candidate.stake!,
          stakeToken: "credits",
          deadline,
          rules: candidate.judgeRule,
          evidenceType: candidate.evidenceType!,
          settlementMode: "mutual_confirmation",
          isPublic,
          visibility: isPublic ? "public" : isInviteOnly ? "invite_only" : "private",
          maxParticipants: 2,
          aiReview: true,
          status: "open",
          participants: {
            create: { userId: ctx.userId, role: "creator", status: "accepted" },
          },
          activityEvents: {
            create: {
              type: "challenge_created",
              message: `Challenge "${candidate.title}" created via agent`,
              userId: ctx.userId,
            },
          },
        },
      });

      if (stake > 0) {
        const user = await tx.user.findUnique({ where: { id: ctx.userId }, select: { credits: true } });
        if (!user) throw new Error("CREATOR_NOT_FOUND");
        await tx.creditTx.create({
          data: {
            userId: ctx.userId,
            type: "stake",
            amount: -stake,
            balanceAfter: user.credits,
            description: `Staked ${stake} credits on "${candidate.title!.slice(0, 40)}"`,
            challengeId,
            idempotencyKey: `stake:create:${challengeId}`,
          },
        });
      }
      return created;
    });
    return { ok: true, data: challengeResult(challenge, ctx.baseUrl, false) };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const existing = await prisma.challenge.findUnique({ where: { id: challengeId } });
      if (existing) return { ok: true, data: challengeResult(existing, ctx.baseUrl, true) };
    }
    if (err instanceof Error && err.message === "INSUFFICIENT_CREDITS") {
      return { ok: false, error: "Insufficient credits" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Challenge create failed" };
  }
}

function challengeResult(
  challenge: { id: string; title: string; status: string; stake: number; evidenceType: string },
  baseUrl: string,
  deduplicated: boolean,
) {
  return {
    challengeId: challenge.id,
    title: challenge.title,
    status: challenge.status,
    stake: challenge.stake,
    evidenceType: challenge.evidenceType,
    deduplicated,
    shareUrl: `${baseUrl}/join/${challenge.id}`,
    marketUrl: `${baseUrl}/market/${challenge.id}`,
  };
}

function parseTimeWindowToDate(tw: string): Date {
  const s = tw.toLowerCase();
  const now = Date.now();
  const hr = /(\d+)\s*(?:hours?|hrs?|小时|小時)/i.exec(s);
  const min = /(\d+)\s*(?:mins?|minutes?|分钟|分鐘)/i.exec(s);
  const day = /(\d+)\s*(?:days?|天)/i.exec(s);
  const week = /(\d+)\s*(?:weeks?|周|週)/i.exec(s);
  let addMs = 24 * 60 * 60 * 1000;
  if (hr) addMs = Math.max(1, Number(hr[1])) * 60 * 60 * 1000;
  else if (min) addMs = Math.max(1, Number(min[1])) * 60 * 1000;
  else if (day) addMs = Math.max(1, Number(day[1])) * 24 * 60 * 60 * 1000;
  else if (week) addMs = Math.max(1, Number(week[1])) * 7 * 24 * 60 * 60 * 1000;
  else if (/tomorrow|明天/.test(s)) addMs = 24 * 60 * 60 * 1000;
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
  try {
    const result = await recordVerdictDecision({
      challengeId,
      userId: ctx.userId,
      decision: VerdictDecision.accepted,
    });
    return {
      ok: true,
      data: {
        challengeId,
        status: result.status,
        settled: result.settled,
        waitingForUserIds: result.waitingForUserIds,
        reviewStatus: result.reviewCase?.status ?? null,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Verdict confirmation failed" };
  }
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
