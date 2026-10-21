import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { request } from "@playwright/test";

async function main() {
  const base = process.env.TEST_BASE_URL ?? "http://localhost:3018";
  assert(["localhost", "127.0.0.1", "summoner.world"].includes(new URL(base).hostname)
    || /^stubborn-[a-z0-9]+-kdyz1205s-projects\.vercel\.app$/.test(new URL(base).hostname));
  const anon = await request.newContext({ baseURL: base });
  const actor = await request.newContext({ baseURL: base });
  const run = randomUUID().replaceAll("-", "");
  try {
    for (const route of ["/api/credits/topup", "/api/tokens/link-wallet"]) {
      assert.equal((await anon.post(route, { data: { usdcAmount: 1_000_000, txHash: "unverified-qa" } })).status(), 401);
    }
    const { csrfToken } = await (await actor.get("/api/auth/csrf")).json();
    const registered = await actor.post("/api/auth/callback/credentials", { form: {
      csrfToken, action: "register", email: `qa_credit_boundary_${run}@example.invalid`, username: `qa_credit_boundary_${run}`,
      password: randomUUID() + "Aa9!", callbackUrl: `${base}/summons`, json: "true",
    } });
    assert.equal(registered.status(), 200);
    const session = await (await actor.get("/api/auth/session")).json();
    assert.ok(session.user?.id);
    const before = await (await actor.get("/api/tokens")).json();
    const statuses: number[] = [];
    for (const data of [{ usdcAmount: 1_000_000, txHash: "unverified-qa" }, { usdcAmount: 1_000_000, txHash: "unverified-qa" }, { usdcAmount: "Infinity", txHash: "" }]) {
      const response = await actor.post("/api/credits/topup", { data });
      statuses.push(response.status()); assert.equal(response.status(), 503);
      assert.equal((await response.json()).configured, false);
    }
    assert.equal((await actor.post("/api/tokens/link-wallet", { data: { address: "0x0000000000000000000000000000000000000000" } })).status(), 503);
    const after = await (await actor.get("/api/tokens")).json();
    assert.deepEqual(after.offChain, before.offChain);
    assert.deepEqual(after.transactions, before.transactions);
    assert.equal(after.evmAddress, before.evmAddress);
    assert.equal(after.isOnChainEnabled, false);
    assert.equal(after.onChain, null);
    const receipt = { base, userId: session.user.id, forgedTopupStatuses: statuses, anonymousStatus: 401,
      walletStatus: 503, creditsBefore: before.offChain.credits, creditsAfter: after.offChain.credits,
      ledgerUnchanged: true, walletUnchanged: true, onChainEnabled: false, at: new Date().toISOString() };
    await mkdir("output", { recursive: true });
    await writeFile(process.env.CREDIT_BOUNDARY_RECEIPT ?? "output/internal-credit-boundary.json", JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally { await actor.dispose(); await anon.dispose(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
