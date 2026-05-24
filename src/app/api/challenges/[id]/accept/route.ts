import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, noCredits } from "@/lib/auth";
import { getCredits, spendCredits, addCredits } from "@/lib/credits";
import { completeOraclePrompt } from "@/lib/llm-router";
import { DEFAULT_LLM_PROVIDER_ID, getProviderById } from "@/lib/llm-providers";
import { ChallengeStatus } from "@/lib/enums";
import { assertChallengeTransition, isOpenForOpponentStatus } from "@/lib/challenge-state-machine";
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import { generateLivenessPhrase } from "@/lib/liveness";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { evaluateLocationEligibility, parseStoredProtocol, validLatLng } from "@/lib/location-eligibility";
import { isStakeTokenAllowed, moneyModeBlock, normalizeStakeToken, paymentJurisdictionFromRequest } from "@/lib/payment-policy";

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

function joiningRoleFor(protocol: ProtocolSpecV2 | null) {
  return protocol?.participantMode === "small_group" ||
    protocol?.participantMode === "team_vs_team" ||
    protocol?.participantMode === "mass_crowd" ||
    protocol?.participantMode === "public_market"
    ? "participant"
    : "opponent";
}

function expectedPositionFor(protocol: ProtocolSpecV2 | null, role: string) {
  return protocol?.identityProtocol.participantBindings.find((binding) => binding.role === role)?.expectedPosition ??
    protocol?.identityProtocol.participantBindings.find((binding) => binding.role === "participant")?.expectedPosition ??
    null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const source = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const acceptedRuleContract =
    source.acceptedRuleContract === true ||
    source.ruleContractAccepted === true ||
    source.contractAccepted === true;
  if (!acceptedRuleContract) {
    return Response.json({
      error: "You must accept the rule contract before joining this challenge.",
    }, { status: 400 });
  }
  const hasLocationFields = "lat" in source || "lng" in source;
  const locationSnapshot = validLatLng(source.lat, source.lng)
    ? { lat: source.lat as number, lng: source.lng as number }
    : null;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      participants: true,
      protocol: true,
      creator: { select: { latitude: true, longitude: true } },
    },
  });

  if (!challenge) return Response.json({ error: "Challenge not found" }, { status: 404 });
  if (!isOpenForOpponentStatus(challenge.status)) return Response.json({ error: "Challenge is not open for joining" }, { status: 400 });
  if (challenge.creatorId === user.userId) return Response.json({ error: "You cannot accept your own challenge" }, { status: 400 });

  const existing = challenge.participants.find((p: { userId: string }) => p.userId === user.userId);
  if (existing) return Response.json({ error: "You are already in this challenge" }, { status: 400 });
  if (challenge.participants.length >= challenge.maxParticipants) return Response.json({ error: "Challenge is full" }, { status: 400 });
  const protocol = parseStoredProtocol(challenge.protocol?.specJson);
  const joiningRole = joiningRoleFor(protocol);
  const locationGate = evaluateLocationEligibility(challenge, locationSnapshot, protocol);
  if (locationGate.required && hasLocationFields && !locationSnapshot) {
    return Response.json({ error: "lat must be in [-90,90] and lng in [-180,180]" }, { status: 400 });
  }
  if (!locationGate.eligible) {
    const status = locationGate.distanceMeters == null
      ? locationGate.reason.includes("no location snapshot")
        ? 409
        : 428
      : 403;
    return Response.json({
      error: locationGate.reason,
      locationEligibility: locationGate,
    }, { status });
  }

  // Escrow: deduct staked credits upfront (atomic — see spendCredits in credits.ts).
  if (challenge.stake > 0) {
    const stakeToken = normalizeStakeToken(challenge.stakeToken);
    const paymentJurisdiction = paymentJurisdictionFromRequest(req, source);
    if (!isStakeTokenAllowed(stakeToken, paymentJurisdiction)) {
      return Response.json(moneyModeBlock(stakeToken, paymentJurisdiction), { status: 403 });
    }
    const balance = await getCredits(user.userId);
    if (balance < challenge.stake) return noCredits(challenge.stake, balance);

    const result = await spendCredits(user.userId, challenge.stake, "stake", `Staked ${challenge.stake} credits on "${challenge.title.slice(0, 40)}"`, id);
    if (!result.success) return noCredits(challenge.stake, result.balance);
  }

  // ── ATOMIC SEAT CLAIM ──
  // Previous flow: length check, then participant.create. Two users racing
  // could both pass the "< maxParticipants" read before either wrote, then
  // both succeed → over-full challenge + 3rd user holding money that isn't
  // part of the pool logic.
  // Fix: participant.create is already guarded by @@unique([challengeId,
  // userId]) so a single user can't create two rows, but NOT across different
  // users. So we wrap in a transaction that re-counts inside and rolls back
  // if the challenge is already full.
  let participantId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const currentCount = await tx.participant.count({
        where: { challengeId: challenge.id, status: { in: ["pending", "accepted"] } },
      });
      if (currentCount >= challenge.maxParticipants) {
        throw new Error("FULL");
      }
      const p = await tx.participant.create({
        data: {
          challengeId: challenge.id,
          userId: user.userId,
          role: joiningRole,
          status: "accepted",
        },
      });
      participantId = p.id;
      if (protocol) {
        await tx.participantBinding.upsert({
          where: { challengeId_userId: { challengeId: challenge.id, userId: user.userId } },
          create: {
            challengeId: challenge.id,
            userId: user.userId,
            participantId: p.id,
            role: joiningRole,
            displayName: user.username,
            expectedPosition: expectedPositionFor(protocol, joiningRole),
            livenessCode: protocol.identityProtocol.required ? generateLivenessPhrase() : null,
            bindingStatus: protocol.identityProtocol.required ? "pending" : "verified",
          },
          update: {
            participantId: p.id,
            role: joiningRole,
            displayName: user.username,
            expectedPosition: expectedPositionFor(protocol, joiningRole),
            livenessCode: protocol.identityProtocol.required ? generateLivenessPhrase() : null,
            bindingStatus: protocol.identityProtocol.required ? "pending" : "verified",
            identityConfidence: null,
            identityCheckJson: null,
            verifiedAt: null,
          },
        });
      }
    });
  } catch (e) {
    // Refund the stake we just escrowed since we can't actually seat them.
    if (challenge.stake > 0) {
      try {
        await addCredits(user.userId, challenge.stake, "refund", `Refund — could not join "${challenge.title.slice(0, 40)}"`, id);
      } catch (refundErr) {
        console.error("CRITICAL: accept stake charged but refund failed", { userId: user.userId, id, refundErr });
      }
    }
    if (e instanceof Error && e.message === "FULL") {
      return Response.json({ error: "Challenge filled up just before you joined — stake refunded." }, { status: 409 });
    }
    // Unique-constraint collision = user already joined (shouldn't happen given the check above, but belt + suspenders).
    return Response.json({ error: "Could not join challenge — stake refunded." }, { status: 409 });
  }
  void participantId; // kept for future logging/audit

  // Re-read authoritative participant count to set the post-join status correctly.
  const freshCount = await prisma.participant.count({
    where: { challengeId: challenge.id, status: { in: ["pending", "accepted"] } },
  });

  const newStatus = freshCount >= challenge.maxParticipants
    ? ChallengeStatus.evidence_window_open
    : ChallengeStatus.waiting_for_opponent;

  if (newStatus === ChallengeStatus.evidence_window_open) {
    assertChallengeTransition(challenge.status, ChallengeStatus.opponent_accepted);
    await prisma.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.opponent_accepted },
    });
    if (challenge.stake > 0) {
      assertChallengeTransition(ChallengeStatus.opponent_accepted, ChallengeStatus.escrow_locked);
      await prisma.challenge.update({
        where: { id },
        data: { status: ChallengeStatus.escrow_locked },
      });
    }
    const fromStatus = challenge.stake > 0
      ? ChallengeStatus.escrow_locked
      : ChallengeStatus.opponent_accepted;
    assertChallengeTransition(fromStatus, ChallengeStatus.evidence_window_open);
  }

  // Generate a shared AI-issued task (e.g. math problem) when the challenge
  // transitions to live AND it looks like a quiz-style challenge. This lets two
  // players race the same question without any schema changes — the question is
  // written to challenge.rules and the existing UI/judge already read that field.
  if (
    newStatus === ChallengeStatus.evidence_window_open &&
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

  await appendAuditLog({
    action: AuditActions.CHALLENGE_ACCEPTED,
    actorUserId: user.userId,
    challengeId: challenge.id,
    payload: {
      previousStatus: challenge.status,
      acceptedStatus: ChallengeStatus.opponent_accepted,
      escrowStatus: challenge.stake > 0 ? ChallengeStatus.escrow_locked : null,
      newStatus,
      stake: challenge.stake,
      locationGate: {
        required: locationGate.required,
        eligible: locationGate.eligible,
        mode: locationGate.mode,
        distanceMeters: locationGate.distanceMeters,
        requiredRadiusMeters: locationGate.requiredRadiusMeters,
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
