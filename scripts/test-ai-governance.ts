import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { AiBudgetError, AI_RECEIPT_ACTION, AI_RESERVATION_ACTION, meteredAiCall, recordAiResponse, withAiContext } from "../src/lib/ai-governance";
import { addCredits, spendCredits, spendForInference } from "../src/lib/credits";

const limits = ["AI_ENABLED", "AI_REQUEST_CALL_LIMIT", "AI_GLOBAL_DAILY_CALL_LIMIT", "AI_USER_DAILY_CALL_LIMIT", "AI_USER_MINUTE_CALL_LIMIT", "AI_GLOBAL_MINUTE_CALL_LIMIT", "SERVER_PRIVATE_KEY"];
const saved = new Map(limits.map(name => [name, process.env[name]]));
const metadata = { providerId: "test-accounting", model: "no-external-inference", kind: "text", maxOutputTokens: 100 };
interface Receipt { requestId: string; purpose: string; outcome: string; errorType: string | null; usage: unknown }

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Only an explicit local test DATABASE_URL is allowed");
  const runId = randomUUID();
  const users: string[] = [];
  let executions = 0;
  const callback = async () => { executions += 1; return "ok"; };
  const call = (userId: string, suffix: string, fn = callback) => withAiContext({ userId, purpose: `test.governance.${suffix}`, requestId: `${runId}-${suffix}` }, () => meteredAiCall(metadata, fn));
  const snapshot = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { credits: true, totalCreditsBought: true, totalCreditsWon: true, totalCreditsLost: true } });
  const budgetError = (reason: string) => (error: unknown) => error instanceof AiBudgetError && error.reason === reason;
  try {
    process.env.AI_ENABLED = "true";
    process.env.AI_REQUEST_CALL_LIMIT = "20";
    process.env.AI_GLOBAL_DAILY_CALL_LIMIT = "1000000";
    process.env.AI_USER_DAILY_CALL_LIMIT = "3";
    process.env.AI_USER_MINUTE_CALL_LIMIT = "1000";
    process.env.AI_GLOBAL_MINUTE_CALL_LIMIT = "1000000";
    delete process.env.SERVER_PRIVATE_KEY;
    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({ data: { email: `governance-${runId}-${i}@example.invalid`, username: `governance-${runId}-${i}`, credits: 10 } });
      users.push(user.id);
    }
    const [one, two, creditUser] = users;
    const concurrent = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => call(one, `race-${i}`)));
    assert.equal(executions, 3);
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 3);
    const rejected = concurrent.filter(result => result.status === "rejected");
    assert.equal(rejected.length, 5);
    assert.ok(rejected.every(result => result.status === "rejected" && budgetError("user_day")(result.reason)));
    assert.equal(await prisma.auditLog.count({ where: { actorUserId: one, action: AI_RESERVATION_ACTION } }), 3);
    assert.equal(await prisma.auditLog.count({ where: { actorUserId: one, action: AI_RECEIPT_ACTION } }), 3, "Rejected reservations must not fabricate paid-call receipts");
    await call(two, "isolated-user");
    assert.equal(executions, 4, "One user's exhausted budget does not consume another user's allowance");
    console.log("PASS per-user DB limit: 8 concurrent requests => 3 callbacks, 3 reservations/receipts, 5 blocked; second user succeeds");

    process.env.AI_USER_DAILY_CALL_LIMIT = "1000";
    process.env.AI_REQUEST_CALL_LIMIT = "2";
    const beforeNested = executions;
    await withAiContext({ userId: one, purpose: "test.governance.outer", requestId: `${runId}-nested` }, async () => {
      await meteredAiCall(metadata, callback);
      await withAiContext({ userId: two, purpose: "test.governance.inner", requestId: "must-not-replace-parent" }, () => meteredAiCall(metadata, callback));
      await assert.rejects(() => withAiContext({ purpose: "test.governance.third" }, () => meteredAiCall(metadata, callback)), budgetError("request"));
    });
    assert.equal(executions - beforeNested, 2);
    const nested = await prisma.auditLog.findMany({ where: { actorUserId: one, action: AI_RECEIPT_ACTION, payload: { contains: `${runId}-nested` } } });
    assert.equal(nested.length, 2);
    assert.ok(nested.some(row => (JSON.parse(row.payload!) as Receipt).purpose === "test.governance.inner"));
    assert.equal(await prisma.auditLog.count({ where: { actorUserId: two, payload: { contains: "must-not-replace-parent" } } }), 0);
    console.log("PASS nested AI scopes share call counter, request ID, and authenticated actor");

    const providerFailure = new Error("accounting boundary failure");
    await assert.rejects(() => call(one, "provider-failure", async () => { throw providerFailure; }), error => error === providerFailure);
    await withAiContext({ userId: one, purpose: "test.governance.http-failure", requestId: `${runId}-http-failure` }, () => meteredAiCall(metadata, async () => new Response("unavailable", { status: 503 })));
    await call(one, "reported-usage", async () => {
      recordAiResponse({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }, "openai");
      return "reported";
    });
    const receipts = await prisma.auditLog.findMany({ where: { actorUserId: one, action: AI_RECEIPT_ACTION } });
    const receipt = (suffix: string) => JSON.parse(receipts.find(row => row.payload?.includes(`${runId}-${suffix}`))!.payload!) as Receipt;
    assert.equal(receipt("provider-failure").outcome, "failed");
    assert.equal(receipt("provider-failure").errorType, "Error");
    assert.equal(receipt("http-failure").outcome, "failed");
    assert.equal(receipt("http-failure").errorType, "HTTP503");
    assert.equal(receipt("nested").usage, null, "Missing provider usage is unknown, never zero");
    assert.deepEqual(receipt("reported-usage").usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: null });
    console.log("PASS thrown failures/HTTP failures retain receipts; missing usage stays null; reported usage persists");

    const beforeBlocked = executions;
    const beforeRows = await prisma.auditLog.count({ where: { actorUserId: { in: users } } });
    process.env.AI_ENABLED = "false";
    await assert.rejects(() => call(one, "disabled"), budgetError("disabled"));
    process.env.AI_ENABLED = "true";
    for (const name of limits.filter(name => name.endsWith("LIMIT"))) {
      const previous = process.env[name];
      for (const value of ["-1", "not-a-number", "1.5", "Infinity"]) {
        process.env[name] = value;
        await assert.rejects(() => call(one, `invalid-${name}-${value}`), budgetError("invalid_configuration"));
      }
      process.env[name] = previous;
    }
    assert.equal(executions, beforeBlocked);
    assert.equal(await prisma.auditLog.count({ where: { actorUserId: { in: users } } }), beforeRows);
    console.log("PASS kill switch and 20 invalid-limit cases fail closed before callback or reservation");

    const missingChallenge = `missing-${runId}`;
    const creditBefore = await snapshot(creditUser);
    const fkError = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
    const rollbackCases = [
      () => spendForInference(creditUser, 1, "parse", "test rollback", missingChallenge),
      () => spendCredits(creditUser, 4, "stake", "test rollback", missingChallenge),
      () => addCredits(creditUser, 5, "topup", "test rollback", missingChallenge),
      () => addCredits(creditUser, 5, "win", "test rollback", missingChallenge),
    ];
    for (const operation of rollbackCases) {
      await assert.rejects(operation, fkError);
      assert.deepEqual(await snapshot(creditUser), creditBefore);
      assert.equal(await prisma.creditTx.count({ where: { userId: creditUser } }), 0);
    }
    console.log("PASS spendForInference/spendCredits/addCredits rollback balances and totals when ledger FK fails");

    const spends = await Promise.all(Array.from({ length: 8 }, () => spendCredits(creditUser, 3, "stake", "test concurrent spend")));
    assert.equal(spends.filter(result => result.success).length, 3);
    assert.equal((await snapshot(creditUser)).credits, 1);
    const debitRows = await prisma.creditTx.findMany({ where: { userId: creditUser } });
    assert.equal(debitRows.length, 3);
    assert.deepEqual(debitRows.map(row => row.balanceAfter).sort((a, b) => a - b), [1, 4, 7]);
    assert.ok(debitRows.every(row => row.amount === -3));
    const inferred = await Promise.all(Array.from({ length: 5 }, () => spendForInference(creditUser, 1, "parse", "test concurrent inference debit")));
    assert.equal(inferred.filter(result => result.success).length, 1);
    assert.equal((await snapshot(creditUser)).credits, 0);
    await Promise.all([addCredits(creditUser, 5, "topup", "test concurrent topup"), addCredits(creditUser, 7, "topup", "test concurrent topup")]);
    const final = await snapshot(creditUser);
    assert.equal(final.credits, 12);
    assert.equal(final.totalCreditsBought, 12);
    const ledger = await prisma.creditTx.findMany({ where: { userId: creditUser } });
    assert.equal(ledger.length, 6);
    assert.equal(10 + ledger.reduce((sum, row) => sum + row.amount, 0), final.credits);
    assert.deepEqual(ledger.filter(row => row.type === "topup").map(row => row.balanceAfter).sort((a, b) => a - b), ledger.find(row => row.type === "topup" && row.amount === 5)!.balanceAfter === 5 ? [5, 12] : [7, 12]);
    console.log("PASS concurrent credit operations: 8 spends => 3 debits, 5 inference spends => 1 debit, 2 topups; ledger sum matches balance 12");
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    // The only deleted data belongs to the three users created by this run.
    if (users.length) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users } } });
      await prisma.creditTx.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
