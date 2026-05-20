import { NextRequest } from "next/server";
import { getAuthUser, unauthorized, type TierId } from "@/lib/auth";
import { getCredits } from "@/lib/credits";
import { generateClarifications, type ParsedChallenge } from "@/lib/ai-engine";
import { CompileRequestError, compileProtocolForUser } from "@/lib/protocol-compiler";
import { protocolToLegacyChallengeFields, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

const PARSE_WINDOW_MS = 60_000;
const PARSE_MAX_PER_WINDOW = 15;
const PARSE_MAX_PER_DAY = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const userHits = new Map<string, number[]>();

function hitRate(userId: string): { ok: boolean; retryInSec?: number; reason?: string } {
  const now = Date.now();
  const prior = userHits.get(userId) ?? [];
  const within24h = prior.filter((t) => now - t < DAY_MS);
  const withinMinute = within24h.filter((t) => now - t < PARSE_WINDOW_MS);
  if (withinMinute.length >= PARSE_MAX_PER_WINDOW) {
    const oldest = withinMinute[0];
    return {
      ok: false,
      retryInSec: Math.max(1, Math.ceil((PARSE_WINDOW_MS - (now - oldest)) / 1000)),
      reason: "minute",
    };
  }
  if (within24h.length >= PARSE_MAX_PER_DAY) {
    return { ok: false, reason: "day" };
  }
  within24h.push(now);
  userHits.set(userId, within24h);
  return { ok: true };
}

function marketTypeFor(protocol: ProtocolSpecV2): ParsedChallenge["marketType"] {
  if (protocol.participantMode === "head_to_head") return "head_to_head";
  if (protocol.outcomeType === "yes_no" || protocol.outcomeType === "prediction") return "yes_no";
  if (protocol.outcomeType === "threshold") return "threshold";
  return "challenge";
}

function protocolToParsedChallenge(protocol: ProtocolSpecV2): ParsedChallenge {
  const legacy = protocolToLegacyChallengeFields(protocol);
  const warnings = [
    ...protocol.riskPolicy.warnings,
    ...protocol.riskPolicy.restrictions,
    protocol.riskPolicy.blockedReason,
  ].filter(Boolean) as string[];
  const evidenceLabel = protocol.evidenceProtocol.mode.replace(/_/g, " ");

  return {
    title: protocol.title,
    type: legacy.type,
    suggestedStake: 0,
    evidenceType: protocol.evidenceProtocol.mode,
    rules: legacy.rules,
    deadline: protocol.timingProtocol.deadline,
    isPublic: legacy.isPublic,
    intent: protocol.riskPolicy.allowed ? "definite_market" : "candidate_market",
    marketType: marketTypeFor(protocol),
    proposition: protocol.userFacingSummary,
    subject: protocol.title,
    stakeOptions: [
      { amount: 0, label: "Free beta challenge", reasoning: "Default for beta testing until both users opt into credits." },
      { amount: 1, label: "1 credit", reasoning: "Small stake for proving the settlement path." },
    ],
    evidenceOptions: [
      {
        type: protocol.evidenceProtocol.mode,
        label: evidenceLabel,
        reasoning: protocol.evidenceProtocol.requiredEvidence.join(" "),
        required: true,
      },
    ],
    deadlineOptions: [
      {
        duration: protocol.timingProtocol.deadline,
        reasoning: protocol.timingProtocol.endCondition,
      },
    ],
    redFlags: warnings,
    recommendationSummary: protocol.riskPolicy.allowed
      ? protocol.userFacingSummary
      : protocol.riskPolicy.safeAlternative || protocol.riskPolicy.blockedReason || "Rewrite this challenge before publishing.",
    missingFields: [],
    clarifyingQuestion: protocol.riskPolicy.allowed
      ? undefined
      : "This idea is blocked or restricted. Do you want to use the safer alternative instead?",
    actionItems: protocol.riskPolicy.safeAlternative
      ? [{
          type: "reduce_scope",
          label: "Use safe alternative",
          reasoning: protocol.riskPolicy.safeAlternative,
          payload: { safeAlternative: protocol.riskPolicy.safeAlternative },
        }]
      : [],
  };
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const rl = hitRate(user.userId);
  if (!rl.ok) {
    const msg =
      rl.reason === "day"
        ? `Parse rate limit: you've hit ${PARSE_MAX_PER_DAY} parses today. Try again tomorrow.`
        : `Too many parse requests. Try again in ${rl.retryInSec}s.`;
    return Response.json({ error: msg }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const input = String(body.input || body.inputText || body.prompt || "").trim();
  if (!input) return Response.json({ error: "input string is required" }, { status: 400 });

  const tierId = ([1, 2, 3].includes(body.tier) ? body.tier : 1) as TierId;
  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : undefined;
  const model = typeof body.model === "string" ? body.model.trim() : undefined;
  const language = body.language === "en" || body.language === "zh" || body.language === "auto" ? body.language : "auto";
  const priorDraft = body.priorDraft && typeof body.priorDraft === "object" && typeof body.priorDraft.title === "string"
    ? body.priorDraft as Pick<ParsedChallenge, "title" | "proposition" | "type" | "evidenceType" | "deadline">
    : null;

  try {
    const balance = await getCredits(user.userId);
    const compiled = await compileProtocolForUser({
      userId: user.userId,
      inputText: input,
      providerId,
      model,
      language,
      tierId,
      context: {
        surface: "legacy_parse",
        flow: "protocol_backed_parse",
        priorDraft,
      },
      route: "/api/challenges/parse",
    });
    const parsed = protocolToParsedChallenge(compiled.protocol);
    const clarifications = generateClarifications(parsed);

    return Response.json({
      parsed,
      protocol: compiled.protocol,
      preview: compiled.preview,
      source: compiled.source,
      providerId: compiled.providerId,
      providerCall: compiled.providerCall,
      clarifications,
      model: compiled.model,
      tierId,
      creditsUsed: 0,
      creditsRemaining: balance,
      dailyQuota: compiled.dailyQuota,
      txHash: null,
      freeMode: true,
    });
  } catch (err) {
    const status = err instanceof CompileRequestError ? err.status : 502;
    console.error("Parse error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to parse challenge", source: "error" },
      { status },
    );
  }
}
