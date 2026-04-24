/**
 * Production diagnostic endpoint — auth-gated but cheap. Reveals whether:
 *  - ORACLE_DEFAULT_PROVIDER is set + which provider resolveOracle will pick
 *  - The provider's API key is present (bool only, no value)
 *  - An actual OpenAI ping (tiny prompt) succeeds from inside the lambda
 *  - A real test parseChallenge call returns a rich draft (stakeOptions > 0)
 *
 * Secured via header `x-diag-token` matching env DIAG_TOKEN, or an
 * authenticated session — either works. Never returns secret values.
 */
import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getProviderById, DEFAULT_LLM_PROVIDER_ID } from "@/lib/llm-providers";
import { completeOraclePrompt } from "@/lib/llm-router";
import { parseChallenge } from "@/lib/ai-engine";
import prisma from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

function resolveOracleFromEnv() {
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const providerId =
    envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  return { providerId, model: def?.defaultModel ?? "", kind: def?.kind ?? "?" };
}

// Rate-limit diag itself so someone who steals the token (or a logged-in user
// using the e2e path) can't pile on OpenAI cost.
const DIAG_WINDOW_MS = 60_000;
const DIAG_MAX_PER_WINDOW = 10;
const diagHits = new Map<string, number[]>();
function diagRateLimit(key: string): boolean {
  const now = Date.now();
  const prior = diagHits.get(key) ?? [];
  const fresh = prior.filter((t) => now - t < DIAG_WINDOW_MS);
  if (fresh.length >= DIAG_MAX_PER_WINDOW) return false;
  fresh.push(now);
  diagHits.set(key, fresh);
  return true;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-diag-token");
  const envToken = process.env.DIAG_TOKEN;
  const user = await getAuthUser();

  // Token is the primary gate (ops pattern). A signed-in session alone is NOT
  // enough — otherwise any registered user could hammer parse/oracleHealth and
  // burn our OpenAI budget. The `?e2e=publish` mode additionally requires the
  // signed-in user because it needs a userId to own the test Challenge row.
  const tokenOk = Boolean(envToken && token && token === envToken);
  if (!tokenOk) {
    return Response.json(
      { error: "diag requires x-diag-token header matching DIAG_TOKEN env" },
      { status: 401 },
    );
  }

  const clientKey = req.headers.get("x-forwarded-for") || "anonymous";
  if (!diagRateLimit(clientKey)) {
    return Response.json(
      { error: "diag rate limit exceeded (10 req/min per IP)" },
      { status: 429 },
    );
  }

  const { providerId, model, kind } = resolveOracleFromEnv();
  const def = getProviderById(providerId);
  const envKey = def ? process.env[def.envVar] : undefined;
  const keyLen = envKey?.length ?? 0;

  // Audit note: we intentionally do NOT return any slice of actual key material.
  // Earlier revision returned `openAiKeyPrefix: key.slice(0, 8)` which leaked
  // the provider prefix (e.g. "sk-proj-") — by itself not enough to reconstruct
  // the key but enough to fingerprint it against logs, so we dropped it.
  // Extract JUST the database hostname (not credentials) so we can verify
  // which DB instance the running lambda is talking to. `prisma db push` from
  // a dev machine has to go to the same hostname or schema drifts silently —
  // that's exactly the bug the load test caught ("column Evidence.preparedFrames
  // does not exist").
  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbHost = (() => {
    try {
      return new URL(dbUrl).hostname || null;
    } catch { return null; }
  })();

  const envSnapshot = {
    ORACLE_DEFAULT_PROVIDER: process.env.ORACLE_DEFAULT_PROVIDER || null,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || null,
    hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    databaseHost: dbHost,
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    openAiKeyLen: (process.env.OPENAI_API_KEY ?? "").length,
  };

  // Step 1: minimal provider ping — 1 token, tells us if the key works
  let providerPing: Record<string, unknown> = { skipped: true };
  if (envKey) {
    const t0 = Date.now();
    try {
      const out = await completeOraclePrompt({
        providerId,
        model,
        system: "Reply with exactly the word PONG. No punctuation.",
        user: "ping",
        maxTokens: 5,
        temperature: 0,
      });
      providerPing = {
        ok: true,
        ms: Date.now() - t0,
        reply: out.slice(0, 50),
      };
    } catch (e) {
      providerPing = {
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message.slice(0, 300) : String(e),
      };
    }
  } else {
    providerPing = { skipped: true, reason: `env ${def?.envVar} is not set` };
  }

  // Step 2a: real parseChallenge on a pushup prompt — exercises core path
  let parseHealth: Record<string, unknown> = { skipped: true };
  if (envKey && providerPing.ok) {
    const t0 = Date.now();
    try {
      const p = await parseChallenge("I want to bet who can do more pushups in 60 seconds");
      parseHealth = {
        ok: true,
        ms: Date.now() - t0,
        title: p.title,
        type: p.type,
        intent: p.intent,
        stakeOptionsCount: p.stakeOptions?.length ?? 0,
        evidenceOptionsCount: p.evidenceOptions?.length ?? 0,
        deadlineOptionsCount: p.deadlineOptions?.length ?? 0,
        looksLikeFallback:
          p.rules?.includes("Standard") &&
          p.rules?.includes("AI reviewed") &&
          !p.stakeOptions,
        toolInvocations: p.toolInvocations ?? [],
      };
    } catch (e) {
      parseHealth = {
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 300) : String(e),
      };
    }
  }

  // Step 2b: parse a crypto prompt — exercises OpenAI tool-calling (CoinGecko).
  // Proves the agentic loop is alive end-to-end on prod. Skip if basic parse failed.
  let oracleHealth: Record<string, unknown> = { skipped: true };
  if (parseHealth.ok) {
    const t0 = Date.now();
    try {
      const p = await parseChallenge("I bet BTC will hit 100k USD by tomorrow");
      oracleHealth = {
        ok: true,
        ms: Date.now() - t0,
        title: p.title,
        toolInvocationsCount: p.toolInvocations?.length ?? 0,
        toolNames: (p.toolInvocations ?? []).map((t) => t.name),
        oraclesAttached: (p.oracles ?? []).map((o) => ({
          source: o.source,
          label: o.label,
          currentValue: o.currentValue,
        })),
        // A working agentic pass should have: toolInvocations.length > 0 AND
        // oracles.length > 0 with CoinGecko data.
        healthy:
          (p.toolInvocations?.length ?? 0) > 0 &&
          (p.oracles?.length ?? 0) > 0 &&
          (p.oracles ?? []).some((o) => o.source === "CoinGecko" && !!o.currentValue),
      };
    } catch (e) {
      oracleHealth = {
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 300) : String(e),
      };
    }
  }

  // Step 3: optional full-stack E2E if ?e2e=publish (requires BOTH the diag token
  // — already verified above — AND a signed-in session, because we need a userId
  // to own the transient Challenge row we create and then delete).
  let e2e: Record<string, unknown> | null = null;
  if (req.nextUrl.searchParams.get("e2e") === "publish" && user) {
    const trace: Array<{ step: string; ok: boolean; ms: number; detail?: unknown }> = [];
    let createdId: string | null = null;
    try {
      // (a) parse
      const t0 = Date.now();
      const parsed = await parseChallenge("I bet BTC will not exceed 100000 USD tomorrow");
      trace.push({
        step: "parse",
        ok: true,
        ms: Date.now() - t0,
        detail: {
          title: parsed.title,
          type: parsed.type,
          marketType: parsed.marketType,
          proposition: parsed.proposition,
          stakeOptions: parsed.stakeOptions?.length ?? 0,
          oracles: parsed.oracles ?? [],
          toolInvocations: parsed.toolInvocations ?? [],
        },
      });

      // (b) create Challenge row (same shape as POST /api/challenges does)
      const t1 = Date.now();
      const deadlineDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
      const row = await prisma.challenge.create({
        data: {
          creatorId: user.userId,
          title: parsed.title,
          description: parsed.proposition || parsed.title,
          type: parsed.type || "General",
          marketType: parsed.marketType || "challenge",
          proposition: parsed.proposition || null,
          stake: 0, // free mode for diag
          stakeToken: "credits",
          deadline: deadlineDate,
          rules: parsed.rules || parsed.title,
          evidenceType: parsed.evidenceType || "self_report",
          settlementMode: "mutual_confirmation",
          isPublic: false,
          visibility: "private",
          maxParticipants: 2,
          aiReview: true,
          status: "draft",
        },
      });
      createdId = row.id;
      trace.push({ step: "create", ok: true, ms: Date.now() - t1, detail: { id: row.id } });

      // (c) fetch by id — simulate what market/[id]/page.tsx does
      const t2 = Date.now();
      const refetch = await prisma.challenge.findUnique({
        where: { id: row.id },
        include: {
          creator: { select: { id: true, username: true } },
          participants: true,
          evidence: true,
          judgments: true,
        },
      });
      trace.push({
        step: "getById",
        ok: Boolean(refetch),
        ms: Date.now() - t2,
        detail: refetch
          ? { found: true, status: refetch.status, title: refetch.title }
          : { found: false },
      });

      // (d) cleanup — delete the diag row so it doesn't pollute /markets listings
      const t3 = Date.now();
      await prisma.challenge.delete({ where: { id: row.id } });
      trace.push({ step: "cleanup", ok: true, ms: Date.now() - t3 });

      e2e = { ok: true, trace };
    } catch (err) {
      trace.push({
        step: "error",
        ok: false,
        ms: 0,
        detail: err instanceof Error ? err.message.slice(0, 400) : String(err),
      });
      // Best-effort cleanup of any stray row
      if (createdId) {
        try { await prisma.challenge.delete({ where: { id: createdId } }); } catch { /* ignore */ }
      }
      e2e = { ok: false, trace };
    }
  } else if (req.nextUrl.searchParams.get("e2e") === "publish" && !user) {
    e2e = { ok: false, error: "e2e=publish requires a signed-in session (diag token alone isn't enough — we need a userId to own the test Challenge row)." };
  }

  return Response.json({
    status: "ok",
    resolved: { providerId, model, kind, keyLen },
    env: envSnapshot,
    providerPing,
    parseHealth,
    oracleHealth,
    e2e,
    note: "If parseHealth.looksLikeFallback is true, AI was not reached. If providerPing.ok === false, check the error message — most likely an expired API key. Add ?e2e=publish while signed-in to run full parse→create→fetch→cleanup trace.",
  });
}
