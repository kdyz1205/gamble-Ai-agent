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

export const runtime = "nodejs";
export const maxDuration = 30;

function resolveOracleFromEnv() {
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const providerId =
    envProvider && getProviderById(envProvider) ? envProvider : DEFAULT_LLM_PROVIDER_ID;
  const def = getProviderById(providerId);
  return { providerId, model: def?.defaultModel ?? "", kind: def?.kind ?? "?" };
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-diag-token");
  const envToken = process.env.DIAG_TOKEN;
  const user = await getAuthUser();
  const authorized =
    (envToken && token && token === envToken) || Boolean(user);
  if (!authorized) {
    return Response.json({ error: "diag requires auth or x-diag-token" }, { status: 401 });
  }

  const { providerId, model, kind } = resolveOracleFromEnv();
  const def = getProviderById(providerId);
  const envKey = def ? process.env[def.envVar] : undefined;
  const keyLen = envKey?.length ?? 0;

  const envSnapshot = {
    ORACLE_DEFAULT_PROVIDER: process.env.ORACLE_DEFAULT_PROVIDER || null,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || null,
    hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    openAiKeyLen: (process.env.OPENAI_API_KEY ?? "").length,
    openAiKeyPrefix: (process.env.OPENAI_API_KEY ?? "").slice(0, 8),
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

  // Step 2: real parseChallenge on a standard test prompt — end-to-end
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

  return Response.json({
    status: "ok",
    resolved: { providerId, model, kind, keyLen },
    env: envSnapshot,
    providerPing,
    parseHealth,
    note: "If parseHealth.looksLikeFallback is true, AI was not reached. If providerPing.ok === false, check the error message — most likely an expired API key.",
  });
}
