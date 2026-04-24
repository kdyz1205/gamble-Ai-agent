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
import { emptyDraftState, type AgentMessage, type DraftState } from "@/lib/agent/types";

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
  return {
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

  // Base URL for share links is taken from the incoming request so dev/staging
  // point at the right host.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL || "https://gamble-ai-agent.vercel.app");

  try {
    const result = await runAgentTurn({
      userId: user.userId,
      baseUrl,
      message,
      history,
      draftState,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[agent/respond] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Agent turn failed" },
      { status: 500 },
    );
  }
}
