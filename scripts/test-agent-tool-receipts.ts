import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { withAiContext, AI_RESERVATION_ACTION, AI_RECEIPT_ACTION } from "../src/lib/ai-governance";
import { agentToolReceipt, runAgentTurn } from "../src/lib/agent/orchestrator";
import { normalizeDraftState } from "../src/lib/agent/draft-policy";
import { emptyDraftState, type AgentToolName, type DraftState, type RawAgentResponse } from "../src/lib/agent/types";

async function main() {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL ?? "postgresql://missing").hostname), "Explicit local test DATABASE_URL required");
  const envNames = ["ORACLE_DEFAULT_PROVIDER", "OPENAI_API_KEY", "AI_ENABLED", "AI_REQUEST_CALL_LIMIT", "AI_USER_DAILY_CALL_LIMIT", "AI_USER_MINUTE_CALL_LIMIT", "AI_GLOBAL_DAILY_CALL_LIMIT", "AI_GLOBAL_MINUTE_CALL_LIMIT", "SERVER_PRIVATE_KEY"];
  const saved = new Map(envNames.map(key => [key, process.env[key]]));
  const savedFetch = globalThis.fetch;
  const runId = randomUUID();
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  let providerCalls = 0;
  let turnIndex = 0;
  let response: RawAgentResponse;
  const draft = normalizeDraftState({ title: "Receipt badminton first to five", proposition: "The first player to five points wins", participants: "you + 1 invited friend", stake: 0, evidenceType: "video", judgeRule: "First player to 5 points. Both friends identify Participant A and B on camera. Submit one continuous full-court video; unclear points require review.", timeWindow: "24 hours" });
  try {
    process.env.ORACLE_DEFAULT_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "tool-receipt-boundary-test";
    process.env.AI_ENABLED = "true";
    process.env.AI_REQUEST_CALL_LIMIT = "1";
    for (const name of envNames.filter(name => name.endsWith("LIMIT") && name !== "AI_REQUEST_CALL_LIMIT")) process.env[name] = "1000000";
    delete process.env.SERVER_PRIVATE_KEY;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 }, choices: [{ message: { content: JSON.stringify(response) } }] }), { status: 200 });
    };
    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({ data: { username: `receipts-${runId}-${i}`, email: `receipts-${runId}-${i}@example.invalid`, credits: 20 } });
      userIds.push(user.id);
    }
    const [creator, opponent, searcher] = userIds;
    async function turn(name: AgentToolName, args: Record<string, unknown>, userId = creator, draftState: DraftState = draft, patch: Partial<DraftState> = {}) {
      const requestId = `${runId}-${++turnIndex}`;
      response = { userVisibleReply: "FABRICATED: all credits settled and ten opponents already joined!", agentAction: name === "settleCredits" ? "call_tool" : "ask_followup", toolName: name, toolArgs: args, draftPatch: patch };
      const before = providerCalls;
      const result = await withAiContext({ userId, requestId, purpose: "test.agent-tool-receipt" }, () => runAgentTurn({ userId, baseUrl: "https://example.invalid", requestId, message: `Execute reviewed operation ${name}`, history: [], draftState }));
      assert.equal(result.agentAction, "call_tool");
      assert.equal(providerCalls - before, 1, `${name} must not make another model call to narrate its result`);
      assert.doesNotMatch(result.userVisibleReply, /FABRICATED|ten opponents/);
      assert.equal(await prisma.auditLog.count({ where: { actorUserId: userId, action: AI_RESERVATION_ACTION, payload: { contains: requestId } } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { actorUserId: userId, action: AI_RECEIPT_ACTION, payload: { contains: requestId } } }), 1);
      return result;
    }
    const created = await turn("createChallenge", {});
    assert.equal(created.toolError, undefined);
    const challengeId = (created.toolResult as { challengeId: string }).challengeId;
    challengeIds.push(challengeId);
    assert.match(created.userVisibleReply, /Quest published\. Status: open/);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } })).status, "open");
    const shared = await turn("generateShareLink", { challengeId });
    assert.equal(shared.userVisibleReply, `Invite link: https://example.invalid/join/${challengeId}`);
    const accepted = await turn("acceptChallenge", { challengeId }, opponent);
    assert.match(accepted.userVisibleReply, /joined.*Status: live/);
    assert.equal(await prisma.participant.count({ where: { challengeId, status: "accepted" } }), 2);
    const evidence = await turn("uploadEvidence", { challengeId, type: "text", description: "This explicit fixture deliberately has no real video." });
    assert.equal(evidence.userVisibleReply, "Proof saved.");
    assert.equal(await prisma.evidence.count({ where: { challengeId, userId: creator } }), 1);
    await turn("uploadEvidence", { challengeId, type: "text", description: "No video proof: the rules guard must send this to review." }, opponent);
    const judged = await turn("runVisionJudge", { challengeId });
    assert.equal(judged.toolError, undefined);
    assert.match(judged.userVisibleReply, /Rule recommendation recorded; participant confirmation or review is still required/);
    assert.doesNotMatch(judged.userVisibleReply, /AI referee/);
    assert.doesNotMatch(judged.userVisibleReply, /settled/i);
    const persistedJudgment = await prisma.judgment.findFirstOrThrow({ where: { challengeId } });
    assert.equal(persistedJudgment.winnerId, null);
    assert.match(persistedJudgment.reasoning ?? "", /does not meet the agreed evidence requirements|shared, direct video/);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } })).status, "disputed");
    const review = await turn("confirmVerdict", { challengeId });
    assert.match(review.userVisibleReply, /review is pending/);
    assert.equal((review.toolResult as { settled: boolean }).settled, false);
    console.log("PASS real create/share/accept/proof/rules-judge/review tools replace fabricated replies; one provider reservation per turn");

    const verdictFixture = await prisma.challenge.create({ data: {
      creatorId: creator, title: "Explicit confirmation state fixture", type: "General", status: "disputed", stake: 0,
      participants: { create: [{ userId: creator, role: "creator", status: "accepted" }, { userId: opponent, role: "opponent", status: "accepted" }] },
      judgments: { create: { winnerId: creator, method: "rules", status: "completed", confidence: 1, reasoning: "Explicit DB fixture for consent-state testing; not an inferred sports result." } },
    } });
    challengeIds.push(verdictFixture.id);
    const waiting = await turn("confirmVerdict", { challengeId: verdictFixture.id });
    assert.match(waiting.userVisibleReply, /waiting for 1 participant to confirm/);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: verdictFixture.id } })).status, "disputed");
    const settled = await turn("confirmVerdict", { challengeId: verdictFixture.id }, opponent);
    assert.equal(settled.userVisibleReply, "Quest settled.");
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: verdictFixture.id } })).status, "settled");
    console.log("PASS confirmation distinguishes pending review, waiting for participant, and actual settled DB state");

    const type = `receipt-${runId}`;
    const publicFixture = await prisma.challenge.create({ data: { creatorId: creator, title: "Actual public fixture quest", type, status: "open", stake: 0, isPublic: true, participants: { create: { userId: creator, role: "creator", status: "accepted" } } } });
    challengeIds.push(publicFixture.id);
    const found = await turn("findOpenMarkets", { type }, searcher, emptyDraftState());
    assert.equal(found.userVisibleReply, "Found 1 open public quest: Actual public fixture quest");
    const empty = await turn("findOpenMarkets", { type: `${type}-none` }, searcher, emptyDraftState());
    assert.equal(empty.userVisibleReply, "No open public quests were returned.");
    const noMatch = await turn("matchMe", { type: `${type}-none` }, searcher, emptyDraftState());
    assert.equal(noMatch.userVisibleReply.trim(), "No quest was matched.");
    assert.equal((noMatch.toolResult as { matched: boolean }).matched, false);
    const matched = await turn("matchMe", { type }, searcher, emptyDraftState());
    assert.match(matched.userVisibleReply, /Matched and joined.*Actual public fixture quest/);
    assert.equal(await prisma.participant.count({ where: { challengeId: publicFixture.id, userId: searcher, status: "accepted" } }), 1);
    const expensive = await prisma.challenge.create({ data: { creatorId: creator, title: "Unaffordable public fixture quest", type, status: "open", stake: 999, isPublic: true, participants: { create: { userId: creator, role: "creator", status: "accepted" } } } });
    challengeIds.push(expensive.id);
    const rejectedMatch = await turn("matchMe", { type }, searcher, emptyDraftState());
    assert.equal((rejectedMatch.toolResult as { matched: boolean }).matched, false);
    assert.match(rejectedMatch.userVisibleReply, /No quest was matched.*Insufficient credits/);
    assert.equal(await prisma.participant.count({ where: { challengeId: expensive.id, userId: searcher } }), 0);
    const denied = await turn("generateShareLink", { challengeId }, searcher);
    assert.equal(denied.userVisibleReply, "Could not complete the action: Only the creator can share this link");
    const blocked = await turn("settleCredits", { challengeId });
    assert.equal(blocked.userVisibleReply, "Could not complete the action: settleCredits is only reachable via confirmVerdict (safety gate)");
    const insufficient = await turn("createChallenge", {}, creator, normalizeDraftState({ ...draft, stake: 999 }));
    assert.equal(insufficient.userVisibleReply, "Could not complete the action: Insufficient credits");
    assert.equal(await prisma.challenge.count({ where: { creatorId: creator } }), 4);
    console.log("PASS discovery uses actual count/titles; no-match stays unmatched; tool failures override fabricated success");

    const updated = await turn("updateDraft", { title: "Tool args must not replace the draft" }, creator, draft, { timeWindow: "48 hours" });
    assert.equal(updated.draftState.title, draft.title);
    assert.equal(updated.draftState.timeWindow, "48 hours");
    assert.deepEqual(updated.draftPatch, { timeWindow: "48 hours" });
    const extraction = await turn("extractVideoFrames", {});
    assert.match(extraction.userVisibleReply, /triggered automatically when proof is submitted/);
    assert.doesNotMatch(extraction.userVisibleReply, /complete|finished/i);
    assert.equal(agentToolReceipt("confirmVerdict", { ok: true, data: { settled: false, status: "pending_settlement", waitingForUserIds: [], reviewStatus: null } }), "Confirmation recorded. Status: pending_settlement.");
    assert.equal(agentToolReceipt("confirmVerdict", { ok: true, data: { settled: true, status: "disputed" } }), "Confirmation recorded. Status: disputed.");
    assert.match(agentToolReceipt("createChallenge", { ok: true, data: { deduplicated: true, status: "settled" } }), /already exists\. Status: settled/);
    const aiReceipt = agentToolReceipt("runVisionJudge", { ok: true, data: { method: "ai", winnerId: "opaque-internal-user-id" } });
    assert.match(aiReceipt, /AI referee recommendation recorded.*A winner was recommended/);
    assert.doesNotMatch(aiReceipt, /opaque-internal-user-id/);
    console.log(`PASS tool narration makes no draft patches or extraction-completion claims; ${turnIndex} turns = ${providerCalls} provider calls`);
  } finally {
    globalThis.fetch = savedFetch;
    for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (userIds.length) {
      const created = await prisma.challenge.findMany({ where: { creatorId: { in: userIds } }, select: { id: true } });
      const ids = [...new Set([...challengeIds, ...created.map(row => row.id)])];
      await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { challengeId: { in: ids } }] } });
      await prisma.creditTx.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.activityEvent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.reviewCase.deleteMany({ where: { challengeId: { in: ids } } });
      await prisma.challenge.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
