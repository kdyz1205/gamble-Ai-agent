/**
 * Simulated provider-response contract over REAL local HTTP and PostgreSQL.
 * Exercises production helpers unchanged. This does not measure AI judgment accuracy.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { getProviderById } from "../src/lib/llm-providers";
import { executeAgentTool, type ToolContext } from "../src/lib/agent/tools";
import { emptyDraftState } from "../src/lib/agent/types";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";
import { recordVerdictDecision, VerdictDecision } from "../src/lib/verdict-review";
import { isOnChainEnabled, settleChallenge } from "../src/lib/credits";
import { AI_RECEIPT_ACTION, AI_RESERVATION_ACTION } from "../src/lib/ai-governance";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/summoner_verification",
    "Provider contract verification writes only to isolated local summoner_verification");
  assert(!isOnChainEnabled(), "on-chain mutations must be disabled");
  const runId = randomUUID().replaceAll("-", "");
  const fixtures: string[] = [];
  let passed = 0;
  const pass = (label: string) => { passed++; console.log(`PASS ${label}`); };
  let mode: "success" | "quota" | "invalid-confidence" | "invalid-winner" = "success";
  const requests: Array<{ mode: string; model: string }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { model: string };
    requests.push({ mode, model: body.model });
    response.setHeader("content-type", "application/json");
    if (mode === "quota") {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: { code: "simulated_quota_exhaustion" } }));
      return;
    }
    const verdict = {
      winner: mode === "invalid-winner" ? "outsider" : "A",
      confidence: mode === "invalid-confidence" ? 99 : 0.98,
      reasoning: "Simulated provider contract response: A supplied 56 and B supplied 55.",
    };
    // Allow all concurrent callers to reach the shared execution claim while one HTTP request is in flight.
    await new Promise((resolve) => setTimeout(resolve, 150));
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(verdict) } }],
      usage: { prompt_tokens: 29, completion_tokens: 11, total_tokens: 40 } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const provider = getProviderById("openai")!;
  const oldBase = provider.baseUrl;
  const oldKey = process.env.OPENAI_API_KEY;
  provider.baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.OPENAI_API_KEY = "simulated-local-provider-only";
  const context = (userId: string): ToolContext => ({ userId, baseUrl: "http://localhost:3000", requestId: randomUUID(), draftState: emptyDraftState() });
  const balances = (ids: string[]) => prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" }, select: { id: true, credits: true } });
  async function quest(label: string) {
    const creator = await prisma.user.create({ data: { username: `contract_${runId}_${label}_a`, email: `contract_${runId}_${label}_a@example.invalid`, credits: 200 } });
    const opponent = await prisma.user.create({ data: { username: `contract_${runId}_${label}_b`, email: `contract_${runId}_${label}_b@example.invalid`, credits: 200 } });
    const ctx = context(creator.id);
    ctx.draftState = { ...emptyDraftState(), title: "Compare arithmetic results", proposition: "Who correctly computes 7 multiplied by 8?",
      participants: "you + 1 invited friend", stake: 5, stakeType: "credits", evidenceType: "text", timeWindow: "24 hours", readyToPublish: true,
      judgeRule: "The participant whose submitted answer to 7 multiplied by 8 equals 56 wins. A wrong numerical answer loses; refund if neither is correct." };
    const created = await executeAgentTool("createChallenge", ctx);
    assert(created.ok, created.error);
    const challengeId = (created.data as { challengeId: string }).challengeId;
    fixtures.push(challengeId);
    const accepted = await executeAgentTool("acceptChallenge", context(opponent.id), { challengeId });
    assert(accepted.ok, accepted.error);
    for (const [userId, description] of [[creator.id, "My answer is 56."], [opponent.id, "My answer is 55."]]) {
      const uploaded = await executeAgentTool("uploadEvidence", context(userId), { challengeId, type: "text", description });
      assert(uploaded.ok, uploaded.error);
    }
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } })).status, "judging");
    return { challengeId, creatorId: creator.id, opponentId: opponent.id, ids: [creator.id, opponent.id] };
  }
  try {
    const success = await quest("success");
    const concurrent = await Promise.all(Array.from({ length: 8 }, () =>
      executeChallengeJudgment(success.challengeId, 1, { providerId: "openai", model: "gpt-4o-mini" })));
    assert.equal(concurrent.filter((result) => result.ok).length, 1);
    const result = concurrent.find((value) => value.ok)!;
    assert(result.ok);
    assert.equal(requests.length, 1);
    assert.equal(result.judgment.method, "ai");
    assert.equal(result.judgment.winnerId, success.creatorId);
    assert.equal(result.creditsUsed, 1);
    assert.equal(await prisma.judgment.count({ where: { challengeId: success.challengeId } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: success.challengeId, type: "ai_judge", amount: -1,
      idempotencyKey: { startsWith: `judge-fee:${success.challengeId}:` } } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: success.challengeId, action: AI_RESERVATION_ACTION } }), 1);
    const receipt = await prisma.auditLog.findFirstOrThrow({ where: { challengeId: success.challengeId, action: AI_RECEIPT_ACTION } });
    const metering = JSON.parse(receipt.payload!) as { outcome: string; usage: unknown };
    assert.equal(metering.outcome, "succeeded");
    assert.deepEqual(metering.usage, { inputTokens: 29, outputTokens: 11, cachedInputTokens: null, totalTokens: 40 });
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: success.challengeId } })).status, "disputed");
    assert.deepEqual((await balances(success.ids)).map((user) => user.credits).sort(), [194, 195]);
    pass("eight concurrent judgments yield one simulated HTTP response, marked fee, usage receipt and completed recommendation");

    assert.equal((await recordVerdictDecision({ challengeId: success.challengeId, userId: success.creatorId, decision: VerdictDecision.accepted })).settled, false);
    assert.equal((await recordVerdictDecision({ challengeId: success.challengeId, userId: success.opponentId, decision: VerdictDecision.accepted })).settled, true);
    const final = await balances(success.ids);
    assert.equal(final.find((user) => user.id === success.creatorId)!.credits, 204);
    assert.equal(final.find((user) => user.id === success.opponentId)!.credits, 195);
    const ledgerCount = await prisma.creditTx.count({ where: { challengeId: success.challengeId } });
    const settlementRetries = await Promise.all(Array.from({ length: 8 }, () =>
      settleChallenge(success.challengeId, success.creatorId, 5, success.ids.map((userId) => ({ userId })))));
    assert(settlementRetries.every((settlement) => settlement.success));
    assert.deepEqual(await balances(success.ids), final);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: success.challengeId } }), ledgerCount);
    assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `settlement:${success.challengeId}` } }), 1);
    const reuse = await executeChallengeJudgment(success.challengeId, 1);
    assert(!reuse.ok && "skipped" in reuse && reuse.reason === "already_judged");
    assert.equal(requests.length, 1);
    console.log(JSON.stringify({ challengeId: success.challengeId, method: "ai", providerResponse: "simulated", balances: final, metering }));
    pass("mutual consent settles correct credits once and judgment/settlement retries are idempotent");

    for (const negativeMode of ["quota", "invalid-confidence", "invalid-winner"] as const) {
      mode = negativeMode;
      const failure = await quest(negativeMode);
      const before: number = requests.length;
      const failed = await executeChallengeJudgment(failure.challengeId, 1, { providerId: "openai", model: "gpt-4o-mini" });
      assert(!failed.ok && "status" in failed && failed.status === 502, JSON.stringify(failed));
      assert.equal(requests.length - before, 1, "unusable provider response must not trigger unnecessary model retries");
      assert.equal(await prisma.judgment.count({ where: { challengeId: failure.challengeId } }), 0);
      assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: failure.challengeId } })).status, "judging");
      assert((await balances(failure.ids)).every((user) => user.credits === 195));
      const charge = await prisma.creditTx.findFirstOrThrow({ where: { challengeId: failure.challengeId, type: "ai_judge" } });
      assert.equal(charge.amount, -1);
      assert(charge.idempotencyKey?.startsWith(`judge-fee:${failure.challengeId}:`));
      assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `refund:${charge.idempotencyKey}`, type: "refund", amount: 1 } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { challengeId: failure.challengeId, action: AI_RESERVATION_ACTION } }), 1);
      const failedReceipt = await prisma.auditLog.findFirstOrThrow({ where: { challengeId: failure.challengeId, action: AI_RECEIPT_ACTION } });
      const usage = JSON.parse(failedReceipt.payload!) as { outcome: string };
      assert.equal(usage.outcome, negativeMode === "quota" ? "failed" : "succeeded");
      pass(`${negativeMode}: unusable simulated response saves no judgment, refunds one marked fee and preserves both stakes`);
    }
    console.log(JSON.stringify({ runId, passed, fixtures, localHttpCalls: requests.length,
      responseSource: "simulated local HTTP provider", aiAccuracyVerified: false, paidProviderCalls: 0, retained: true }));
  } finally {
    provider.baseUrl = oldBase;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
