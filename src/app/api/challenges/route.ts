import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized, noCredits } from "@/lib/auth";
import { getCredits, spendCredits, addCredits } from "@/lib/credits";
import { evaluateRuleSafety } from "@/lib/rule-safety";
import { ChallengeStatus } from "@/lib/enums";
import { expandChallengeStatusFilter } from "@/lib/challenge-state-machine";
import { generateLivenessPhrase } from "@/lib/liveness";
import type { ChallengeSpec } from "@/lib/challenge-spec";
import { createChallengeEventFromProtocol, isEventProtocol } from "@/lib/challenge-events";
import { parseProtocolSpecV2, protocolSpecFromChallengeSpec, protocolToLegacyChallengeFields, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { normalizeWeatherOracleProtocol } from "@/lib/weather-oracle";
import { legacyProtocolSpecFromRequest } from "@/lib/legacy-protocol";
import { isStakeTokenAllowed, moneyModeBlock, normalizeStakeToken, paymentJurisdictionFromRequest } from "@/lib/payment-policy";
import { parseChallengeDeadline } from "@/lib/challenge-time";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type   = url.searchParams.get("type");
  const mine   = url.searchParams.get("mine") === "true";
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const user = await getAuthUser();

  const where: Record<string, unknown> = { isPublic: true };
  const statuses = expandChallengeStatusFilter(status);
  if (statuses) where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  if (type)   where.type = type;
  if (mine && user) {
    delete where.isPublic;
    where.OR = [
      { creatorId: user.userId },
      { participants: { some: { userId: user.userId } } },
    ];
    if (!includeArchived) where.visibility = { not: "archived" };
  } else {
    where.visibility = { not: "archived" };
  }

  const [challenges, total] = await Promise.all([
    prisma.challenge.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true, image: true, credits: true } },
        participants: {
          include: { user: { select: { id: true, username: true, image: true } } },
        },
        _count: { select: { evidence: true, judgments: true, judgeJobs: true, participants: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.challenge.count({ where }),
  ]);

  return Response.json({ challenges, total, limit, offset });
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function protocolFromRequest(body: Record<string, unknown>): ProtocolSpecV2 | null {
  const direct = parseProtocolSpecV2(body.protocol);
  if (direct) return direct;

  const specJson = parseJsonObject(body.challengeSpecJson);
  if (!specJson) return null;

  const rawPrompt = typeof body.rawPrompt === "string" ? body.rawPrompt : "";
  return protocolSpecFromChallengeSpec(specJson as unknown as ChallengeSpec, rawPrompt || String(specJson.objective ?? ""));
}

function expectedPositionFor(protocol: ProtocolSpecV2 | null, role: "creator" | "opponent") {
  return protocol?.identityProtocol.participantBindings.find((binding) => binding.role === role)?.expectedPosition ?? null;
}

function livenessPhraseFor(protocol: ProtocolSpecV2 | null) {
  const phrases = (protocol?.identityProtocol.participantBindings ?? [])
    .map((binding) => binding.requiredPhrase?.trim())
    .filter((phrase): phrase is string => Boolean(phrase));
  if (phrases.length === 0) return null;
  return phrases[0];
}

function requestedMaxParticipants(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 5000) : null;
}

function countFromPrompt(rawPrompt: string | null | undefined) {
  const text = String(rawPrompt ?? "");
  const match = text.match(/\b([0-9][0-9,]{0,8})\s*(?:people|persons|participants|players|users|competitors)\b/i)
    ?? text.match(/([0-9][0-9,]{0,8})\s*(?:\u4e2a\u4eba|\u4eba|\u540d|\u4f4d|\u53c2\u4e0e\u8005|\u73a9\u5bb6|\u7528\u6237)/);
  const parsed = match?.[1] ? Number(match[1].replace(/,/g, "")) : null;
  return parsed && Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 5000) : null;
}

function maxParticipantsForProtocol(protocol: ProtocolSpecV2 | null, bodyValue: unknown) {
  if (!protocol) return 2;
  if (protocol.participantMode === "solo") return 1;
  if (protocol.participantMode === "head_to_head") return 2;
  const requested = requestedMaxParticipants(bodyValue);
  if (requested) return requested;
  const promptCount = countFromPrompt(protocol.rawPrompt);
  if (protocol.participantMode === "small_group") return promptCount && promptCount >= 3 ? promptCount : 8;
  if (protocol.participantMode === "team_vs_team") return promptCount && promptCount >= 4 ? promptCount : 10;
  if (protocol.participantMode === "public_market") return promptCount && promptCount >= 2 ? promptCount : 100;
  if (protocol.participantMode === "mass_crowd") return promptCount && promptCount >= 50 ? promptCount : 5000;
  return 2;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const {
      title,
      description,
      marketType = "challenge",
      proposition,
      type,
      stake = 0,
      stakeToken = "credits",
      deadline,
      eventTime,
      joinWindow,
      proofWindow,
      rules,
      evidenceType,
      settlementMode,
      proofSource,
      arbiter,
      fallbackRule,
      disputeWindow,
      aiReview = true,
      isPublic,
      visibility,
      discoveryLat,
      discoveryLng,
      compilerProviderId,
      compilerModel,
      providerCall,
      maxParticipants,
    } = body;

    let protocolSpec = protocolFromRequest(body as Record<string, unknown>);
    if (protocolSpec) protocolSpec = await normalizeWeatherOracleProtocol(protocolSpec);
    if (protocolSpec && !protocolSpec.riskPolicy.allowed) {
      return Response.json(
        {
          error: protocolSpec.riskPolicy.blockedReason || "This challenge protocol is blocked by safety policy.",
          protocol: protocolSpec,
        },
        { status: 400 },
      );
    }
    if (isEventProtocol(protocolSpec)) {
      const { event, creatorEntry } = await createChallengeEventFromProtocol({
        user,
        protocol: protocolSpec as ProtocolSpecV2,
        maxParticipants: (body as Record<string, unknown>).maxParticipants,
      });
      await prisma.activityEvent.create({
        data: {
          type: "event_created",
          message: `${user.username} created event "${event.title}" for up to ${event.maxParticipants} participants`,
          userId: user.userId,
        },
      }).catch(() => null);
      return Response.json({
        event,
        creatorEntry,
        requiresEventFlow: true,
        eventUrl: `/events/${event.id}`,
      }, { status: 201 });
    }
    const protocolLegacy = protocolSpec ? protocolToLegacyChallengeFields(protocolSpec) : null;
    const resolvedTitle = title || protocolLegacy?.title;
    const resolvedDescription = description || protocolLegacy?.description;
    const resolvedProposition = proposition || protocolLegacy?.proposition;
    const resolvedType = type || protocolLegacy?.type || "General";
    const resolvedRules = rules || protocolLegacy?.rules;
    const resolvedEvidenceType = evidenceType || protocolLegacy?.evidenceType || "self_report";
    const resolvedSettlementMode = settlementMode || protocolLegacy?.settlementMode || "mutual_confirmation";
    const resolvedFallbackRule = fallbackRule || protocolLegacy?.fallbackRule;
    const resolvedDisputeWindow = disputeWindow || protocolLegacy?.disputeWindow;
    const resolvedIsPublic = isPublic ?? protocolLegacy?.isPublic ?? true;
    const resolvedVisibility = visibility || protocolLegacy?.visibility || (resolvedIsPublic ? "public" : "private");
    const resolvedCompilerProviderId =
      typeof compilerProviderId === "string" && compilerProviderId.trim()
        ? compilerProviderId.trim()
        : null;
    const resolvedCompilerModel =
      typeof compilerModel === "string" && compilerModel.trim()
        ? compilerModel.trim()
        : null;
    const resolvedMaxParticipants = maxParticipantsForProtocol(protocolSpec, maxParticipants);

    if (!resolvedTitle) return Response.json({ error: "title is required" }, { status: 400 });
    if (!protocolSpec) {
      protocolSpec = legacyProtocolSpecFromRequest({
        rawPrompt: (body as Record<string, unknown>).rawPrompt,
        title: resolvedTitle,
        description: resolvedDescription,
        proposition: resolvedProposition,
        type: resolvedType,
        rules: resolvedRules,
        evidenceType: resolvedEvidenceType,
        settlementMode: resolvedSettlementMode,
        stake,
        isPublic: resolvedIsPublic,
        visibility: resolvedVisibility,
        discoveryLat,
        discoveryLng,
        deadline: deadline || eventTime || joinWindow || proofWindow,
        aiReview,
      });
    }
    const safety = evaluateRuleSafety([
      resolvedTitle,
      resolvedDescription,
      resolvedProposition,
      resolvedType,
      resolvedRules,
      resolvedEvidenceType,
      protocolSpec ? JSON.stringify(protocolSpec.riskPolicy) : null,
    ].filter(Boolean).join("\n"));
    if (!safety.allowed) {
      return Response.json(
        {
          error: safety.reason,
          safety,
        },
        { status: 400 },
      );
    }

    const hasDiscoveryArgs = discoveryLat !== undefined || discoveryLng !== undefined;
    const validDiscoveryLocation =
      typeof discoveryLat === "number" &&
      typeof discoveryLng === "number" &&
      Number.isFinite(discoveryLat) &&
      Number.isFinite(discoveryLng) &&
      Math.abs(discoveryLat) <= 90 &&
      Math.abs(discoveryLng) <= 180;
    if (hasDiscoveryArgs && !validDiscoveryLocation) {
      return Response.json(
        { error: "discoveryLat must be in [-90,90] and discoveryLng in [-180,180]" },
        { status: 400 },
      );
    }

    const stakeNumber = Number(stake);
    const stakeInt = Number.isFinite(stakeNumber) ? Math.max(0, Math.floor(stakeNumber)) : 0;
    const resolvedStakeTokenForStorage = normalizeStakeToken(stakeToken);
    const paymentJurisdiction = paymentJurisdictionFromRequest(req, body as Record<string, unknown>);
    if (stakeInt > 0 && !isStakeTokenAllowed(resolvedStakeTokenForStorage, paymentJurisdiction)) {
      return Response.json(moneyModeBlock(resolvedStakeTokenForStorage, paymentJurisdiction), { status: 403 });
    }
    let creatorStakeTxId: string | undefined;

    // ── ATOMIC ESCROW + CREATE ──
    // Previous flow:
    //   spendCredits(stakeInt)  → credits gone
    //   prisma.challenge.create → may throw (constraint, DB blip, etc.)
    //   → user is charged but no Challenge row exists, no refund.
    // We now stake FIRST (atomic spendCredits is already race-safe, see
    // credits.ts updateMany pattern) and immediately refund if the follow-up
    // Challenge.create throws for any reason. That's the standard
    // "compensating action" pattern — two ops can't be a single transaction
    // because spendCredits writes to both User and CreditTx tables and we
    // want its atomicity guarantees preserved.
    if (stakeInt > 0) {
      const balance = await getCredits(user.userId);
      if (balance < stakeInt) return noCredits(stakeInt, balance);

      const result = await spendCredits(user.userId, stakeInt, "stake", `Staked ${stakeInt} credits on "${String(resolvedTitle).slice(0, 40)}"`, undefined);
      if (!result.success) return noCredits(stakeInt, result.balance);
      creatorStakeTxId = result.txId;
    }

    const deadlineSource = deadline || protocolSpec?.timingProtocol.deadline;
    const deadlineDate = parseChallengeDeadline(deadlineSource, {
      allowPast: protocolSpec?.settlementProtocol.mode === "auto_oracle",
    });

    let challenge: { id: string; title: string } | null = null;
    const evidenceDescriptor = [
      resolvedEvidenceType,
      protocolSpec?.evidenceProtocol.mode,
      protocolSpec?.identityProtocol.mode,
    ].filter(Boolean).join(" ").toLowerCase();
    const needsLiveness =
      evidenceDescriptor.includes("video") ||
      evidenceDescriptor.includes("camera") ||
      evidenceDescriptor.includes("photo") ||
      Boolean(protocolSpec?.identityProtocol.required);
    const livenessPrompt = needsLiveness ? livenessPhraseFor(protocolSpec) ?? generateLivenessPhrase() : null;
    const initialStatus =
      protocolSpec?.participantMode === "solo"
        ? ChallengeStatus.evidence_window_open
        : ChallengeStatus.waiting_for_opponent;
    try {
      challenge = await prisma.$transaction(async (tx) => {
        const created = await tx.challenge.create({
          data: {
            creatorId: user.userId,
            title: resolvedTitle,
            description: resolvedDescription,
            marketType,
            proposition: resolvedProposition,
            type: resolvedType,
            status: initialStatus,
            stake: stakeInt,
            stakeToken: resolvedStakeTokenForStorage,
            deadline: deadlineDate,
            eventTime,
            joinWindow,
            proofWindow,
            rules: resolvedRules,
            evidenceType: resolvedEvidenceType,
            livenessPrompt,
            settlementMode: resolvedSettlementMode,
            proofSource,
            arbiter,
            fallbackRule: resolvedFallbackRule,
            disputeWindow: resolvedDisputeWindow,
            aiReview,
            isPublic: resolvedIsPublic,
            visibility: resolvedVisibility,
            maxParticipants: resolvedMaxParticipants,
            protocolVersion: protocolSpec?.version ?? "2.0",
            participantMode: protocolSpec?.participantMode ?? null,
            outcomeType: protocolSpec?.outcomeType ?? null,
            evidenceMode: protocolSpec?.evidenceProtocol.mode ?? null,
            identityMode: protocolSpec?.identityProtocol.mode ?? null,
            locationMode: protocolSpec?.locationProtocol.mode ?? null,
            settlementProtocolMode: protocolSpec?.settlementProtocol.mode ?? null,
            riskLevel: protocolSpec?.riskPolicy.riskLevel ?? null,
            compilerProviderId: resolvedCompilerProviderId,
            compilerModel: resolvedCompilerModel,
            ...(validDiscoveryLocation
              ? {
                  discoveryLat,
                  discoveryLng,
                  discoveryCapturedAt: new Date(),
                }
              : {}),
            participants: {
              create: { userId: user.userId, role: "creator", status: "accepted" },
            },
          },
          include: {
            creator: { select: { id: true, username: true, image: true, credits: true } },
            participants: {
              include: { user: { select: { id: true, username: true, image: true } } },
            },
          },
        });

        const creatorParticipant = created.participants.find((participant) => participant.user.id === user.userId);
        if (protocolSpec) {
          await tx.challengeProtocol.create({
            data: {
              challengeId: created.id,
              version: protocolSpec.version,
              rawPrompt: protocolSpec.rawPrompt,
              specJson: JSON.stringify(protocolSpec),
              compilerProviderId: resolvedCompilerProviderId,
              compilerModel: resolvedCompilerModel,
              compilerCallJson: providerCall ? JSON.stringify(providerCall) : null,
            },
          });
          await tx.participantBinding.create({
            data: {
              challengeId: created.id,
              userId: user.userId,
              participantId: creatorParticipant?.id ?? null,
              role: "creator",
              displayName: user.username,
              expectedPosition: expectedPositionFor(protocolSpec, "creator"),
              livenessCode: livenessPrompt,
              bindingStatus: protocolSpec.identityProtocol.required ? "pending" : "verified",
            },
          });
        }

        return created;
      });
      if (creatorStakeTxId) {
        const createdChallengeId = challenge.id;
        await prisma.creditTx.update({
          where: { id: creatorStakeTxId },
          data: { challengeId: createdChallengeId },
        }).catch((linkErr) => {
          console.error("CRITICAL: creator stake tx could not be linked to challenge", {
            userId: user.userId,
            challengeId: createdChallengeId,
            creatorStakeTxId,
            linkErr,
          });
        });
      }
    } catch (createErr) {
      // Compensating refund — never leave a user charged with no Challenge.
      if (stakeInt > 0) {
        try {
          await addCredits(user.userId, stakeInt, "refund", `Refund — challenge creation failed for "${String(resolvedTitle).slice(0, 40)}"`);
        } catch (refundErr) {
          console.error("CRITICAL: stake charged but refund failed", { userId: user.userId, stakeInt, createErr, refundErr });
        }
      }
      throw createErr;
    }

    if (validDiscoveryLocation) {
      await prisma.user.update({
        where: { id: user.userId },
        data: {
          latitude: discoveryLat,
          longitude: discoveryLng,
          locationUpdatedAt: new Date(),
        },
      }).catch(() => null);
    }

    await prisma.activityEvent.create({
      data: {
        type: "challenge_created",
        message: `${user.username} created "${resolvedTitle}"${stakeInt > 0 ? ` — ${stakeInt} credits staked` : ""}`,
        userId: user.userId,
        challengeId: challenge.id,
      },
    });

    return Response.json({ challenge }, { status: 201 });
  } catch (err) {
    console.error("Create challenge error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}
