import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import prisma from "./db";

export interface AiContext {
  userId?: string;
  challengeId?: string;
  requestId?: string;
  purpose: string;
  deadlineMs?: number;
}
interface RequestContext extends AiContext { counter: { calls: number }; expiresAt?: number }
export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
}
const requests = new AsyncLocalStorage<RequestContext>();
const responses = new AsyncLocalStorage<{ usage: AiUsage | null }>();
export const AI_RESERVATION_ACTION = "ai.call.reserved";
export const AI_RECEIPT_ACTION = "ai.call.completed";

export class AiBudgetError extends Error {
  constructor(public readonly reason: string) {
    super("AI usage limit reached. Please try again later.");
    this.name = "AiBudgetError";
  }
}

export function withAiContext<T>(context: AiContext, fn: () => T): T {
  const parent = requests.getStore();
  if (parent) return requests.run({ ...parent, ...context, userId: parent.userId ?? context.userId,
    requestId: parent.requestId, counter: parent.counter, expiresAt: parent.expiresAt }, fn);
  return requests.run({ ...context, requestId: context.requestId ?? randomUUID(), counter: { calls: 0 },
    expiresAt: Date.now() + (context.deadlineMs ?? 55_000) }, fn);
}

export function remainingAiTimeMs(fallback: number): number {
  const expiresAt = requests.getStore()?.expiresAt;
  const remaining = expiresAt === undefined ? fallback : Math.min(fallback, expiresAt - Date.now());
  if (remaining <= 0) throw new AiBudgetError("deadline");
  return remaining;
}

export function currentAiCallCount(): number {
  return requests.getStore()?.counter.calls ?? 0;
}

function limit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  // Invalid configuration must not silently remove a spending boundary.
  if (!Number.isSafeInteger(value) || value < 0) throw new AiBudgetError("invalid_configuration");
  return value;
}

function tokens(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Preserve provider-reported usage. Missing usage remains unknown, never zero. */
export function extractAiUsage(raw: unknown, provider: "openai" | "anthropic" | "google"): AiUsage {
  const data = (raw ?? {}) as Record<string, unknown>;
  const usage = ((provider === "google" ? data.usageMetadata : data.usage) ?? {}) as Record<string, unknown>;
  const inputTokens = tokens(provider === "openai" ? usage.prompt_tokens : provider === "google" ? usage.promptTokenCount : usage.input_tokens);
  const outputTokens = tokens(provider === "openai" ? usage.completion_tokens : provider === "google" ? usage.candidatesTokenCount : usage.output_tokens);
  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const cachedInputTokens = tokens(provider === "openai" ? details?.cached_tokens : provider === "google" ? usage.cachedContentTokenCount : usage.cache_read_input_tokens);
  const cacheCreation = provider === "anthropic" ? tokens(usage.cache_creation_input_tokens) ?? 0 : 0;
  const totalTokens = tokens(provider === "openai" ? usage.total_tokens : provider === "google" ? usage.totalTokenCount : undefined)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens + (provider === "anthropic" ? (cachedInputTokens ?? 0) + cacheCreation : 0) : null);
  return { inputTokens, outputTokens, cachedInputTokens, totalTokens };
}

export function recordAiResponse(raw: unknown, provider: "openai" | "anthropic" | "google"): void {
  const call = responses.getStore();
  if (call) call.usage = extractAiUsage(raw, provider);
}

/** Reserve before inference under a database-wide lock, across serverless instances. */
async function reserve(context: RequestContext, metadata: Record<string, unknown>): Promise<string> {
  if (process.env.AI_ENABLED === "false") throw new AiBudgetError("disabled");
  const requestLimit = limit("AI_REQUEST_CALL_LIMIT", 6);
  if (context.counter.calls >= requestLimit) throw new AiBudgetError("request");
  context.counter.calls += 1;
  const dailyGlobal = limit("AI_GLOBAL_DAILY_CALL_LIMIT", 1000);
  const dailyUser = limit("AI_USER_DAILY_CALL_LIMIT", 100);
  const minuteUser = limit("AI_USER_MINUTE_CALL_LIMIT", 20);
  const minuteGlobal = limit("AI_GLOBAL_MINUTE_CALL_LIMIT", 100);
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const minute = new Date(now.getTime() - 60_000);
  try {
    return await prisma.$transaction(async (tx) => {
      // One shared lock is deliberately short-lived; no network inference in this transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(729184031)`;
      const base = { action: AI_RESERVATION_ACTION, createdAt: { gte: day } };
      const globalDay = await tx.auditLog.count({ where: base });
      if (globalDay >= dailyGlobal) throw new AiBudgetError("global_day");
      const globalMinute = await tx.auditLog.count({ where: { action: AI_RESERVATION_ACTION, createdAt: { gte: minute } } });
      if (globalMinute >= minuteGlobal) throw new AiBudgetError("global_minute");
      if (context.userId) {
        const userDay = await tx.auditLog.count({ where: { ...base, actorUserId: context.userId } });
        if (userDay >= dailyUser) throw new AiBudgetError("user_day");
        const userMinute = await tx.auditLog.count({ where: { action: AI_RESERVATION_ACTION, actorUserId: context.userId, createdAt: { gte: minute } } });
        if (userMinute >= minuteUser) throw new AiBudgetError("user_minute");
      }
      const entry = await tx.auditLog.create({ data: {
        action: AI_RESERVATION_ACTION,
        actorUserId: context.userId,
        challengeId: context.challengeId,
        payload: JSON.stringify({ ...metadata, requestId: context.requestId, purpose: context.purpose, callIndex: context.counter.calls }),
      } });
      return entry.id;
    }, { timeout: 10_000 });
  } catch (error) {
    if (error instanceof AiBudgetError) throw error;
    // No database reservation means no paid upstream request.
    console.error("[ai-budget] reservation unavailable");
    throw new AiBudgetError("accounting_unavailable");
  }
}

export async function meteredAiCall<T>(metadata: {
  providerId: string;
  model: string;
  kind: string;
  maxOutputTokens: number;
}, fn: () => Promise<T>): Promise<T> {
  const context = requests.getStore() ?? { purpose: metadata.kind, requestId: randomUUID(), counter: { calls: 0 } };
  const reservationId = await reserve(context, metadata);
  const started = Date.now();
  const state = { usage: null as AiUsage | null };
  let outcome = "failed";
  let errorType: string | null = null;
  try {
    return await responses.run(state, async () => {
      const result = await fn();
      outcome = result instanceof Response && !result.ok ? "failed" : "succeeded";
      if (result instanceof Response && !result.ok) errorType = `HTTP${result.status}`;
      return result;
    });
  } catch (error) {
    errorType = error instanceof Error ? error.name : "UnknownError";
    throw error;
  } finally {
    const receipt = { reservationId, requestId: context.requestId, purpose: context.purpose, ...metadata,
      outcome, errorType, durationMs: Date.now() - started, usage: state.usage,
      // Supplier invoice costs cannot be inferred from app credit prices.
      billedUsd: null,
    };
    console.info("[ai-usage]", JSON.stringify(receipt));
    try {
      await prisma.auditLog.create({ data: { action: AI_RECEIPT_ACTION, actorUserId: context.userId,
        challengeId: context.challengeId, payload: JSON.stringify(receipt) } });
    } catch {
      // Keep the charged reservation and structured server log; never retry inference here.
      console.error("[ai-usage] receipt persistence failed", reservationId);
    }
  }
}
