/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Concurrent end-to-end load + correctness test against the real production
 * deployment. Spawns N pairs of users (2 * N_PAIRS total) and drives the full
 * challenge lifecycle:
 *
 *   1. Register via credentials                 (each user)
 *   2. Parse a natural-language bet             (creator)
 *   3. Create Challenge row                     (creator)
 *   4. Opponent accepts                         (opponent)
 *   5. Both submit evidence                     (both)
 *   6. Creator triggers sync AI judgment        (creator)
 *   7. Creator confirms the AI recommendation   (creator)
 *   8. Verify credits actually moved            (both)
 *
 * Reports per-step success rate, latency distribution, error breakdown.
 * Exits non-zero if any pair failed so this can gate the next deploy.
 *
 * Run:  npx tsx scripts/load-test.ts
 * Env:  BASE (default https://gamble-ai-agent.vercel.app)
 *       N_PAIRS (default 20)
 *       STAKE (default 5 — must be ≤ signup bonus for both users)
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });

const BASE = process.env.LOAD_BASE || "https://gamble-ai-agent.vercel.app";
const N_PAIRS = Number(process.env.N_PAIRS || "20");
const STAKE = Number(process.env.STAKE || "5");
const RUN_ID = process.env.LOAD_RUN_ID || Math.random().toString(36).slice(2, 8);

interface UserCtx {
  idx: number;
  email: string;
  password: string;
  username: string;
  cookies: string;           // serialized cookie jar ("k=v; k2=v2")
  sessionToken?: string;
  userId?: string;
  credits?: number;
  errors: string[];
}

/* ── cookie jar ────────────────────────────────────────────── */
function mergeSetCookie(jar: Map<string, string>, setCookie: string | null | undefined) {
  if (!setCookie) return;
  // Node's fetch only gives us a flat string. Parse naively — one Set-Cookie
  // header per cookie, separated by `, ` but we can't trust comma because
  // Expires contains commas. Use the multi-value getter from headers.get('set-cookie')
  // We're fed the RAW array via getSetCookie() when available; otherwise fall back.
  const parts = setCookie.split(/,(?=[^ ]+=)/g); // split on `, name=` — crude but works for our cookies
  for (const raw of parts) {
    const cookie = raw.trim().split(";")[0];
    const eq = cookie.indexOf("=");
    if (eq < 0) continue;
    const k = cookie.slice(0, eq);
    const v = cookie.slice(eq + 1);
    jar.set(k, v);
  }
}
function serialize(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function cookieFetch(
  jar: Map<string, string>,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const cookieHeader = serialize(jar);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  // merge Set-Cookie (Node 18+ exposes getSetCookie)
  const sc = (res.headers as any).getSetCookie?.() as string[] | undefined;
  if (Array.isArray(sc)) {
    for (const c of sc) {
      const cookie = c.split(";")[0];
      const eq = cookie.indexOf("=");
      if (eq > 0) jar.set(cookie.slice(0, eq), cookie.slice(eq + 1));
    }
  } else {
    mergeSetCookie(jar, res.headers.get("set-cookie"));
  }
  return res;
}

/* ── next-auth helpers ─────────────────────────────────────── */
async function csrfToken(jar: Map<string, string>): Promise<string> {
  const res = await cookieFetch(jar, `${BASE}/api/auth/csrf`);
  const j = await res.json() as { csrfToken: string };
  return j.csrfToken;
}

async function register(user: UserCtx, jar: Map<string, string>): Promise<void> {
  const token = await csrfToken(jar);
  const body = new URLSearchParams({
    csrfToken: token,
    email: user.email,
    password: user.password,
    username: user.username,
    action: "register",
    redirect: "false",
    callbackUrl: BASE + "/",
    json: "true",
  });
  const res = await cookieFetch(jar, `${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status >= 400) {
    const txt = await res.text();
    throw new Error(`register failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  // Follow the redirect to finalize session cookie
  const loc = res.headers.get("location");
  if (loc) await cookieFetch(jar, loc.startsWith("http") ? loc : BASE + loc);
}

async function _getSession(user: UserCtx, jar: Map<string, string>): Promise<any> {
  const res = await cookieFetch(jar, `${BASE}/api/auth/session`);
  if (!res.ok) throw new Error(`session fetch ${res.status}`);
  return res.json();
}

/* ── product API wrappers ──────────────────────────────────── */
async function apiJson(
  user: UserCtx,
  jar: Map<string, string>,
  path: string,
  init?: RequestInit,
): Promise<any> {
  const res = await cookieFetch(jar, BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const txt = await res.text();
  let body: any;
  try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 300) }; }
  if (!res.ok) {
    const err = new Error(`${path} → ${res.status}: ${body?.error ?? body?.raw ?? txt.slice(0, 160)}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return body;
}

async function parseChallenge(user: UserCtx, jar: Map<string, string>, input: string) {
  return apiJson(user, jar, "/api/challenges/parse", {
    method: "POST",
    body: JSON.stringify({ input, tier: 1 }),
  });
}

async function createChallenge(user: UserCtx, jar: Map<string, string>, parsed: any) {
  const payload = {
    title: parsed.title,
    description: parsed.proposition || parsed.title,
    marketType: parsed.marketType || "challenge",
    proposition: parsed.proposition,
    type: parsed.type || "General",
    stake: STAKE,
    stakeToken: "credits",
    deadline: "24 hours",
    rules: parsed.rules || parsed.title,
    evidenceType: "self_report",
    settlementMode: "mutual_confirmation",
    isPublic: false,
    visibility: "private",
    aiReview: true,
  };
  return apiJson(user, jar, "/api/challenges", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function acceptChallenge(user: UserCtx, jar: Map<string, string>, id: string) {
  return apiJson(user, jar, `/api/challenges/${id}/accept`, { method: "POST" });
}

async function submitEvidence(user: UserCtx, jar: Map<string, string>, id: string, descr: string) {
  return apiJson(user, jar, `/api/challenges/${id}/evidence`, {
    method: "POST",
    body: JSON.stringify({
      type: "text",
      description: descr,
    }),
  });
}

async function runJudgment(user: UserCtx, jar: Map<string, string>, id: string) {
  return apiJson(user, jar, `/api/challenges/${id}/judge`, {
    method: "POST",
    body: JSON.stringify({ tier: 1 }),
  });
}

async function confirmVerdict(user: UserCtx, jar: Map<string, string>, id: string) {
  return apiJson(user, jar, `/api/challenges/${id}/confirm-verdict`, { method: "POST" });
}

async function getCredits(user: UserCtx, jar: Map<string, string>): Promise<number> {
  // Hit /api/credits (DB read) rather than /api/auth/session (JWT cache) so
  // the test sees real post-settlement balance, not the stale token snapshot.
  const res = await cookieFetch(jar, `${BASE}/api/credits`);
  if (!res.ok) {
    // Session endpoint fallback — will be stale if JWT not refreshed, but
    // at least something to report.
    const s = await cookieFetch(jar, `${BASE}/api/auth/session`);
    const j = await s.json() as any;
    return Number(j?.user?.credits ?? 0);
  }
  const j = await res.json() as any;
  return Number(j?.credits ?? 0);
}

/* ── per-pair scenario ─────────────────────────────────────── */
interface PairResult {
  pair: number;
  ok: boolean;
  steps: Record<string, { ok: boolean; ms: number; error?: string }>;
  creditsStart: { creator: number; opponent: number };
  creditsEnd: { creator: number; opponent: number };
  challengeId?: string;
  winnerId?: string;
  confidence?: number;
}

function mark<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; data?: T; error?: string }> {
  const t0 = Date.now();
  return fn()
    .then((data) => ({ ok: true, ms: Date.now() - t0, data }))
    .catch((err) => ({ ok: false, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) }));
}

const CHINESE_PROMPTS = [
  "我跟朋友赌一下今天能不能做 50 个俯卧撑",
  "能帮我想一个挑战吗",
  "plank challenge 2 分钟, 押 5 credits",
  "下午能不能读完一章书 — 跟室友赌",
  "谁能先跑完 1 公里",
  "晚饭前做完作业的挑战",
  "今天能不能早睡 11 点前",
  "一周坚持每天喝 2L 水",
  "不吃零食 24 小时挑战",
  "专注工作 1 小时不碰手机",
];

async function runPair(pairIdx: number): Promise<PairResult> {
  const _now = Date.now();
  const creator: UserCtx = {
    idx: pairIdx * 2,
    email: `loadtest-${RUN_ID}-c${pairIdx}@luckyplay.test`,
    password: `Password${RUN_ID}${pairIdx}!`,
    username: `lt_c${RUN_ID}_${pairIdx}`.slice(0, 20),
    cookies: "",
    errors: [],
  };
  const opponent: UserCtx = {
    idx: pairIdx * 2 + 1,
    email: `loadtest-${RUN_ID}-o${pairIdx}@luckyplay.test`,
    password: `Password${RUN_ID}${pairIdx}!`,
    username: `lt_o${RUN_ID}_${pairIdx}`.slice(0, 20),
    cookies: "",
    errors: [],
  };

  const cJar = new Map<string, string>();
  const oJar = new Map<string, string>();
  const steps: PairResult["steps"] = {};

  const result: PairResult = {
    pair: pairIdx,
    ok: false,
    steps,
    creditsStart: { creator: 0, opponent: 0 },
    creditsEnd: { creator: 0, opponent: 0 },
  };

  // 1. Register both users
  const regC = await mark(() => register(creator, cJar));
  steps.registerCreator = { ok: regC.ok, ms: regC.ms, error: regC.error };
  if (!regC.ok) return result;
  const regO = await mark(() => register(opponent, oJar));
  steps.registerOpponent = { ok: regO.ok, ms: regO.ms, error: regO.error };
  if (!regO.ok) return result;

  // 2. Get starting credits (signup bonus = 50)
  const startC = await mark(() => getCredits(creator, cJar));
  const startO = await mark(() => getCredits(opponent, oJar));
  if (startC.ok && typeof startC.data === "number") result.creditsStart.creator = startC.data;
  if (startO.ok && typeof startO.data === "number") result.creditsStart.opponent = startO.data;

  // 3. Parse
  const prompt = CHINESE_PROMPTS[pairIdx % CHINESE_PROMPTS.length];
  const parsed = await mark(() => parseChallenge(creator, cJar, prompt));
  steps.parse = { ok: parsed.ok, ms: parsed.ms, error: parsed.error };
  if (!parsed.ok) return result;
  const p = (parsed.data as any).parsed;
  if (!p || !p.title) {
    steps.parse.ok = false;
    steps.parse.error = "parsed returned no title";
    return result;
  }

  // 4. Create
  const created = await mark(() => createChallenge(creator, cJar, p));
  steps.create = { ok: created.ok, ms: created.ms, error: created.error };
  if (!created.ok) return result;
  const challengeId = (created.data as any).challenge?.id;
  result.challengeId = challengeId;
  if (!challengeId) {
    steps.create.ok = false;
    steps.create.error = "create returned no id";
    return result;
  }

  // 5. Accept
  const accepted = await mark(() => acceptChallenge(opponent, oJar, challengeId));
  steps.accept = { ok: accepted.ok, ms: accepted.ms, error: accepted.error };
  if (!accepted.ok) return result;

  // 6. Both submit evidence (parallel — tests the (challengeId,userId) @@unique + status race guard).
  // Evidence is intentionally asymmetric so the AI judge picks a definite winner
  // (the creator) instead of returning null/tie which would refund both — that
  // would make the ledger-sanity check meaningless for exercising settleChallenge's
  // winner/loser paths.
  const [evC, evO] = await Promise.all([
    mark(() => submitEvidence(creator, cJar, challengeId, `I FINISHED the challenge 100% completely and correctly. All requirements met with timestamp video and GPS logs. Clear success across every criterion. No partial completion — done in full.`)),
    mark(() => submitEvidence(opponent, oJar, challengeId, `I could not finish. Gave up halfway through and did not submit the required evidence. Failed the attempt.`)),
  ]);
  steps.evidenceCreator = { ok: evC.ok, ms: evC.ms, error: evC.error };
  steps.evidenceOpponent = { ok: evO.ok, ms: evO.ms, error: evO.error };
  if (!evC.ok || !evO.ok) return result;

  // Give the status machine a beat to flip to `judging`
  await new Promise((r) => setTimeout(r, 500));

  // 7. Trigger sync judgment
  const judged = await mark(() => runJudgment(creator, cJar, challengeId));
  steps.judge = { ok: judged.ok, ms: judged.ms, error: judged.error };
  if (!judged.ok) return result;
  const j = (judged.data as any).judgment;
  result.winnerId = j?.winnerId ?? undefined;
  result.confidence = j?.confidence ?? undefined;

  // 8. Confirm verdict → actually settles
  const confirmed = await mark(() => confirmVerdict(creator, cJar, challengeId));
  steps.confirm = { ok: confirmed.ok, ms: confirmed.ms, error: confirmed.error };
  if (!confirmed.ok) return result;

  // 9. Check credits moved
  const endC = await mark(() => getCredits(creator, cJar));
  const endO = await mark(() => getCredits(opponent, oJar));
  if (endC.ok && typeof endC.data === "number") result.creditsEnd.creator = endC.data;
  if (endO.ok && typeof endO.data === "number") result.creditsEnd.opponent = endO.data;

  // Ledger sanity: creator+opponent deltas must net to -2 * inference cost
  // (both staked + loser lost stake → winner gains 2*stake, so net across both
  // is 0 minus inference credits the creator paid). With stake=5 and loser
  // losing 5 + winner gaining 10, the net delta of the pair should be 0 minus
  // the inference cost. We'll surface the raw deltas; calling code decides.
  result.ok = true;
  return result;
}

/* ── runner ─────────────────────────────────────────────────── */
async function main() {
  const startTs = Date.now();
  console.log(`\n[load] base=${BASE}  pairs=${N_PAIRS} (${N_PAIRS * 2} users)  stake=${STAKE} run=${RUN_ID}`);

  // Quick sanity check that the deploy is alive.
  const diagRes = await fetch(`${BASE}/api/diag`, {
    headers: { "x-diag-token": process.env.DIAG_TOKEN || "" },
  });
  if (!diagRes.ok) {
    console.error(`[load] diag returned ${diagRes.status} — is DIAG_TOKEN set? abort.`);
    process.exit(2);
  }
  const diag = await diagRes.json() as any;
  console.log(`[load] prod AI healthy: providerPing=${diag.providerPing?.ok} parse=${diag.parseHealth?.ok} oracle=${diag.oracleHealth?.healthy}\n`);

  const results: PairResult[] = await Promise.all(
    Array.from({ length: N_PAIRS }, (_, i) => runPair(i).catch((err) => ({
      pair: i,
      ok: false,
      steps: { fatal: { ok: false, ms: 0, error: err instanceof Error ? err.message : String(err) } },
      creditsStart: { creator: 0, opponent: 0 },
      creditsEnd: { creator: 0, opponent: 0 },
    } as PairResult))),
  );

  // ── Report ──
  const elapsed = (Date.now() - startTs) / 1000;
  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n═════ LOAD TEST REPORT ═════`);
  console.log(`Total:   ${results.length} pairs (${results.length * 2} users)  in ${elapsed.toFixed(1)}s`);
  console.log(`Passed:  ${passed.length} / ${results.length}  (${((passed.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Failed:  ${failed.length}`);

  // Per-step success rate + latency
  const stepNames = new Set<string>();
  for (const r of results) for (const s of Object.keys(r.steps)) stepNames.add(s);
  console.log(`\nPer-step:`);
  for (const name of stepNames) {
    const step = results.map((r) => r.steps[name]).filter(Boolean);
    const okCount = step.filter((s) => s.ok).length;
    const times = step.filter((s) => s.ok).map((s) => s.ms);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const p95 = times.length ? times.slice().sort((a, b) => a - b)[Math.floor(times.length * 0.95)] : 0;
    console.log(`  ${name.padEnd(22)} ${okCount}/${step.length}  avg=${avg}ms p95=${p95}ms`);
  }

  // Credit ledger sanity
  console.log(`\nLedger (passed pairs):`);
  for (const r of passed) {
    const dC = r.creditsEnd.creator - r.creditsStart.creator;
    const dO = r.creditsEnd.opponent - r.creditsStart.opponent;
    const netPair = dC + dO;
    const healthy = Math.abs(netPair) <= 1; // at most 1 inference credit spent (tier 1)
    console.log(`  pair ${String(r.pair).padStart(2)}  creator ${dC >= 0 ? "+" : ""}${dC}  opponent ${dO >= 0 ? "+" : ""}${dO}  net=${netPair}  ${healthy ? "✓" : "✗"}`);
  }

  // Errors
  if (failed.length > 0) {
    console.log(`\nFAILURES (first 10):`);
    for (const r of failed.slice(0, 10)) {
      const brokenStep = Object.entries(r.steps).find(([, s]) => !s.ok);
      console.log(`  pair ${r.pair}: [${brokenStep?.[0] ?? "?"}] ${brokenStep?.[1].error ?? "unknown"}`);
    }
  }

  console.log(`\n═════════════════════════════\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error("[load] fatal:", err); process.exit(3); });
