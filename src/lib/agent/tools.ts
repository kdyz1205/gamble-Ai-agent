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
import { AuditActions, appendAuditLog } from "@/lib/audit-log";
import { cleanupChallengeFrameBlobs, cleanupReplacedEvidenceBlobs } from "@/lib/media/blob-cleanup";
import { evaluateLocationEligibility, parseStoredProtocol, validLatLng } from "@/lib/location-eligibility";
import { verifyEvidenceAgainstProtocol } from "@/lib/protocol-evidence-verification";
import { compileProtocolForUser } from "@/lib/protocol-compiler";
import { ChallengeStatus } from "@/lib/enums";
import { evaluateAutoSettleEligibility, requiresHoldDurationWinnerFromText, requiresRepCountWinnerFromText, type EvidenceQuality, type VerdictRecommendation } from "@/lib/judgment-policy";
import { combineAutoSettlePolicyWithProtocolGates, evaluateProtocolJudgmentGates } from "@/lib/protocol-judgment-policy";
import { parseProtocolSpecV2, protocolPreview, protocolSpecFromChallengeSpec, protocolToLegacyChallengeFields, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import type { ChallengeSpec } from "@/lib/challenge-spec";
import { generateLivenessPhrase } from "@/lib/liveness";
import {
  EVIDENCE_WINDOW_STATUSES,
  OPEN_FOR_OPPONENT_STATUSES,
  VERDICT_READY_STATUSES,
  assertChallengeTransition,
  isEvidenceWindowStatus,
  isOpenForOpponentStatus,
  isVerdictReadyStatus,
} from "@/lib/challenge-state-machine";
import type { AgentToolName, DraftState } from "./types";

export interface ToolContext {
  userId: string;
  baseUrl: string; // used to construct share links
  draftState: DraftState;
  locationSnapshot?: { lat: number; lng: number } | null;
  providerId?: string | null;
  model?: string | null;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function readMetricsJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function expectedPositionFor(protocol: ProtocolSpecV2 | null, role: "creator" | "opponent") {
  return protocol?.identityProtocol.participantBindings.find((binding) => binding.role === role)?.expectedPosition ?? null;
}

function recordingSessionRequired(protocol: ProtocolSpecV2 | null) {
  return protocol?.evidenceProtocol.mode === "same_camera_video" ||
    protocol?.evidenceProtocol.mode === "live_host_video";
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function jsonOrNull(value: Record<string, unknown>) {
  return Object.keys(value).length > 0 ? JSON.stringify(value) : null;
}

function buildProtocolFromAgentDraft(input: {
  title: string;
  proposition: string;
  stake: number;
  evidenceType: string;
  judgeRule: string;
  timeWindow: string;
  isPublic: boolean;
  hasDiscoveryLocation: boolean;
}): ProtocolSpecV2 {
  const videoLike = /video|camera|photo/i.test(input.evidenceType);
  const challengeSpec: ChallengeSpec = {
    challenge_title: input.title,
    challenge_type: inferTypeFromTitle(input.title),
    participants: [
      { role: "creator", label: "Creator" },
      { role: "opponent", label: "Opponent" },
    ],
    stake_amount: input.stake,
    currency_or_points: "credits",
    public_or_private: input.isPublic ? "public" : "private",
    invite_mode: input.hasDiscoveryLocation ? "nearby" : "invite_link",
    participation_mode: "remote_async",
    objective: input.proposition,
    winning_condition: input.judgeRule || input.proposition,
    required_evidence: videoLike ? "Continuous video evidence from each participant." : `Text evidence: ${input.evidenceType}`,
    video_capture_instructions: videoLike
      ? "Record one continuous attempt. Keep the participant visible and do not edit the clip."
      : "Submit one clear text answer or proof note.",
    start_condition: "Challenge starts after the opponent accepts.",
    end_condition: input.timeWindow || "When the evidence window closes.",
    timing_method: "Use app timestamps and submitted evidence metadata.",
    valid_repetition_definition: input.judgeRule || input.proposition,
    scoring_method: input.judgeRule || input.proposition,
    allowed_attempts: "One official submission per participant.",
    anti_cheat_rules: [
      "Evidence must be original to this challenge.",
      "No edited, coerced, unsafe, or unclear evidence.",
    ],
    ai_judging_method: input.judgeRule || "AI compares submitted evidence against the win condition.",
    dispute_window: "24 hours",
    fallback_manual_review: "If confidence is below 0.85 or evidence is unclear, require manual review.",
    payout_rule: "Winner receives internal credits after the verdict is eligible and confirmed.",
    safety_warning: "Only attempt safe, legal, voluntary challenges.",
    legal_compliance_flag: "internal_points_only",
    mode_options: [
      { label: "Invite link", value: "invite_link", description: "Send a private join link." },
      { label: "Nearby", value: "nearby", description: "Let nearby users discover and join." },
      { label: "Remote", value: "remote_async", description: "Each participant submits separately." },
    ],
  };
  return protocolSpecFromChallengeSpec(challengeSpec, `${input.title}\n${input.proposition}`);
}

function readLocationSnapshot(
  args: Record<string, unknown>,
  fallback?: { lat: number; lng: number } | null,
): { lat: number; lng: number } | null {
  const argLat = args.discoveryLat ?? args.lat;
  const argLng = args.discoveryLng ?? args.lng;
  const lat = typeof argLat === "number" ? argLat : fallback?.lat;
  const lng = typeof argLng === "number" ? argLng : fallback?.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return { lat, lng };
}

/* ─────────────────────────────────────────────── */

async function compileProtocolTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const inputText = String(
    args.inputText ??
    args.prompt ??
    ctx.draftState.rawPrompt ??
    ctx.draftState.proposition ??
    ctx.draftState.title ??
    "",
  ).trim();
  if (!inputText) return { ok: false, error: "inputText required" };

  const languageArg = args.language;
  const language = languageArg === "en" || languageArg === "zh" || languageArg === "auto"
    ? languageArg
    : "auto";
  const compiled = await compileProtocolForUser({
    userId: ctx.userId,
    inputText,
    providerId: typeof args.providerId === "string" ? args.providerId : ctx.providerId ?? undefined,
    model: typeof args.model === "string" ? args.model : ctx.model ?? undefined,
    language,
    context: {
      surface: "agent_chat",
      tool: "compileProtocol",
      locationSnapshot: ctx.locationSnapshot ?? undefined,
    },
    route: "/api/agent/respond/compileProtocol",
  });

  const draftPatch: Partial<DraftState> = {
    protocol: compiled.protocol,
    protocolPreview: compiled.preview,
    rawPrompt: compiled.rawPrompt,
    readyToCompile: false,
    missingProtocolFields: [],
    lastCompilerResult: {
      providerId: compiled.providerId,
      model: compiled.model,
      protocolId: null,
    },
    title: compiled.protocol.title,
    proposition: compiled.protocol.userFacingSummary,
    participants: compiled.protocol.participantMode,
    evidenceType: compiled.protocol.evidenceProtocol.mode.includes("photo")
      ? "photo"
      : compiled.protocol.evidenceProtocol.mode.includes("video")
        ? "video"
        : "text",
    judgeRule: compiled.protocol.settlementProtocol.winCondition,
    timeWindow: compiled.protocol.timingProtocol.deadline,
    safetyNotes: compiled.protocol.riskPolicy.warnings,
    readyToPublish: compiled.protocol.riskPolicy.allowed,
  };

  return {
    ok: true,
    data: {
      rawPrompt: compiled.rawPrompt,
      protocol: compiled.protocol,
      preview: compiled.preview,
      source: compiled.source,
      providerId: compiled.providerId,
      model: compiled.model,
      externalApiCharged: compiled.externalApiCharged,
      providerCall: compiled.providerCall,
      dailyQuota: compiled.dailyQuota,
      draftPatch,
    },
  };
}

async function createChallengeTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  // Source of truth is the current merged draftState; args can override.
  const draft = ctx.draftState;
  const protocolArg = parseProtocolSpecV2(args.protocol);
  const protocolFromDraft = draft.protocol;
  const canonicalProtocol = protocolArg ?? protocolFromDraft;
  const title = String(args.title ?? draft.title ?? canonicalProtocol?.title ?? "").trim();
  const proposition = String(args.proposition ?? draft.proposition ?? canonicalProtocol?.userFacingSummary ?? title);
  const stake = Math.max(0, Math.floor(Number(args.stake ?? draft.stake ?? 0)));
  const evidenceType = String(args.evidenceType ?? draft.evidenceType ?? canonicalProtocol?.evidenceProtocol.mode ?? "self_report");
  const judgeRule = String(args.judgeRule ?? draft.judgeRule ?? canonicalProtocol?.settlementProtocol.winCondition ?? "");
  const timeWindow = String(args.timeWindow ?? draft.timeWindow ?? canonicalProtocol?.timingProtocol.deadline ?? "24 hours");
  // Default challenges to PUBLIC so /markets actually has something to show
  // and strangers can find + accept. Agent can override with isPublic=false
  // if the user explicitly says "just me and my friend" / "private".
  const rawIsPublic = args.isPublic;
  const protocolPublicDefault = canonicalProtocol
    ? protocolToLegacyChallengeFields(canonicalProtocol).isPublic
    : true;
  const isPublic = rawIsPublic === undefined ? protocolPublicDefault : Boolean(rawIsPublic);
  const locationSnapshot = isPublic ? readLocationSnapshot(args, ctx.locationSnapshot) : null;

  if (!title) return { ok: false, error: "title required" };
  if (canonicalProtocol && !canonicalProtocol.riskPolicy.allowed) {
    return {
      ok: false,
      error: canonicalProtocol.riskPolicy.blockedReason || "This protocol is blocked by the safety policy.",
    };
  }

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
  if (!canonicalProtocol && (looksLikeMoodOrGarbage || (propositionIsJustTitle && judgeRuleTooThin))) {
    return {
      ok: false,
      error:
        "This doesn't look like a judgeable challenge yet — I need a clear win condition (who does what, and how do we decide who wins). Can you tell me what you actually want to compete on?",
    };
  }

  // Parse timeWindow into a deadline Date, same logic as POST /api/challenges
  const deadline = parseTimeWindowToDate(timeWindow);
  const protocolSpec = canonicalProtocol ?? buildProtocolFromAgentDraft({
      title,
      proposition,
      stake,
      evidenceType,
      judgeRule,
      timeWindow,
      isPublic,
      hasDiscoveryLocation: Boolean(locationSnapshot),
    });
  const protocolLegacy = protocolToLegacyChallengeFields(protocolSpec);
  const evidenceDescriptor = [
    evidenceType,
    protocolSpec.evidenceProtocol.mode,
    protocolSpec.identityProtocol.mode,
  ].join(" ").toLowerCase();
  const needsLiveness =
    evidenceDescriptor.includes("video") ||
    evidenceDescriptor.includes("camera") ||
    evidenceDescriptor.includes("photo") ||
    protocolSpec.identityProtocol.required;
  const livenessPrompt = needsLiveness ? generateLivenessPhrase() : null;

  // Atomic escrow then create; refund on throw — same pattern POST /api/challenges uses.
  let creatorStakeTxId: string | undefined;
  if (stake > 0) {
    const spend = await spendCredits(ctx.userId, stake, "stake", `Staked ${stake} credits on "${title.slice(0, 40)}"`);
    if (!spend.success) return { ok: false, error: spend.error || "Insufficient credits" };
    creatorStakeTxId = spend.txId;
  }

  let challenge: { id: string; title: string; status: string; stake: number; evidenceType: string } | null = null;
  try {
    challenge = await prisma.$transaction(async (tx) => {
      const created = await tx.challenge.create({
        data: {
          creatorId: ctx.userId,
          title: protocolLegacy.title,
          description: protocolLegacy.description,
          marketType: "challenge",
          proposition: protocolLegacy.proposition,
          type: protocolLegacy.type,
          stake,
          stakeToken: "credits",
          deadline,
          rules: protocolLegacy.rules,
          evidenceType: protocolLegacy.evidenceType,
          livenessPrompt,
          settlementMode: protocolLegacy.settlementMode,
          fallbackRule: protocolLegacy.fallbackRule,
          disputeWindow: protocolLegacy.disputeWindow,
          isPublic,
          visibility: isPublic ? "public" : "private",
          protocolVersion: protocolSpec.version,
          participantMode: protocolSpec.participantMode,
          outcomeType: protocolSpec.outcomeType,
          evidenceMode: protocolSpec.evidenceProtocol.mode,
          identityMode: protocolSpec.identityProtocol.mode,
          locationMode: protocolSpec.locationProtocol.mode,
          settlementProtocolMode: protocolSpec.settlementProtocol.mode,
          riskLevel: protocolSpec.riskPolicy.riskLevel,
          compilerProviderId: "agent",
          compilerModel: "agent-draft-to-protocol-v2",
          ...(locationSnapshot
            ? {
                discoveryLat: locationSnapshot.lat,
                discoveryLng: locationSnapshot.lng,
                discoveryCapturedAt: new Date(),
              }
            : {}),
          maxParticipants: 2,
          aiReview: true,
          status: ChallengeStatus.waiting_for_opponent,
          participants: {
            create: { userId: ctx.userId, role: "creator", status: "accepted" },
          },
        },
        include: { participants: true },
      });
      const creatorParticipant = created.participants.find((participant) => participant.userId === ctx.userId);
      await tx.challengeProtocol.create({
        data: {
          challengeId: created.id,
          version: protocolSpec.version,
          rawPrompt: protocolSpec.rawPrompt,
          specJson: JSON.stringify(protocolSpec),
          compilerProviderId: "agent",
          compilerModel: "agent-draft-to-protocol-v2",
          compilerCallJson: JSON.stringify({ source: "agent_draft_bridge" }),
        },
      });
      await tx.participantBinding.create({
        data: {
          challengeId: created.id,
          userId: ctx.userId,
          participantId: creatorParticipant?.id ?? null,
          role: "creator",
          expectedPosition: expectedPositionFor(protocolSpec, "creator"),
          livenessCode: livenessPrompt,
          bindingStatus: protocolSpec.identityProtocol.required ? "pending" : "verified",
        },
      });
      return created;
    });
    if (creatorStakeTxId) {
      const createdChallengeId = challenge.id;
      await prisma.creditTx.update({
        where: { id: creatorStakeTxId },
        data: { challengeId: createdChallengeId },
      }).catch((linkErr) => {
        console.error("CRITICAL: creator stake tx could not be linked to agent-created challenge", {
          userId: ctx.userId,
          challengeId: createdChallengeId,
          creatorStakeTxId,
          linkErr,
        });
      });
    }
  } catch (err) {
    if (stake > 0) {
      await addCredits(ctx.userId, stake, "refund", `Refund — challenge creation failed`);
    }
    return { ok: false, error: err instanceof Error ? err.message : "Challenge create failed" };
  }

  if (locationSnapshot) {
    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        latitude: locationSnapshot.lat,
        longitude: locationSnapshot.lng,
        locationUpdatedAt: new Date(),
      },
    }).catch(() => null);
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
      marketUrl: `${ctx.baseUrl}/challenge/${challenge.id}`,
      challengeUrl: `${ctx.baseUrl}/challenge/${challenge.id}`,
      hasDiscoveryLocation: Boolean(locationSnapshot),
      draftPatch: {
        protocol: protocolSpec,
        protocolPreview: protocolPreview(protocolSpec),
        rawPrompt: protocolSpec.rawPrompt,
        readyToCompile: false,
        missingProtocolFields: [],
        lastCompilerResult: {
          providerId: ctx.draftState.lastCompilerResult?.providerId ?? "agent",
          model: ctx.draftState.lastCompilerResult?.model ?? "agent-draft-to-protocol-v2",
          protocolId: challenge.id,
        },
        readyToPublish: false,
      },
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
  const acceptedRuleContract =
    args.acceptedRuleContract === true ||
    args.ruleContractAccepted === true ||
    args.contractAccepted === true;
  if (!acceptedRuleContract) {
    return {
      ok: false,
      error: "Open the join link and accept the rule contract before joining this challenge.",
      data: {
        challengeId,
        joinUrl: `${ctx.baseUrl}/join/${challengeId}`,
        required: "acceptedRuleContract",
      },
    };
  }
  const hasLocationFields = "lat" in args || "lng" in args || "discoveryLat" in args || "discoveryLng" in args;
  const locationSnapshot = readLocationSnapshot(args, ctx.locationSnapshot);
  if (hasLocationFields && !validLatLng(args.lat ?? args.discoveryLat, args.lng ?? args.discoveryLng)) {
    return { ok: false, error: "lat must be in [-90,90] and lng in [-180,180]" };
  }
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { username: true },
  });
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      participants: true,
      protocol: true,
      creator: { select: { latitude: true, longitude: true } },
    },
  });
  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (!isOpenForOpponentStatus(challenge.status)) return { ok: false, error: `Challenge not open (status=${challenge.status})` };
  if (challenge.creatorId === ctx.userId) return { ok: false, error: "You cannot accept your own challenge" };
  if (challenge.participants.some((p) => p.userId === ctx.userId)) {
    return { ok: false, error: "You are already in this challenge" };
  }
  if (challenge.participants.length >= challenge.maxParticipants) {
    return { ok: false, error: "Challenge is full" };
  }

  const protocol = parseStoredProtocol(challenge.protocol?.specJson);
  const locationGate = evaluateLocationEligibility(challenge, locationSnapshot, protocol);
  if (!locationGate.eligible) {
    return {
      ok: false,
      error: locationGate.reason,
      data: { locationEligibility: locationGate },
    };
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
      const participant = await tx.participant.create({
        data: { challengeId, userId: ctx.userId, role: "opponent", status: "accepted" },
      });
      if (protocol) {
        await tx.participantBinding.upsert({
          where: { challengeId_userId: { challengeId, userId: ctx.userId } },
          create: {
            challengeId,
            userId: ctx.userId,
            participantId: participant.id,
            role: "opponent",
            displayName: user?.username ?? null,
            expectedPosition: expectedPositionFor(protocol, "opponent"),
            livenessCode: protocol.identityProtocol.required ? generateLivenessPhrase() : null,
            bindingStatus: protocol.identityProtocol.required ? "pending" : "verified",
          },
          update: {
            participantId: participant.id,
            role: "opponent",
            displayName: user?.username ?? null,
            expectedPosition: expectedPositionFor(protocol, "opponent"),
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
    if (challenge.stake > 0) {
      await addCredits(ctx.userId, challenge.stake, "refund", `Refund — could not join "${challenge.title.slice(0, 40)}"`, challengeId);
    }
    return { ok: false, error: e instanceof Error ? e.message === "FULL" ? "Challenge full — stake refunded" : e.message : "Accept failed" };
  }

  const fresh = await prisma.participant.count({
    where: { challengeId, status: { in: ["pending", "accepted"] } },
  });
  const newStatus = fresh >= challenge.maxParticipants
    ? ChallengeStatus.evidence_window_open
    : ChallengeStatus.waiting_for_opponent;
  if (newStatus === ChallengeStatus.evidence_window_open) {
    assertChallengeTransition(challenge.status, ChallengeStatus.opponent_accepted);
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { status: ChallengeStatus.opponent_accepted },
    });
    if (challenge.stake > 0) {
      assertChallengeTransition(ChallengeStatus.opponent_accepted, ChallengeStatus.escrow_locked);
      await prisma.challenge.update({
        where: { id: challengeId },
        data: { status: ChallengeStatus.escrow_locked },
      });
    }
    const fromStatus = challenge.stake > 0
      ? ChallengeStatus.escrow_locked
      : ChallengeStatus.opponent_accepted;
    assertChallengeTransition(fromStatus, ChallengeStatus.evidence_window_open);
  }
  await prisma.challenge.update({ where: { id: challengeId }, data: { status: newStatus } });

  await appendAuditLog({
    action: AuditActions.CHALLENGE_ACCEPTED,
    actorUserId: ctx.userId,
    challengeId,
    payload: {
      source: "agent_tool",
      previousStatus: challenge.status,
      newStatus,
      stake: challenge.stake,
      locationGate: {
        required: locationGate.required,
        eligible: locationGate.eligible,
        mode: locationGate.mode,
        distanceMeters: locationGate.distanceMeters,
        requiredRadiusMeters: locationGate.requiredRadiusMeters,
      },
      protocolBound: Boolean(protocol),
    },
  });

  await prisma.activityEvent.create({
    data: {
      type: "challenge_accepted",
      message: `${user?.username ?? "Someone"} accepted "${challenge.title}"${challenge.stake > 0 ? ` — ${challenge.stake} credits on the line` : ""}`,
      userId: ctx.userId,
      challengeId,
    },
  });

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
      marketUrl: `${ctx.baseUrl}/challenge/${challengeId}`,
      challengeUrl: `${ctx.baseUrl}/challenge/${challengeId}`,
    },
  };
}

/* ─────────────────────────────────────────────── */

async function uploadEvidenceTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const challengeId = String(args.challengeId ?? "").trim();
  const type = String(args.type ?? "text").trim().toLowerCase() || "text";
  const description = args.description ? String(args.description) : null;
  const url = args.url ? String(args.url) : null;
  const metadataRecord = recordFromUnknown(args.metadata);
  const recordingSessionId =
    typeof args.recordingSessionId === "string" && args.recordingSessionId.trim()
      ? args.recordingSessionId.trim()
      : null;
  if (!challengeId) return { ok: false, error: "challengeId required" };

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { participants: true, protocol: true },
  });
  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (!isEvidenceWindowStatus(challenge.status)) {
    return { ok: false, error: `Challenge is not active (status=${challenge.status})` };
  }
  if (!challenge.participants.some((p) => p.userId === ctx.userId)) {
    return { ok: false, error: "You are not a participant" };
  }

  const protocol = parseStoredProtocol(challenge.protocol?.specJson);
  const activeParticipants = challenge.participants.filter((p) => p.status === "accepted");
  if (recordingSessionRequired(protocol)) {
    if (!recordingSessionId) {
      return { ok: false, error: "This challenge requires a recording session before evidence upload." };
    }
    const recordingSession = await prisma.recordingSession.findFirst({
      where: { id: recordingSessionId, challengeId },
      select: { id: true, createdByUserId: true, status: true },
    });
    if (!recordingSession) {
      return { ok: false, error: "Recording session not found for this challenge." };
    }
    if (!activeParticipants.some((participant) => participant.userId === recordingSession.createdByUserId)) {
      return { ok: false, error: "Recording session owner is not a challenge participant." };
    }
    if (recordingSession.status === "cancelled") {
      return { ok: false, error: "Recording session was cancelled." };
    }
  }

  const sharedSameCamera = metadataRecord.sharedSameCamera === true;
  const evidenceDescription = sharedSameCamera
    ? [
        description,
        "Shared same-camera evidence for both accepted participants. Judge must identify both people in the same media and compare the visible result; unclear identity or finish order requires no winner.",
      ].filter(Boolean).join("\n")
    : description;
  const targetUserIds = sharedSameCamera
    ? [
        ctx.userId,
        ...activeParticipants
          .map((participant) => participant.userId)
          .filter((participantUserId) => participantUserId !== ctx.userId),
      ]
    : [ctx.userId];
  const previousEvidenceRows = await prisma.evidence.findMany({
    where: { challengeId, userId: { in: targetUserIds } },
    select: { id: true, userId: true, url: true, preparedFrames: true },
  });
  const metadataFor = (targetUserId: string) => {
    const next: Record<string, unknown> = { ...metadataRecord };
    if (sharedSameCamera) {
      next.sharedSameCamera = true;
      next.sharedUploadedBy = ctx.userId;
      next.sharedEvidenceFor = targetUserId;
      next.identityGuidance = "Creator/Participant A should be on the left and opponent/Participant B on the right when possible.";
    }
    if (recordingSessionId) next.recordingSessionId = recordingSessionId;
    return jsonOrNull(next);
  };

  const evidenceRows = [];
  for (const targetUserId of targetUserIds) {
    const row = await prisma.evidence.upsert({
      where: { challengeId_userId: { challengeId, userId: targetUserId } },
      create: {
        challengeId,
        userId: targetUserId,
        type,
        url,
        description: evidenceDescription,
        metadata: metadataFor(targetUserId),
      },
      update: {
        type,
        url,
        description: evidenceDescription,
        metadata: metadataFor(targetUserId),
        preparedFrames: null,
        preparedAt: null,
        preparedDurationSec: null,
        preparedMode: null,
        prepareError: null,
      },
    });
    evidenceRows.push(row);
    await prisma.evidenceCheck.upsert({
      where: { evidenceId: row.id },
      create: {
        evidenceId: row.id,
        challengeId,
        userId: row.userId,
        protocolVersion: challenge.protocolVersion ?? "2.0",
        decision: "pending",
      },
      update: {
        protocolVersion: challenge.protocolVersion ?? "2.0",
        identityCheckJson: null,
        evidenceCheckJson: null,
        outcomeCheckJson: null,
        identityConfidence: null,
        evidenceConfidence: null,
        outcomeConfidence: null,
        decision: "pending",
        blockingIssues: null,
      },
    });
  }

  const verification = [];
  for (const row of evidenceRows) {
    try {
      verification.push(await verifyEvidenceAgainstProtocol(row.id));
    } catch (verifyErr) {
      console.error("[agent.uploadEvidence] protocol verification failed", {
        challengeId,
        evidenceId: row.id,
        userId: row.userId,
        verifyErr,
      });
    }
  }

  if (recordingSessionId) {
    await prisma.recordingSession.update({
      where: { id: recordingSessionId },
      data: { status: "evidence_submitted", endedAt: new Date() },
    }).catch((sessionErr) => {
      console.error("[agent.uploadEvidence] recording session close failed", {
        challengeId,
        recordingSessionId,
        sessionErr,
      });
    });
  }

  await prisma.activityEvent.create({
    data: {
      type: "evidence_submitted",
      message: `Evidence submitted for "${challenge.title}" via agent`,
      userId: ctx.userId,
      challengeId,
    },
  });

  const evCount = await prisma.evidence.findMany({
    where: { challengeId },
    select: { userId: true },
    distinct: ["userId"],
  });
  const submitted = new Set(evCount.map((row) => row.userId));
  const creatorSubmitted = submitted.has(challenge.creatorId);
  const opponentSubmitted = activeParticipants.some((participant) =>
    participant.role === "opponent" && submitted.has(participant.userId),
  );
  const nextStatus = evCount.length >= activeParticipants.length
    ? ChallengeStatus.ai_reviewing
    : creatorSubmitted
      ? ChallengeStatus.creator_submitted
      : opponentSubmitted
        ? ChallengeStatus.opponent_submitted
        : ChallengeStatus.evidence_window_open;
  await prisma.challenge.updateMany({
    where: { id: challengeId, status: { in: [...EVIDENCE_WINDOW_STATUSES] } },
    data: { status: nextStatus },
  });

  await cleanupReplacedEvidenceBlobs(
    challengeId,
    previousEvidenceRows.map((row) => ({
      evidenceId: row.id,
      url: row.url,
      preparedFrames: row.preparedFrames,
      currentUrl: url,
    })),
  ).catch((cleanupErr) => {
    console.error("[agent.uploadEvidence] replaced evidence cleanup failed", { challengeId, cleanupErr });
  });

  return {
    ok: true,
    data: {
      evidenceId: evidenceRows[0]?.id,
      evidenceIds: evidenceRows.map((row) => row.id),
      challengeId,
      type,
      hasUrl: !!url,
      sharedEvidenceCount: evidenceRows.length,
      verification: verification.map((row) => ({
        evidenceId: row.evidenceId,
        userId: row.userId,
        decision: row.decision,
        blockingIssues: row.blockingIssues,
      })),
    },
  };
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
      evidence: true,
      evidenceChecks: true,
      participantBindings: true,
      protocol: true,
      judgments: { where: { method: "ai", status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (challenge.creatorId !== ctx.userId) return { ok: false, error: "Only the creator can confirm" };
  if (challenge.status === ChallengeStatus.settled) return { ok: false, error: "Already settled" };
  if (!isVerdictReadyStatus(challenge.status)) {
    return { ok: false, error: `Not confirmable (status=${challenge.status})` };
  }
  const j = challenge.judgments[0];
  if (!j) return { ok: false, error: "No AI recommendation to confirm yet" };

  const metrics = readMetricsJson(j.metricsJson);
  const evidenceQuality =
    typeof metrics.evidenceQuality === "string"
      ? metrics.evidenceQuality
      : j.winnerId && (j.confidence ?? 0) >= 0.85 ? "good" : "unclear";
  const recommendation =
    typeof metrics.recommendation === "string"
      ? metrics.recommendation
      : typeof metrics.settlementRecommendation === "string"
        ? metrics.settlementRecommendation
        : j.winnerId && (j.confidence ?? 0) >= 0.85 ? "settle_winner" : "needs_review";
  const confidence = j.confidence ?? 0;
  const persistedBlockingIssues = stringArray(metrics.blockingIssues);
  const opponent = challenge.participants.find((p) => p.role === "opponent");
  const reconstructedResult = {
    winnerId: j.winnerId,
    reasoning: j.reasoning ?? "",
    confidence,
    evidenceQuality: evidenceQuality as EvidenceQuality,
    recommendation: recommendation as VerdictRecommendation,
    blockingIssues: persistedBlockingIssues,
    source: typeof metrics.source === "string" ? metrics.source as "deterministic" | "vision_llm" | "llm" | "fallback" : undefined,
    videoMetrics: metrics.videoMetrics as never,
  };
  const aiOnlyPolicy = evaluateAutoSettleEligibility(
    reconstructedResult,
    {
      requiresVision:
        challenge.evidenceType === "video" ||
        challenge.evidence.some((e) => String(e.type ?? "").toLowerCase() === "video"),
      requiresRepCountWinner: requiresRepCountWinnerFromText(
        challenge.title,
        challenge.description,
        challenge.proposition,
        challenge.rules,
      ),
      requiresHoldDurationWinner: requiresHoldDurationWinnerFromText(
        challenge.title,
        challenge.description,
        challenge.proposition,
        challenge.rules,
      ),
      participantAId: challenge.creatorId,
      participantBId: opponent?.userId ?? null,
    },
  );
  const protocol = challenge.protocol?.specJson
    ? (() => {
        try {
          return parseProtocolSpecV2(JSON.parse(challenge.protocol.specJson));
        } catch {
          return null;
        }
      })()
    : null;
  const protocolGates = evaluateProtocolJudgmentGates({
    protocol,
    participants: challenge.participants,
    participantBindings: challenge.participantBindings,
    evidence: challenge.evidence,
    evidenceChecks: challenge.evidenceChecks,
    result: reconstructedResult,
  });
  const policy = combineAutoSettlePolicyWithProtocolGates(aiOnlyPolicy, protocolGates);
  const persistedEligible = metrics.autoSettleEligible !== false;
  const persistedProtocolEligible =
    !metrics.settlementEligibility ||
    (typeof metrics.settlementEligibility === "object" &&
      metrics.settlementEligibility !== null &&
      (metrics.settlementEligibility as { eligible?: unknown }).eligible !== false);
  if (!policy.eligible || !persistedEligible || !persistedProtocolEligible) {
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { status: ChallengeStatus.manual_review_required },
    });
    return {
      ok: false,
      error: "AI recommendation is not eligible for settlement.",
      data: {
        challengeId,
        status: ChallengeStatus.manual_review_required,
        verdictGuardrail: {
          recommendation,
          confidence,
          evidenceQuality,
          winnerId: j.winnerId,
          blockingIssues: policy.blockingIssues,
          protocolCompliance: protocolGates.protocolCompliance,
          identityResult: protocolGates.identityResult,
          evidenceResult: protocolGates.evidenceResult,
          settlementEligibility: protocolGates.settlementEligibility,
        },
      },
    };
  }

  const claim = await prisma.challenge.updateMany({
    where: { id: challengeId, status: { in: [...VERDICT_READY_STATUSES] } },
    data: { status: ChallengeStatus.finalized },
  });
  if (claim.count === 0) return { ok: false, error: "Already being finalized by another request" };

  if (challenge.stake > 0) {
    const settlement = await settleChallenge(
      challengeId,
      j.winnerId,
      challenge.stake,
      challenge.participants.map((p) => ({ userId: p.userId })),
    );
    if (!settlement.success) return { ok: false, error: settlement.error || "Settlement failed" };
  }
  const finalStatus = j.winnerId
    ? ChallengeStatus.settled
    : challenge.stake > 0
      ? ChallengeStatus.refunded
      : ChallengeStatus.voided;
  const terminalUpdate = await prisma.challenge.updateMany({
    where: { id: challengeId, status: ChallengeStatus.finalized },
    data: { status: finalStatus },
  });
  if (terminalUpdate.count > 0) {
    await cleanupChallengeFrameBlobs(challengeId);
  }

  return { ok: true, data: { challengeId, winnerId: j.winnerId, status: finalStatus } };
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
      status: { in: [...OPEN_FOR_OPPONENT_STATUSES] },
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
 * matchMe - find the best-fitting open public challenge and send the user to
 * the join contract. It must not auto-accept because the opponent has to read
 * and accept the rules, evidence standard, AI judging, dispute window, and
 * credit settlement terms before becoming a participant.
 */
async function matchMeTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  // Important: this only returns a join URL. Acceptance and escrow must happen
  // after the user reviews the challenge contract on /join/:id.
  const typeFilter = typeof args.type === "string" ? args.type : undefined;
  const maxStake = typeof args.maxStake === "number" ? args.maxStake : undefined;

  // Pick one — newest-first, not user's own, not full.
  const candidate = await prisma.challenge.findFirst({
    where: {
      status: { in: [...OPEN_FOR_OPPONENT_STATUSES] },
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
        message: "No open public challenges matched right now. Create your own - opponents will find it.",
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
      joinUrl: `${ctx.baseUrl}/join/${candidate.id}`,
      marketUrl: `${ctx.baseUrl}/challenge/${candidate.id}`,
      challengeUrl: `${ctx.baseUrl}/challenge/${candidate.id}`,
      message: "Review and accept the challenge rules before joining.",
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
    case "compileProtocol":     return compileProtocolTool(ctx, args);
    case "createChallengeFromProtocol":
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
