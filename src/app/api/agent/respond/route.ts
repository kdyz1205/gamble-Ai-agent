/**
 * POST /api/agent/respond
 *
 * The single endpoint the conversational home page talks to. Frontend sends:
 *
 *   {
 *     "message": "...",                        // user's new input
 *     "conversationHistory": [{role, content}] // previous turns
 *     "draftState": { ... }                    // hidden draft the UI kept across turns
 *   }
 *
 * We return the full AgentResponse (userVisibleReply + agentAction +
 * draftPatch + merged draftState + tool result if any). Frontend uses
 * `agentAction` to decide whether to render the DraftPanel card this turn
 * and whether to show a Publish button.
 *
 * Rate-limited per-user to keep the conversational loop from being abused
 * as a free OpenAI pipe.
 */
import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { runAgentTurn } from "@/lib/agent/orchestrator";
import { routeAgentTool } from "@/lib/agent/agent-graph";
import { executeAgentTool } from "@/lib/agent/tools";
import { emptyDraftState, type AgentMessage, type AgentToolName, type DraftState } from "@/lib/agent/types";
import { getDailyAiQuotaStatus, refundDailyAiQuota, spendDailyAiQuota, type DailyAiQuotaStatus } from "@/lib/daily-ai-quota";
import { getProviderById } from "@/lib/llm-providers";
import { parseProtocolSpecV2, protocolPreview } from "@/lib/protocol-spec-v2";
import { CompileRequestError, compileProtocolForUser } from "@/lib/protocol-compiler";
import { classifyAgentIntent, detectInputLanguage } from "@/lib/agent/intent-router";

export const runtime = "nodejs";
export const maxDuration = 60;

// Per-user sliding window rate limit. Each agent turn is ~1 OpenAI call
// (~$0.002), plus sometimes an extra tool call. 30/min is plenty for a
// real conversation and blocks obvious abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();
function rl(userId: string): { ok: boolean; retryInSec?: number } {
  const now = Date.now();
  const prior = hits.get(userId) ?? [];
  const fresh = prior.filter((t) => now - t < WINDOW_MS);
  if (fresh.length >= MAX_PER_WINDOW) {
    return { ok: false, retryInSec: Math.max(1, Math.ceil((WINDOW_MS - (now - fresh[0])) / 1000)) };
  }
  fresh.push(now);
  hits.set(userId, fresh);
  return { ok: true };
}

function sanitizeHistory(raw: unknown): AgentMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { role: string; content: string } =>
      !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
    .map((m): AgentMessage => ({
      role: m.role === "ai" || m.role === "assistant" ? "ai" : "user",
      content: String(m.content).slice(0, 2000), // cap each turn
    }))
    .slice(-30); // cap total turns
}

function sanitizeDraftState(raw: unknown): DraftState {
  const base = emptyDraftState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const protocol = parseProtocolSpecV2(r.protocol);
  const lastCompiler = r.lastCompilerResult && typeof r.lastCompilerResult === "object" && !Array.isArray(r.lastCompilerResult)
    ? r.lastCompilerResult as Record<string, unknown>
    : null;
  return {
    protocol,
    protocolPreview: protocol ? protocolPreview(protocol) : null,
    rawPrompt: typeof r.rawPrompt === "string" ? r.rawPrompt : protocol?.rawPrompt ?? null,
    readyToCompile: !!r.readyToCompile,
    missingProtocolFields: Array.isArray(r.missingProtocolFields) ? r.missingProtocolFields.filter((x): x is string => typeof x === "string") : [],
    lastCompilerResult: lastCompiler &&
      typeof lastCompiler.providerId === "string" &&
      typeof lastCompiler.model === "string"
      ? {
          providerId: lastCompiler.providerId,
          model: lastCompiler.model,
          protocolId: typeof lastCompiler.protocolId === "string" ? lastCompiler.protocolId : null,
        }
      : null,
    title:         typeof r.title === "string" ? r.title : null,
    proposition:   typeof r.proposition === "string" ? r.proposition : null,
    participants:  typeof r.participants === "string" ? r.participants : null,
    stake:         typeof r.stake === "number" ? r.stake : null,
    stakeType:     r.stakeType === "credits" || r.stakeType === "none" ? r.stakeType : null,
    evidenceType:  r.evidenceType === "video" || r.evidenceType === "photo" || r.evidenceType === "text" ? r.evidenceType : null,
    judgeRule:     typeof r.judgeRule === "string" ? r.judgeRule : null,
    timeWindow:    typeof r.timeWindow === "string" ? r.timeWindow : null,
    safetyNotes:   Array.isArray(r.safetyNotes) ? r.safetyNotes.filter((x): x is string => typeof x === "string") : [],
    readyToPublish: !!r.readyToPublish,
  };
}

function sanitizeLocationSnapshot(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lat = r.lat;
  const lng = r.lng;
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

function shouldDirectCompile(message: string, draftState: DraftState) {
  if (draftState.protocol) return false;
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (/\b(do not call|don't call|ask one|follow-up|follow up|join|accept|upload|submit|judge|verdict|match me|participant binding|liveness code|recording session|start recording|verify identity|verify evidence|evidenceid|evidence id)\b/i.test(text)) return false;
  if (/\b(evidence is ready|ready evidence|submitted evidence|upload evidence|submit evidence)\b/i.test(text)) return false;
  if (/(加入|接受|提交|证据|判定|匹配|有什么可以玩|找一个挑战)/.test(message)) return false;
  return /\b(challenge|bet|wager|compete|competition|contest|generate|random|give me)\b/i.test(text) ||
    /(挑战|赌|比赛|生成|随便|来一个|给我来|给我生成)/.test(message);
}

function shouldDirectPublish(message: string, draftState: DraftState) {
  if (!draftState.protocol || !draftState.readyToPublish) return false;
  if (!draftState.protocol.riskPolicy.allowed) return false;
  const text = message.trim().toLowerCase();
  if (!text) return false;
  return /\b(publish|create|launch|post|make it live|go live|confirm|use createchallengefromprotocol)\b/i.test(text) ||
    /(\u53d1\u5e03|\u521b\u5efa|\u5275\u5efa|\u4e0a\u7ebf|\u4e0a\u7dda|\u786e\u8ba4|\u78ba\u8a8d|\u5c31\u8fd9\u6837|\u5c31\u9019\u6a23|\u53d1\u51fa\u53bb|\u767c\u51fa\u53bb)/.test(message);
}

function summarizeProviderCall(metadata: unknown) {
  const raw = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  return {
    providerId: typeof raw.providerId === "string" ? raw.providerId : "",
    model: typeof raw.model === "string" ? raw.model : "",
    responseModel: typeof raw.responseModel === "string" ? raw.responseModel : null,
    usedApi: raw.usedApi === true,
    totalTokens: typeof raw.totalTokens === "number" ? raw.totalTokens : null,
    durationMs: typeof raw.durationMs === "number" ? raw.durationMs : null,
  };
}

function extractChallengeId(message: string) {
  return message.match(/\b(c[a-z0-9]{12,40})\b/i)?.[1] ?? null;
}

function directToolFromMessage(message: string, intentRoute: string): { toolName: AgentToolName; challengeId: string } | null {
  const challengeId = extractChallengeId(message);
  if (!challengeId) return null;

  const text = message.toLowerCase();
  if (/\b(confirm|finalize|settle credits|confirm verdict)\b|\u786e\u8ba4|\u7ed3\u7b97/.test(text)) {
    return { toolName: "confirmVerdict", challengeId };
  }
  if (
    intentRoute === "outcome_judge" ||
    /\b(run protocol judge|judge|verdict|who won|winner|rejudge)\b|\u5224\u5b9a|\u8c01\u8d62|\u91cd\u65b0\u5224/.test(text)
  ) {
    return { toolName: "runProtocolJudge", challengeId };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const limit = rl(user.userId);
  if (!limit.ok) {
    return Response.json(
      { error: `Slow down — too many agent turns. Try again in ${limit.retryInSec}s.` },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "message required" }, { status: 400 });

  const history = sanitizeHistory(body.conversationHistory);
  const draftState = sanitizeDraftState(body.draftState);
  const locationSnapshot = sanitizeLocationSnapshot(body.locationSnapshot);
  const providerId = typeof body.providerId === "string" && body.providerId.trim() ? body.providerId.trim() : null;
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
  if (providerId && !getProviderById(providerId)) {
    return Response.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
  }

  // Base URL for share links is taken from the incoming request so dev/staging
  // point at the right host.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL || "https://gamble-ai-agent.vercel.app");

  if (shouldDirectPublish(message, draftState)) {
    const result = await executeAgentTool(
      "createChallengeFromProtocol",
      {
        userId: user.userId,
        baseUrl,
        draftState,
        locationSnapshot,
        providerId,
        model,
      },
      {},
    );
    const draftPatch: Partial<DraftState> = result.ok ? { readyToPublish: false } : {};
    const nextDraftState: DraftState = result.ok ? { ...draftState, ...draftPatch } : draftState;
    const toolResult = result.ok ? result.data : undefined;
    return Response.json({
      userVisibleReply: result.ok
        ? "Published. Share the invite link with the opponent."
        : `I could not publish this challenge: ${result.error || "tool failed"}`,
      agentAction: "call_tool",
      draftPatch,
      toolName: "createChallengeFromProtocol",
      toolArgs: {},
      draftState: nextDraftState,
      toolResult,
      toolError: result.ok ? undefined : result.error,
      llmCall: {
        providerId: "deterministic",
        model: "agent-direct-publish",
        responseModel: null,
        usedApi: false,
        totalTokens: 0,
        durationMs: 0,
      },
      dailyQuota: await getDailyAiQuotaStatus(user.userId),
      agentGraph: routeAgentTool("createChallengeFromProtocol", {
        source: "/api/agent/respond/direct-publish",
        draftState: nextDraftState,
        toolOk: result.ok,
        toolError: result.ok ? null : result.error ?? "tool_failed",
        resultStatus: typeof toolResult === "object" && toolResult && "status" in toolResult
          ? String((toolResult as { status?: unknown }).status ?? "")
          : null,
      }),
    });
  }

  const intent = classifyAgentIntent(message, draftState);
  const directTool = directToolFromMessage(message, intent.route);
  if (directTool) {
    const result = await executeAgentTool(
      directTool.toolName,
      {
        userId: user.userId,
        baseUrl,
        draftState,
        locationSnapshot,
        providerId,
        model,
      },
      { challengeId: directTool.challengeId },
    );
    const toolResult = result.ok ? result.data : undefined;
    const resultStatus = toolResult && typeof toolResult === "object" && "status" in toolResult
      ? String((toolResult as { status?: unknown }).status ?? "")
      : null;
    return Response.json({
      userVisibleReply: result.ok
        ? directTool.toolName === "confirmVerdict"
          ? "Verdict confirmed through the settlement guardrail."
          : "Protocol judge finished. The backend result is attached."
        : `I could not run ${directTool.toolName}: ${result.error || "tool failed"}`,
      agentAction: "call_tool",
      draftPatch: {},
      toolName: directTool.toolName,
      toolArgs: { challengeId: directTool.challengeId },
      draftState,
      toolResult,
      toolError: result.ok ? undefined : result.error,
      llmCall: {
        providerId: "deterministic",
        model: "agent-direct-tool",
        responseModel: null,
        usedApi: false,
        totalTokens: 0,
        durationMs: 0,
      },
      dailyQuota: await getDailyAiQuotaStatus(user.userId),
      agentGraph: routeAgentTool(directTool.toolName, {
        source: "/api/agent/respond/direct-tool",
        draftState,
        toolOk: result.ok,
        toolError: result.ok ? null : result.error ?? "tool_failed",
        resultStatus,
      }),
    });
  }

  if (intent.directCompile || shouldDirectCompile(message, draftState)) {
    try {
      const compiled = await compileProtocolForUser({
        userId: user.userId,
        inputText: message,
        providerId: providerId ?? undefined,
        model: model ?? undefined,
        language: detectInputLanguage(message),
        context: {
          surface: "agent_chat",
          flow: "direct_protocol_compile",
          intent,
          locationSnapshot: locationSnapshot ?? undefined,
        },
        route: "/api/agent/respond/direct-compile",
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
        stake: 0,
        stakeType: "none",
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
      const nextDraftState: DraftState = {
        ...draftState,
        ...draftPatch,
        safetyNotes: [
          ...new Set([
            ...draftState.safetyNotes,
            ...compiled.protocol.riskPolicy.warnings,
          ]),
        ],
      };
      const blocked = !compiled.protocol.riskPolicy.allowed;
      const reply = blocked
        ? compiled.protocol.riskPolicy.safeAlternative
          ? `${compiled.protocol.riskPolicy.blockedReason || "This challenge is blocked by safety policy."} Safe alternative: ${compiled.protocol.riskPolicy.safeAlternative}`
          : compiled.protocol.riskPolicy.blockedReason || "This challenge is blocked by safety policy."
        : `I compiled this into a playable protocol: ${compiled.preview.title}. Review it, then publish when it looks right.`;
      return Response.json({
        userVisibleReply: reply,
        agentAction: blocked ? "refuse_or_redirect" : "show_draft",
        draftPatch,
        toolName: null,
        toolArgs: null,
        draftState: nextDraftState,
        llmCall: summarizeProviderCall(compiled.providerCall),
        dailyQuota: compiled.dailyQuota,
        agentGraph: compiled.agentGraph,
      });
    } catch (err) {
      const status = err instanceof CompileRequestError ? err.status : 500;
      console.error("[agent/respond] direct compile error:", err);
      return Response.json(
        { error: err instanceof Error ? err.message : "Agent protocol compile failed" },
        { status },
      );
    }
  }

  const quota = await spendDailyAiQuota(user.userId, "spec");
  if (!quota.ok) {
    return Response.json(
      { error: quota.error, dailyQuota: quota.status, retryAt: quota.retryAt },
      { status: 429 },
    );
  }
  let dailyQuotaStatus: DailyAiQuotaStatus = quota.status;

  try {
    const result = await runAgentTurn({
      userId: user.userId,
      baseUrl,
      message,
      history,
      draftState,
      locationSnapshot,
      providerId,
      model,
    });
    return Response.json({ ...result, dailyQuota: dailyQuotaStatus });
  } catch (err) {
    dailyQuotaStatus = await refundDailyAiQuota(user.userId, "spec").catch(() => dailyQuotaStatus);
    console.error("[agent/respond] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Agent turn failed", dailyQuota: dailyQuotaStatus },
      { status: 500 },
    );
  }
}
