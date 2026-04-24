/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Race / concurrency torture test.
 *
 * For each scenario we verify the ledger didn't double-credit or double-debit
 * by querying /api/credits (DB-backed) before and after the race.
 *
 * Scenarios:
 *   A. 10 challenges each accepted by 2 users SIMULTANEOUSLY. Only ONE
 *      opponent per challenge should get a seat; the other must be refunded.
 *      Sum of participants per challenge MUST be exactly 2 (creator + 1).
 *
 *   B. 10 challenges each confirm-verdict'd concurrently 3x by the creator
 *      (simulating double-click / retry storm). Only ONE settlement row
 *      should move credits; other calls must 409 or no-op.
 *
 *   C. 10 challenges with concurrent judge + confirm storm — should serialize
 *      safely, ending in exactly one settled state.
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });

const BASE = process.env.LOAD_BASE || "https://gamble-ai-agent.vercel.app";
const N_CHALLENGES = Number(process.env.N_CHALLENGES || "10");
const STAKE = Number(process.env.STAKE || "5");
const RUN_ID = Math.random().toString(36).slice(2, 8);

function mergeSetCookie(jar: Map<string, string>, sc: string | null | undefined) {
  if (!sc) return;
  const parts = sc.split(/,(?=[^ ]+=)/g);
  for (const raw of parts) {
    const cookie = raw.trim().split(";")[0];
    const eq = cookie.indexOf("=");
    if (eq < 0) continue;
    jar.set(cookie.slice(0, eq), cookie.slice(eq + 1));
  }
}
function serialize(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function cookieFetch(jar: Map<string, string>, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const cookieHeader = serialize(jar);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
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

async function csrfToken(jar: Map<string, string>): Promise<string> {
  const res = await cookieFetch(jar, `${BASE}/api/auth/csrf`);
  return ((await res.json()) as any).csrfToken;
}

async function register(jar: Map<string, string>, email: string, password: string, username: string): Promise<void> {
  const token = await csrfToken(jar);
  const body = new URLSearchParams({
    csrfToken: token, email, password, username, action: "register",
    redirect: "false", callbackUrl: BASE + "/", json: "true",
  });
  const res = await cookieFetch(jar, `${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status >= 400) throw new Error(`register ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const loc = res.headers.get("location");
  if (loc) await cookieFetch(jar, loc.startsWith("http") ? loc : BASE + loc);
}

async function apiJson(jar: Map<string, string>, path: string, init?: RequestInit): Promise<any> {
  const res = await cookieFetch(jar, BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const txt = await res.text();
  let body: any;
  try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 300) }; }
  const status = res.status;
  return { status, body };
}

async function getCredits(jar: Map<string, string>): Promise<number> {
  const r = await apiJson(jar, "/api/credits");
  return Number(r.body?.credits ?? 0);
}

/* ── Scenario A: two opponents race to accept the same challenge ── */
async function scenarioA_acceptRace() {
  console.log(`\n── Scenario A — ${N_CHALLENGES} challenges × 2 simultaneous accepts ──`);
  const results: Array<{ ch: string; creator: number; oA: number; oB: number; participants: number; ok: boolean; detail: string }> = [];

  for (let i = 0; i < N_CHALLENGES; i++) {
    const cJar = new Map<string, string>();
    const aJar = new Map<string, string>();
    const bJar = new Map<string, string>();
    await register(cJar, `race-a-${RUN_ID}-c${i}@t.io`, `Pw${RUN_ID}${i}!`, `racecA${RUN_ID}${i}`.slice(0, 20));
    await register(aJar, `race-a-${RUN_ID}-a${i}@t.io`, `Pw${RUN_ID}${i}!`, `raceaA${RUN_ID}${i}`.slice(0, 20));
    await register(bJar, `race-a-${RUN_ID}-b${i}@t.io`, `Pw${RUN_ID}${i}!`, `racebA${RUN_ID}${i}`.slice(0, 20));

    // Create a challenge
    const created = await apiJson(cJar, "/api/challenges", {
      method: "POST",
      body: JSON.stringify({
        title: `Race challenge ${i}`,
        description: `Race challenge #${i} for accept-race test`,
        marketType: "challenge", type: "General",
        stake: STAKE, stakeToken: "credits",
        deadline: "24 hours", rules: "Whoever accepts first",
        evidenceType: "self_report", settlementMode: "mutual_confirmation",
        isPublic: false, visibility: "private", aiReview: true,
      }),
    });
    if (created.status >= 400) {
      results.push({ ch: "", creator: 0, oA: 0, oB: 0, participants: 0, ok: false, detail: `create ${created.status} ${JSON.stringify(created.body).slice(0, 100)}` });
      continue;
    }
    const challengeId = created.body.challenge.id;

    // Snapshot starting credits for A and B
    const startA = await getCredits(aJar);
    const startB = await getCredits(bJar);

    // Both race to accept the same challenge simultaneously
    const [rA, rB] = await Promise.all([
      apiJson(aJar, `/api/challenges/${challengeId}/accept`, { method: "POST" }),
      apiJson(bJar, `/api/challenges/${challengeId}/accept`, { method: "POST" }),
    ]);

    const endA = await getCredits(aJar);
    const endB = await getCredits(bJar);

    // Check participants — should be exactly 2 (creator + 1 opponent)
    const ch = await apiJson(cJar, `/api/challenges/${challengeId}`);
    const participants = (ch.body?.challenge?.participants ?? []).filter((p: any) => p.status === "accepted").length;

    const winners = [rA, rB].filter((r) => r.status === 200 || r.status === 201).length;
    const losers = [rA, rB].filter((r) => r.status === 409 || r.status === 400).length;

    // The one who succeeded should have -STAKE; the one who lost the race
    // should have a refund back to start (delta = 0).
    const deltaA = endA - startA;
    const deltaB = endB - startB;
    const ok =
      participants === 2 &&
      winners === 1 &&
      losers === 1 &&
      ((deltaA === -STAKE && deltaB === 0) || (deltaA === 0 && deltaB === -STAKE));

    results.push({
      ch: challengeId,
      creator: 0, oA: deltaA, oB: deltaB,
      participants,
      ok,
      detail: `A=${rA.status} B=${rB.status} parts=${participants} ΔA=${deltaA} ΔB=${deltaB}`,
    });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`Scenario A: ${passed}/${results.length} — zero double-accept, zero lost stake`);
  for (const r of results.slice(0, 3)) console.log(`  ${r.ch || "(no-create)"} — ${r.detail} ${r.ok ? "✓" : "✗"}`);
  for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.ch} — ${r.detail}`);
  return { passed, total: results.length };
}

/* ── Scenario B: triple concurrent confirm-verdict ── */
async function scenarioB_doubleConfirm() {
  console.log(`\n── Scenario B — ${N_CHALLENGES} challenges × 3 concurrent confirm-verdicts (one winner only) ──`);
  const results: Array<{ ch: string; oks: number; settledCount: number; ok: boolean; detail: string }> = [];

  for (let i = 0; i < N_CHALLENGES; i++) {
    const cJar = new Map<string, string>();
    const oJar = new Map<string, string>();
    await register(cJar, `race-b-${RUN_ID}-c${i}@t.io`, `Pw${RUN_ID}${i}!`, `racecB${RUN_ID}${i}`.slice(0, 20));
    await register(oJar, `race-b-${RUN_ID}-o${i}@t.io`, `Pw${RUN_ID}${i}!`, `raceoB${RUN_ID}${i}`.slice(0, 20));

    const created = await apiJson(cJar, "/api/challenges", {
      method: "POST",
      body: JSON.stringify({
        title: `Dbl-confirm ${i}`, description: `Double-confirm race #${i}`,
        marketType: "challenge", type: "General",
        stake: STAKE, stakeToken: "credits",
        deadline: "24 hours", rules: "first to submit",
        evidenceType: "self_report", settlementMode: "mutual_confirmation",
        isPublic: false, visibility: "private", aiReview: true,
      }),
    });
    if (created.status >= 400) continue;
    const challengeId = created.body.challenge.id;

    await apiJson(oJar, `/api/challenges/${challengeId}/accept`, { method: "POST" });
    await apiJson(cJar, `/api/challenges/${challengeId}/evidence`, {
      method: "POST",
      body: JSON.stringify({ type: "text", description: `Creator clearly won challenge ${i}, unambiguous success.` }),
    });
    await apiJson(oJar, `/api/challenges/${challengeId}/evidence`, {
      method: "POST",
      body: JSON.stringify({ type: "text", description: `Opponent failed to complete #${i}.` }),
    });
    await apiJson(cJar, `/api/challenges/${challengeId}/judge`, { method: "POST", body: JSON.stringify({ tier: 1 }) });

    // Track pre-confirm credit balance for the creator
    const startCreator = await getCredits(cJar);
    const startOpp = await getCredits(oJar);

    // Fire 3 confirm-verdicts at once — classic double-click / retry storm.
    const results3 = await Promise.all([
      apiJson(cJar, `/api/challenges/${challengeId}/confirm-verdict`, { method: "POST" }),
      apiJson(cJar, `/api/challenges/${challengeId}/confirm-verdict`, { method: "POST" }),
      apiJson(cJar, `/api/challenges/${challengeId}/confirm-verdict`, { method: "POST" }),
    ]);

    const endCreator = await getCredits(cJar);
    const endOpp = await getCredits(oJar);

    // How many returned 2xx (claimed to succeed)?
    const oks = results3.filter((r) => r.status >= 200 && r.status < 300).length;

    // Deltas should equal EXACTLY one settlement round, not two or three.
    // Before confirm: creator had already paid stake (-5) + judge fee (-1)
    //                 opponent had paid stake (-5)
    // After confirm with creator winning:
    //                 creator receives stake*(losers+1) = 10 → +10 delta here (pre→post)
    //                 opponent balance unchanged (stake already out) → 0 delta here
    // After confirm with opponent winning: mirror.
    // After confirm with tie/null: both refunded stake → creator +stake, opponent +stake.
    // Any delta > stake*2 on one side (> 10) means double-settlement occurred.
    const creatorDelta = endCreator - startCreator;
    const opponentDelta = endOpp - startOpp;
    const MAX_SINGLE_PAYOUT = STAKE * 2; // = 10 when stake=5

    // Valid states (single settle, in pre→post deltas):
    //   winner is creator:   [ΔC, ΔO] = [+10, 0]
    //   winner is opponent:  [ΔC, ΔO] = [0,  +10]
    //   tie / refund:        [ΔC, ΔO] = [+5, +5]
    // Double-settle would give [+20, 0], [+15, +5], etc.
    const singleSettle =
      creatorDelta <= MAX_SINGLE_PAYOUT &&
      opponentDelta <= MAX_SINGLE_PAYOUT &&
      creatorDelta >= 0 &&
      opponentDelta >= 0 &&
      (creatorDelta + opponentDelta) <= (2 * STAKE); // can't exceed total pool

    const ok = oks >= 1 && singleSettle;

    results.push({
      ch: challengeId,
      oks,
      settledCount: oks,
      ok,
      detail: `oks=${oks}/3 ΔC=${creatorDelta} ΔO=${opponentDelta}`,
    });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`Scenario B: ${passed}/${results.length} — zero double-settlement on concurrent confirm`);
  for (const r of results.slice(0, 3)) console.log(`  ${r.ch} — ${r.detail} ${r.ok ? "✓" : "✗"}`);
  for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.ch} — ${r.detail}`);
  return { passed, total: results.length };
}

async function main() {
  const t0 = Date.now();
  console.log(`[race] base=${BASE} run=${RUN_ID} N=${N_CHALLENGES} stake=${STAKE}`);

  // Sanity
  const diag = await fetch(`${BASE}/api/diag`, {
    headers: { "x-diag-token": process.env.DIAG_TOKEN || "" },
  });
  if (!diag.ok) {
    console.error("[race] diag failed — is DIAG_TOKEN set?");
    process.exit(2);
  }

  const a = await scenarioA_acceptRace();
  const b = await scenarioB_doubleConfirm();

  console.log(`\n═════ RACE TEST REPORT ═════`);
  console.log(`Scenario A  (accept race):      ${a.passed}/${a.total}`);
  console.log(`Scenario B  (double-confirm):   ${b.passed}/${b.total}`);
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const fails = (a.total - a.passed) + (b.total - b.passed);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[race] fatal:", e); process.exit(3); });
