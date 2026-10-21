import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runAgentTurn } from "../src/lib/agent/orchestrator";
import { normalizeDraftState } from "../src/lib/agent/draft-policy";
import { boundedAgentHistory, MAX_AGENT_MESSAGE_CHARS, MAX_AGENT_HISTORY_CHARS, tryLocalAgentResponse } from "../src/lib/agent/local-routing";
import { emptyDraftState, type DraftState } from "../src/lib/agent/types";
import prisma from "../src/lib/db";
import { AiBudgetError, withAiContext } from "../src/lib/ai-governance";

// Intercept only the external provider boundary. All routing, normalization,
// merging, and readiness assertions exercise the real production orchestrator.
async function main() {
  const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert.ok(["localhost", "127.0.0.1"].includes(dbUrl.hostname), "Routing provider tests require an explicit local test DATABASE_URL; they persist real accounting receipts");
  const savedFetch = globalThis.fetch;
  const savedProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.ORACLE_DEFAULT_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "routing-contract-test";
  const payloads: string[] = [];
  const runId = randomUUID();
  let requestIndex = 0;
  let malformed = false;
  globalThis.fetch = async (_url, init) => {
    payloads.push(String(init?.body));
    return new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }, choices: [{ message: { content: malformed ? "not valid agent JSON" : JSON.stringify({ userVisibleReply: "Please clarify the custom rule.", agentAction: "ask_followup", draftPatch: {}, toolName: null, toolArgs: null }) } }] }), { status: 200 });
  };
  const turn = (message: string, draftState: DraftState = emptyDraftState()) => withAiContext({ purpose: "test.agent-routing", requestId: `${runId}-${++requestIndex}` }, () => runAgentTurn({ userId: "routing-test", baseUrl: "http://localhost", message, draftState, history: [] }));
  const settings = "Challenge settings: stake 50 credits; opponent Invite only; proof window 24 hours.";
  try {
    const first = await turn(`我和朋友打羽毛球，5个球定胜负\n\n${settings}`);
    assert.equal(first.agentAction, "ask_followup");
    assert.equal(first.draftState.readyToPublish, false);
    const second = await turn(`总共打5个回合\n\n${settings}`, first.draftState);
    assert.equal(second.draftState.readyToPublish, true);
    assert.match(second.draftState.judgeRule ?? "", /Exactly 5 rallies/);
    assert.equal(payloads.length, 0, "Supported multi-turn template must make zero provider calls");

    const edited = await turn("change stake to 25 credits", second.draftState);
    assert.equal(edited.draftState.stake, 25);
    const timed = await turn("证明期限改为48小时", edited.draftState);
    const invited = await turn("change opponent to open match", timed.draftState);
    assert.equal(invited.draftState.timeWindow, "48小时");
    assert.equal(invited.draftState.participants, "you + 1 open opponent");
    for (const result of [edited, timed, invited]) {
      assert.equal(result.draftState.proposition, second.draftState.proposition);
      assert.equal(result.draftState.judgeRule, second.draftState.judgeRule);
      assert.equal(result.draftState.readyToPublish, true);
      assert.equal(result.toolName, null);
    }
    assert.equal(payloads.length, 0, "Settings edits must make zero provider calls");
    const partial = await turn("积分改为20", first.draftState);
    assert.equal(partial.draftState.readyToPublish, false, "Settings must not invent missing scoring rules");
    assert.equal(partial.draftState.judgeRule, null);
    const oversized = await turn("x".repeat(MAX_AGENT_MESSAGE_CHARS + 1), second.draftState);
    assert.deepEqual(oversized.draftState, second.draftState);
    assert.match(oversized.userVisibleReply, /shorten/);
    assert.equal(payloads.length, 0);
    assert.equal(await prisma.auditLog.count({ where: { action: "ai.call.reserved", payload: { contains: runId } } }), 0, "Local operations reserve no paid inference budget");

    const custom = "badminton first to 5 points, but deuce requires a two-point lead";
    await turn(custom);
    assert.equal(payloads.length, 1, "Custom scoring must reach the model");
    const beforePublish = payloads.length;
    assert.equal(tryLocalAgentResponse("publish it", second.draftState), null, "Local parsing never publishes");
    assert.equal(payloads.length, beforePublish);
    for (const message of ["change stake to -20", "change stake to 25 credits and publish", "change proof window to 0 hours", "I challenge my friend to build the best robot", "first to 5 points"]) {
      assert.equal(tryLocalAgentResponse(message, emptyDraftState()), null);
      await turn(message);
    }
    assert.equal(payloads.length, 6, "Unsupported requests remain on inference path");
    const customDraft = normalizeDraftState({ ...second.draftState, judgeRule: "Use a two-point deuce lead and mandatory service rotations in this match." });
    for (const message of ["change opponent to constructor", "change opponent to __proto__", "change stake to -20", "change stake to 25 credits and publish", "change proof window to 0 hours"]) {
      assert.equal(tryLocalAgentResponse(message, customDraft), null, "Reject unsupported settings on an existing draft");
    }
    assert.equal(tryLocalAgentResponse("first to 7 points", customDraft), null, "Do not overwrite custom rules with a template");
    const customEdited = await turn("change stake to 20 credits", customDraft);
    assert.equal(customEdited.draftState.judgeRule, customDraft.judgeRule);
    assert.equal(payloads.length, 6);

    const history = boundedAgentHistory(Array.from({ length: 16 }, (_, i) => ({ role: "user" as const, content: `${i}:` + "x".repeat(5_000) })));
    assert.ok(history.length <= MAX_AGENT_HISTORY_CHARS);
    assert.ok(history.includes("15:"));
    assert.ok(!history.includes("0:"));
    await withAiContext({ purpose: "test.agent-routing.context", requestId: `${runId}-${++requestIndex}` }, () => runAgentTurn({
      userId: "routing-test", baseUrl: "http://localhost", message: custom,
      history: Array.from({ length: 16 }, () => ({ role: "user" as const, content: "x".repeat(5_000) })),
    }));
    const sent = JSON.parse(payloads.at(-1)!) as { messages: Array<{ content: string }> };
    assert.ok(sent.messages[1].content.length < 8_000, "Actual provider payload has bounded recent history");
    assert.ok(sent.messages[1].content.includes(custom), "Current message is preserved verbatim");
    malformed = true;
    const failed = await turn(custom, customDraft);
    assert.deepEqual(failed.draftState, customDraft, "Malformed inference must not rewrite existing rules");
    assert.equal(failed.toolName, null);
    assert.match(failed.userVisibleReply, /could not process/);
    malformed = false;
    const boundedDraft = normalizeDraftState({ safetyNotes: Array(8).fill("x".repeat(10_000)) });
    assert.ok(boundedDraft.safetyNotes.every(note => note.length <= 240));
    const enabled = process.env.AI_ENABLED;
    try {
      process.env.AI_ENABLED = "false";
      const before = payloads.length;
      await assert.rejects(() => turn(custom), AiBudgetError);
      const freeEdit = await turn("make it free", customDraft);
      assert.equal(freeEdit.draftState.stake, 0);
      assert.equal(payloads.length, before, "Budget rejection makes zero paid calls; exact settings still work");
    } finally {
      if (enabled === undefined) delete process.env.AI_ENABLED;
      else process.env.AI_ENABLED = enabled;
    }
    assert.equal(await prisma.auditLog.count({ where: { action: "ai.call.reserved", payload: { contains: runId } } }), 8);
    assert.equal(await prisma.auditLog.count({ where: { action: "ai.call.completed", payload: { contains: runId } } }), 8);
    console.log("PASS zero-provider multi-turn sports, exact settings edits, and oversized rejection");
    console.log("PASS custom/unsupported/negative requests retain inference; custom rules preserved");
    console.log("PASS bounded recent history and draft safety notes");
    console.log("PASS initial budget errors propagate; local settings remain available without paid calls");
  } finally {
    globalThis.fetch = savedFetch;
    if (savedProvider === undefined) delete process.env.ORACLE_DEFAULT_PROVIDER;
    else process.env.ORACLE_DEFAULT_PROVIDER = savedProvider;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
