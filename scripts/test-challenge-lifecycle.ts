/** Real local PostgreSQL product flow. --live additionally invokes a real provider (default OpenAI). */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import prisma from "../src/lib/db";
import { executeAgentTool, type ToolContext } from "../src/lib/agent/tools";
import { emptyDraftState, type DraftState } from "../src/lib/agent/types";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";
import { recordVerdictDecision, VerdictDecision } from "../src/lib/verdict-review";
import { isOnChainEnabled, settleChallenge } from "../src/lib/credits";
import { AI_RECEIPT_ACTION, AI_RESERVATION_ACTION } from "../src/lib/ai-governance";
import { getProviderById } from "../src/lib/llm-providers";

config({ path: ".env.local", quiet: true });
const runId = `lifecycle_${randomUUID().replaceAll("-", "")}`;
const fixtures: string[] = [];
let passed = 0;
function pass(name: string) { passed++; console.log(`PASS ${name}`); }

function context(userId: string, draftState: DraftState = emptyDraftState(), requestId = randomUUID()): ToolContext {
  return { userId, draftState, requestId, baseUrl: "http://localhost:3000" };
}

async function balances(ids: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" }, select: { id: true, credits: true } });
  return users;
}

async function createQuest(label: string, stake: number) {
  const creator = await prisma.user.create({ data: {
    email: `${runId}_${label}_a@example.invalid`, username: `${runId}_${label}_a`, credits: 200,
  } });
  const opponent = await prisma.user.create({ data: {
    email: `${runId}_${label}_b@example.invalid`, username: `${runId}_${label}_b`, credits: 200,
  } });
  const draft: DraftState = {
    ...emptyDraftState(), title: "Compare the arithmetic answers", proposition: "Who correctly computes 7 multiplied by 8?",
    participants: "you + 1 invited friend", stake, stakeType: stake > 0 ? "credits" : "none",
    evidenceType: "text", judgeRule: "The participant whose submitted answer to 7 multiplied by 8 equals 56 wins. A wrong numerical answer loses. If neither is correct, refund.",
    timeWindow: "24 hours", readyToPublish: true,
  };
  const ctx = context(creator.id, draft);
  const created = await executeAgentTool("createChallenge", ctx);
  assert.equal(created.ok, true, created.error);
  const challengeId = (created.data as { challengeId: string }).challengeId;
  fixtures.push(challengeId);
  const repeated = await executeAgentTool("createChallenge", ctx);
  assert.equal(repeated.ok, true, repeated.error);
  assert.equal((repeated.data as { challengeId: string }).challengeId, challengeId);
  assert.equal(await prisma.creditTx.count({ where: { challengeId, type: "stake" } }), stake > 0 ? 1 : 0);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).credits, 200 - stake);
  pass(`${label}: publish retry preserves one quest and one escrow debit`);
  return { challengeId, creator, opponent, ids: [creator.id, opponent.id] };
}

async function acceptQuest(quest: Awaited<ReturnType<typeof createQuest>>) {
  const accepted = await executeAgentTool("acceptChallenge", context(quest.opponent.id), { challengeId: quest.challengeId });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: quest.challengeId } })).status, "live");
  assert.equal(await prisma.participant.count({ where: { challengeId: quest.challengeId, status: "accepted" } }), 2);
  const prior = await balances(quest.ids);
  const repeated = await executeAgentTool("acceptChallenge", context(quest.opponent.id), { challengeId: quest.challengeId });
  assert.equal(repeated.ok, true, repeated.error);
  assert.equal((repeated.data as { reused: boolean }).reused, true);
  assert.equal(await prisma.creditTx.count({ where: { challengeId: quest.challengeId, userId: quest.opponent.id, type: "stake" } }),
    (await prisma.challenge.findUniqueOrThrow({ where: { id: quest.challengeId } })).stake > 0 ? 1 : 0);
  assert.deepEqual(await balances(quest.ids), prior);
  pass("acceptance records opponent and retry cannot debit twice");
}

async function assertNoInference(challengeId: string) {
  assert.equal(await prisma.auditLog.count({ where: { challengeId, action: AI_RESERVATION_ACTION } }), 0);
  assert.equal(await prisma.creditTx.count({ where: { challengeId, type: "ai_judge" } }), 0);
}

async function confirmAndVerify(quest: Awaited<ReturnType<typeof createQuest>>, winnerId: string | null, inferenceCost: number) {
  const { challengeId, creator, opponent, ids } = quest;
  const stake = (await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } })).stake;
  const beforeAcceptance = await balances(ids);
  const first = await recordVerdictDecision({ challengeId, userId: creator.id, decision: VerdictDecision.accepted });
  assert.equal(first.settled, false, "one participant must not settle the quest");
  assert.deepEqual(await balances(ids), beforeAcceptance);
  const confirmations = await Promise.allSettled([
    recordVerdictDecision({ challengeId, userId: opponent.id, decision: VerdictDecision.accepted }),
    recordVerdictDecision({ challengeId, userId: opponent.id, decision: VerdictDecision.accepted }),
  ]);
  assert(confirmations.some((result) => result.status === "fulfilled" && result.value.settled), "both acceptances must reach settlement");
  for (const result of confirmations) {
    if (result.status === "rejected") assert.equal((result.reason as { status?: number }).status, 409, "only an explicit concurrent finalization conflict is acceptable");
  }
  assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } })).status, "settled");
  const final = await balances(ids);
  for (const user of final) {
    const expected = 200 - stake - (user.id === creator.id ? inferenceCost : 0)
      + (winnerId === null ? stake : user.id === winnerId ? stake * 2 : 0);
    assert.equal(user.credits, expected, "final credit balance must reconcile escrow, inference and outcome");
  }
  const ledgerBeforeRetry = await prisma.creditTx.count({ where: { challengeId } });
  const retries = await Promise.all([
    recordVerdictDecision({ challengeId, userId: creator.id, decision: VerdictDecision.accepted }),
    recordVerdictDecision({ challengeId, userId: opponent.id, decision: VerdictDecision.accepted }),
    settleChallenge(challengeId, winnerId, stake, ids.map((userId) => ({ userId }))),
    settleChallenge(challengeId, winnerId, stake, ids.map((userId) => ({ userId }))),
  ]);
  assert(retries.every((result) => "settled" in result ? result.settled : result.success));
  assert.deepEqual(await balances(ids), final);
  assert.equal(await prisma.creditTx.count({ where: { challengeId } }), ledgerBeforeRetry);
  if (stake > 0) assert.equal(await prisma.creditTx.count({ where: { idempotencyKey: `settlement:${challengeId}` } }), 1);
  const ledger = await prisma.creditTx.findMany({ where: { challengeId }, select: { userId: true, type: true, amount: true, balanceAfter: true } });
  console.log(JSON.stringify({ challengeId, status: "settled", winnerId, balances: final, ledger }));
  pass("both consents settle exact amounts; parallel settlement retries produce no new ledger rows");
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname === "/summoner_verification",
    "This integration suite writes only to the explicitly isolated local summoner_verification database");
  assert.equal(isOnChainEnabled(), false, "on-chain mutations must be disabled during local verification");
  const live = process.argv.includes("--live");
  const liveProvider = getProviderById(process.env.TEST_LIFECYCLE_PROVIDER || "openai");
  assert(liveProvider, "unknown TEST_LIFECYCLE_PROVIDER");
  if (live) assert(process.env[liveProvider.envVar], `--live requires an actual ${liveProvider.envVar}`);
  const liveModel = process.env.TEST_LIFECYCLE_MODEL || liveProvider.defaultModel;

  for (const stake of [0, 5]) {
    const voidQuest = await createQuest(`void_${stake}`, stake);
    await acceptQuest(voidQuest);
    const beforeVoid = await balances(voidQuest.ids);
    const early = await executeChallengeJudgment(voidQuest.challengeId, 1, { allowLive: true });
    assert.equal(early.ok, false);
    assert("status" in early && early.status === 409);
    assert.deepEqual(await balances(voidQuest.ids), beforeVoid);
    await assertNoInference(voidQuest.challengeId);
    pass("no proof before deadline blocks judgment without credits or model requests");
    await prisma.challenge.update({ where: { id: voidQuest.challengeId }, data: { deadline: new Date(Date.now() - 60_000) } });
    const voidResult = await executeChallengeJudgment(voidQuest.challengeId, 1, { allowLive: true });
    assert.equal(voidResult.ok, true, JSON.stringify(voidResult));
    if (!voidResult.ok) throw new Error("No void result");
    assert.equal(voidResult.judgment.winnerId, null);
    assert.equal(voidResult.creditsUsed, 0);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: voidQuest.challengeId } })).status, "disputed");
    await assertNoInference(voidQuest.challengeId);
    await confirmAndVerify(voidQuest, null, 0);
  }

  const forfeitQuest = await createQuest("forfeit", 5);
  const beforeSolo = await balances(forfeitQuest.ids);
  const solo = await executeChallengeJudgment(forfeitQuest.challengeId, 1, { allowLive: true });
  assert.equal(solo.ok, false);
  assert.deepEqual(await balances(forfeitQuest.ids), beforeSolo);
  await assertNoInference(forfeitQuest.challengeId);
  pass("no opponent cannot trigger judgment, credit charges or provider calls");
  await acceptQuest(forfeitQuest);
  const proof = await executeAgentTool("uploadEvidence", context(forfeitQuest.creator.id), {
    challengeId: forfeitQuest.challengeId, type: "text", description: "My submitted answer is 56.",
  });
  assert.equal(proof.ok, true, proof.error);
  const beforeMissing = await balances(forfeitQuest.ids);
  const missing = await executeChallengeJudgment(forfeitQuest.challengeId, 1, { allowLive: true });
  assert.equal(missing.ok, false);
  assert("status" in missing && missing.status === 409);
  assert.deepEqual(await balances(forfeitQuest.ids), beforeMissing);
  await assertNoInference(forfeitQuest.challengeId);
  pass("one missing proof before deadline blocks paid judgment without state mutation");
  await prisma.challenge.update({ where: { id: forfeitQuest.challengeId }, data: { deadline: new Date(Date.now() - 60_000) } });
  const attempts = await Promise.all([
    executeChallengeJudgment(forfeitQuest.challengeId, 1, { allowLive: true }),
    executeChallengeJudgment(forfeitQuest.challengeId, 1, { allowLive: true }),
  ]);
  assert.equal(attempts.filter((result) => result.ok).length, 1);
  const forfeit = attempts.find((result) => result.ok)!;
  assert(forfeit.ok);
  assert.equal(forfeit.creditsUsed, 0, "deterministic forfeits cannot charge for unused AI");
  await assertNoInference(forfeitQuest.challengeId);
  assert.equal(forfeit.judgment.winnerId, forfeitQuest.creator.id);
  assert.equal(await prisma.judgment.count({ where: { challengeId: forfeitQuest.challengeId } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { challengeId: forfeitQuest.challengeId, action: AI_RESERVATION_ACTION } }), 0);
  pass("parallel deterministic judgment executes once and invokes no provider");
  await confirmAndVerify(forfeitQuest, forfeitQuest.creator.id, forfeit.creditsUsed);

  if (live) {
    const liveQuest = await createQuest("provider", 5);
    await acceptQuest(liveQuest);
    for (const [userId, description] of [[liveQuest.creator.id, "My final numerical answer to 7 multiplied by 8 is 56."],
      [liveQuest.opponent.id, "My final numerical answer to 7 multiplied by 8 is 55."]]) {
      const uploaded = await executeAgentTool("uploadEvidence", context(userId), { challengeId: liveQuest.challengeId, type: "text", description });
      assert.equal(uploaded.ok, true, uploaded.error);
    }
    const concurrent = await Promise.all([
      executeChallengeJudgment(liveQuest.challengeId, 1, { providerId: liveProvider.id, model: liveModel }),
      executeChallengeJudgment(liveQuest.challengeId, 1, { providerId: liveProvider.id, model: liveModel }),
    ]);
    if (process.argv.includes("--expect-provider-failure")) {
      assert.equal(concurrent.filter((result) => result.ok).length, 0, "an unavailable provider cannot produce a completed recommendation");
      assert.equal(concurrent.filter((result) => "status" in result && result.status === 502).length, 1);
      assert.equal(await prisma.judgment.count({ where: { challengeId: liveQuest.challengeId } }), 0);
      assert.equal(await prisma.creditTx.count({ where: { challengeId: liveQuest.challengeId, type: "ai_judge" } }), 1);
      assert.equal(await prisma.creditTx.count({ where: { challengeId: liveQuest.challengeId, type: "refund", amount: 1 } }), 1);
      assert((await balances(liveQuest.ids)).every((user) => user.credits === 195), "failed inference credit must be refunded and both stakes retained");
      assert.equal(await prisma.auditLog.count({ where: { challengeId: liveQuest.challengeId, action: AI_RESERVATION_ACTION } }), 1);
      const failedReceipt = await prisma.auditLog.findFirstOrThrow({ where: { challengeId: liveQuest.challengeId, action: AI_RECEIPT_ACTION } });
      assert.equal((JSON.parse(failedReceipt.payload!) as { outcome: string }).outcome, "failed");
      console.log(JSON.stringify({ challengeId: liveQuest.challengeId, concurrent, providerAvailable: false, balances: await balances(liveQuest.ids) }));
      pass("real provider failure yields no judgment, exactly one refunded inference charge and preserved stakes");
      console.log(JSON.stringify({ runId, passed, live, providerAvailable: false, fixtures, retained: true }));
      return;
    }
    assert.equal(concurrent.filter((result) => result.ok).length, 1, JSON.stringify(concurrent));
    const judged = concurrent.find((result) => result.ok)!;
    assert(judged.ok);
    assert.equal(judged.judgment.winnerId, liveQuest.creator.id);
    assert.equal(judged.creditsUsed, 1);
    assert.equal(await prisma.judgment.count({ where: { challengeId: liveQuest.challengeId } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: liveQuest.challengeId, type: "ai_judge" } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: liveQuest.challengeId, action: AI_RESERVATION_ACTION } }), 1);
    const receipt = await prisma.auditLog.findFirstOrThrow({ where: { challengeId: liveQuest.challengeId, action: AI_RECEIPT_ACTION } });
    const metering = JSON.parse(receipt.payload!) as { outcome: string; usage: { inputTokens: number; outputTokens: number } };
    assert.equal(metering.outcome, "succeeded");
    assert(metering.usage.inputTokens > 0 && metering.usage.outputTokens > 0);
    console.log(JSON.stringify({ challengeId: liveQuest.challengeId, judgment: judged.judgment, metering }));
    pass("concurrent real-provider judgment yields one model call, one app charge and one recommendation");
    await confirmAndVerify(liveQuest, liveQuest.creator.id, 1);
    const retry = await executeChallengeJudgment(liveQuest.challengeId, 1);
    assert(!retry.ok && "skipped" in retry && retry.reason === "already_judged");
    assert.equal(await prisma.auditLog.count({ where: { challengeId: liveQuest.challengeId, action: AI_RESERVATION_ACTION } }), 1);
    pass("post-settlement judge retry does not invoke or charge AI");
  } else {
    console.log("SKIP paid provider judgment: pass --live to exercise a real provider");
  }
  console.log(JSON.stringify({ runId, passed, live, fixtures, retained: true }));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
