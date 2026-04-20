import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, noCredits } from "@/lib/auth";
import { getCredits, spendCredits } from "@/lib/credits";
import { completeOraclePrompt } from "@/lib/llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";

/** Detect "AI出题" intent — title or proposition mentions math / quiz / trivia. */
const QUIZ_PATTERN = /\b(math|quiz|trivia)\b|算|题/i;

/**
 * Generate a shared live task (math problem / trivia question) when both players
 * have joined. Writes the question to challenge.rules so both phones render it
 * via the existing rules display, and the AI judge later reads it as the task.
 *
 * Best-effort: returns silently if no LLM key is configured.
 */
async function generateSharedLiveTask(challenge: {
  id: string;
  title: string;
  type: string;
  proposition: string | null;
}): Promise<void> {
  const providerId = process.env.ORACLE_DEFAULT_PROVIDER || DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  if (!def || !process.env[def.envVar]) return;

  const system = `You generate a single short live challenge task that two players must solve simultaneously. The task must have a single objectively-checkable correct answer (so an AI judge can verify each player's submission). Math arithmetic, basic trivia, or word puzzles work well. Return ONLY the task as one short sentence — no preamble, no answer.`;
  const user = `Challenge title: "${challenge.title}"
Type: ${challenge.type}
${challenge.proposition ? `Proposition: ${challenge.proposition}\n` : ""}
Generate ONE shared task both players will race to answer correctly. Example: "What is 234 + 87?" or "Name the capital of Australia." Keep it under 80 characters.`;

  try {
    const text = await completeOraclePrompt({
      providerId,
      model: def.defaultModel,
      system,
      user,
      maxTokens: 80,
      temperature: 0.7,
    });
    const task = text.trim().replace(/^["']|["']$/g, "").slice(0, 200);
    if (!task) return;

    await prisma.challenge.update({
      where: { id: challenge.id },
      data: { rules: task },
    });
  } catch {
    // best-effort; leave existing rules in place if LLM call fails
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (challenge.status !== "open") return Response.json({ error: "Challenge is not open for joining" }, { status: 400 });
  if (challenge.creatorId === user.userId) return Response.json({ error: "You cannot accept your own challenge" }, { status: 400 });

  const existing = challenge.participants.find((p: { userId: string }) => p.userId === user.userId);
  if (existing) return Response.json({ error: "You are already in this challenge" }, { status: 400 });
  if (challenge.participants.length >= challenge.maxParticipants) return Response.json({ error: "Challenge is full" }, { status: 400 });

  // Escrow: deduct staked credits upfront
  if (challenge.stake > 0) {
    const balance = await getCredits(user.userId);
    if (balance < challenge.stake) return noCredits(challenge.stake, balance);

    const result = await spendCredits(user.userId, challenge.stake, "stake", `Staked ${challenge.stake} credits on "${challenge.title.slice(0, 40)}"`, id);
    if (!result.success) return noCredits(challenge.stake, result.balance);
  }

  await prisma.participant.create({
    data: {
      challengeId: challenge.id,
      userId: user.userId,
      role: "opponent",
      status: "accepted",
    },
  });

  const newStatus = challenge.participants.length + 1 >= challenge.maxParticipants ? "live" : "open";

  // Generate a shared AI-issued task (e.g. math problem) when the challenge
  // transitions to live AND it looks like a quiz-style challenge. This lets two
  // players race the same question without any schema changes — the question is
  // written to challenge.rules and the existing UI/judge already read that field.
  if (
    newStatus === "live" &&
    QUIZ_PATTERN.test(`${challenge.title} ${challenge.proposition ?? ""}`)
  ) {
    await generateSharedLiveTask({
      id: challenge.id,
      title: challenge.title,
      type: challenge.type,
      proposition: challenge.proposition,
    });
  }

  const updated = await prisma.challenge.update({
    where: { id },
    data: { status: newStatus },
    include: {
      creator: { select: { id: true, username: true, image: true } },
      participants: {
        include: { user: { select: { id: true, username: true, image: true } } },
      },
    },
  });

  await prisma.activityEvent.create({
    data: {
      type: "challenge_accepted",
      message: `${user.username} accepted "${challenge.title}"${challenge.stake > 0 ? ` — ${challenge.stake} credits on the line` : ""}`,
      userId: user.userId,
      challengeId: challenge.id,
    },
  });

  return Response.json({ challenge: updated });
}
