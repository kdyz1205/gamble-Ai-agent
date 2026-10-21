import type { Prisma } from "@/generated/prisma/client";
import prisma from "./db";
import { AuditActions } from "./audit-log";
import { assertChallengeTransition } from "./challenge-state-machine";
import { completeOraclePrompt } from "./llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "./llm-providers";
import { withAiContext } from "./ai-governance";

const acceptanceInclude = {
  creator: { select: { id: true, username: true, image: true } },
  participants: { include: { user: { select: { id: true, username: true, image: true } } } },
} satisfies Prisma.ChallengeInclude;
type AcceptedChallenge = Prisma.ChallengeGetPayload<{ include: typeof acceptanceInclude }>;
export type AcceptanceResult = {
  ok: true; challenge: AcceptedChallenge; participantId: string;
  reused: boolean; transitionedToLive: boolean; creditsDebited: number;
} | { ok: false; status: number; error: string; balance?: number; needed?: number };

/** Internal-credit staking, identical for HTTP, agent tools and match-me. */
export async function acceptChallengeAtomic(challengeId: string, userId: string): Promise<AcceptanceResult> {
  return prisma.$transaction(async (tx): Promise<AcceptanceResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId}, 7117))`;
    // Also coordinate with lifecycle writers that do not use the advisory key.
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
    const challenge = await tx.challenge.findUnique({ where: { id: challengeId }, include: acceptanceInclude });
    if (!challenge) return { ok: false, status: 404, error: "Challenge not found" };
    if (challenge.creatorId === userId) return { ok: false, status: 400, error: "You cannot accept your own challenge" };
    const existing = challenge.participants.find((participant) => participant.userId === userId);
    if (existing?.role === "opponent" && ["accepted", "completed"].includes(existing.status)) {
      return { ok: true, challenge, participantId: existing.id, reused: true, transitionedToLive: false, creditsDebited: 0 };
    }
    if (challenge.status !== "open") return { ok: false, status: 400, error: "Challenge is not open for joining" };
    if (challenge.deadline && challenge.deadline.getTime() <= Date.now()) {
      return { ok: false, status: 409, error: "Challenge deadline has passed" };
    }
    if (existing && !(existing.role === "opponent" && existing.status === "pending")) {
      return { ok: false, status: 400, error: "This participant cannot accept an opponent seat" };
    }
    const competitors = challenge.participants.filter((participant) =>
      ["creator", "opponent"].includes(participant.role) && ["pending", "accepted"].includes(participant.status));
    if ((!existing && competitors.length >= challenge.maxParticipants) || competitors.filter((participant) => participant.status === "accepted").length >= challenge.maxParticipants) {
      return { ok: false, status: 409, error: "Challenge is full" };
    }
    const user = await tx.user.findUnique({ where: { id: userId }, select: { username: true, credits: true } });
    if (!user) return { ok: false, status: 404, error: "User not found" };
    if (challenge.stake > 0) {
      const debited = await tx.user.updateMany({
        where: { id: userId, credits: { gte: challenge.stake } },
        data: { credits: { decrement: challenge.stake } },
      });
      if (debited.count === 0) {
        const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
        return { ok: false, status: 402, error: "Insufficient credits", needed: challenge.stake, balance: current.credits };
      }
      const after = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
      await tx.creditTx.create({ data: {
        userId, type: "stake", amount: -challenge.stake, balanceAfter: after.credits,
        challengeId, idempotencyKey: `stake:accept:${challengeId}:${userId}`,
        description: `Staked ${challenge.stake} credits on "${challenge.title.slice(0, 40)}"`,
      } });
    }
    const participant = existing
      ? await tx.participant.update({ where: { id: existing.id }, data: { status: "accepted" } })
      : await tx.participant.create({ data: { challengeId, userId, role: "opponent", status: "accepted" } });
    const acceptedCount = await tx.participant.count({ where: {
      challengeId, role: { in: ["creator", "opponent"] }, status: "accepted",
    } });
    const newStatus = acceptedCount >= challenge.maxParticipants ? "live" : "open";
    assertChallengeTransition("open", newStatus);
    const updated = await tx.challenge.update({ where: { id: challengeId }, data: { status: newStatus }, include: acceptanceInclude });
    await tx.auditLog.create({ data: {
      action: AuditActions.CHALLENGE_ACCEPTED, actorUserId: userId, challengeId,
      payload: JSON.stringify({ participantId: participant.id, stake: challenge.stake, previousStatus: "open", newStatus }),
    } });
    await tx.activityEvent.create({ data: {
      type: "challenge_accepted", userId, challengeId,
      message: `${user.username} accepted "${challenge.title}"${challenge.stake > 0 ? ` - ${challenge.stake} quest credits reserved` : ""}`,
    } });
    return { ok: true, challenge: updated, participantId: participant.id, reused: false,
      transitionedToLive: newStatus === "live", creditsDebited: challenge.stake };
  }, { maxWait: 15_000, timeout: 15_000 });
}

/** Append only against the exact rules reviewed at acceptance; never replace them. */
export async function persistSharedLiveTask(
  challenge: { id: string; rules: string | null }, actorUserId: string, task: string,
): Promise<boolean> {
  const clean = task.trim().slice(0, 200);
  if (!clean || challenge.rules?.includes("Shared live task:")) return false;
  return prisma.$transaction(async (tx) => {
    const appended = await tx.challenge.updateMany({
      where: { id: challenge.id, status: "live", rules: challenge.rules },
      data: { rules: `${challenge.rules || ""}${challenge.rules ? "\n\n" : ""}Shared live task: ${clean}` },
    });
    if (appended.count === 0) return false;
    await tx.auditLog.create({ data: { action: "challenge.shared_task_added", actorUserId, challengeId: challenge.id,
      payload: JSON.stringify({ task: clean }) } });
    return true;
  });
}

/** Optional quiz work never runs while seat/credits locks are held or on retries. */
export async function acceptChallenge(challengeId: string, userId: string): Promise<AcceptanceResult> {
  const result = await acceptChallengeAtomic(challengeId, userId);
  if (!result.ok || !result.transitionedToLive || !/\b(math|quiz|trivia)\b|算|题/i.test(`${result.challenge.title} ${result.challenge.proposition ?? ""}`)) return result;
  const providerId = process.env.ORACLE_DEFAULT_PROVIDER || DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  if (!def || !process.env[def.envVar]) return result;
  try {
    const task = await withAiContext({ userId, challengeId, purpose: "challenge.shared_task", deadlineMs: 12_000 }, () => completeOraclePrompt({
      providerId, model: def.defaultModel,
      system: "Generate one short shared task for two players. It must have one objectively-checkable answer. Return only the question, no answer or preamble, under 80 characters.",
      user: `Challenge: ${result.challenge.title}\nType: ${result.challenge.type}\nProposition: ${result.challenge.proposition ?? ""}\nAgreed rules: ${result.challenge.rules ?? ""}`,
      maxTokens: 80, temperature: 0.7,
    }));
    await persistSharedLiveTask(result.challenge, userId, task.trim().replace(/^["']|["']$/g, ""));
    const fresh = await prisma.challenge.findUnique({ where: { id: challengeId }, include: acceptanceInclude });
    if (fresh) return { ...result, challenge: fresh };
  } catch {
    // The accepted seat is already committed. Optional task failure cannot undo it.
  }
  return result;
}
