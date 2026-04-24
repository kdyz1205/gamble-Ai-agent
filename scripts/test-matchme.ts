/**
 * End-to-end test of the matchMe / findOpenMarkets flow through the agent
 * orchestrator. Creates a throwaway creator + opponent, an open public
 * market, then runs "给我匹配一个" against the agent and asserts that:
 *
 *   1. Agent picked agentAction=call_tool with toolName=matchMe
 *   2. Tool actually dispatched (toolResult populated)
 *   3. toolResult.matched === true
 *   4. toolResult.marketUrl points at the seeded market
 *   5. The opponent is now a Participant on the market
 *
 * Also tests a second scenario: "有什么可以玩的" → findOpenMarkets with
 * a grounded reply that mentions the real market title.
 *
 * Cleans up both users + test market at the end.
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });
import { runAgentTurn } from "../src/lib/agent/orchestrator";
import { emptyDraftState, type AgentMessage, type DraftState } from "../src/lib/agent/types";
import prisma from "../src/lib/db";

const FAIL = "❌";
const PASS = "✅";

async function main() {
  const suffix = Date.now();

  // ─── Seed a creator + an open public market ────────────────────────────
  const creator = await prisma.user.create({
    data: {
      email: `matchtest-creator-${suffix}@luckyplay.test`,
      username: "matchcreator_" + Math.random().toString(36).slice(2, 8),
      credits: 100,
      isOnline: true,
    },
  });
  const market = await prisma.challenge.create({
    data: {
      creatorId: creator.id,
      title: "Test match — plank 60s",
      description: "test seed",
      type: "fitness",
      proposition: "Who can plank longer in a single attempt.",
      stake: 0,
      maxParticipants: 2,
      evidenceType: "video",
      rules: "AI watches both videos and declares the longer plank the winner.",
      status: "open",
      isPublic: true,
      visibility: "public",
    },
  });
  // Creator as Participant row (the acceptChallenge tool expects an opening slot).
  await prisma.participant.create({
    data: {
      challengeId: market.id,
      userId: creator.id,
      role: "creator",
      status: "accepted",
    },
  });
  console.log(`Seeded creator ${creator.id} + market ${market.id} "${market.title}"`);

  // ─── Seed an opponent ──────────────────────────────────────────────────
  const opp = await prisma.user.create({
    data: {
      email: `matchtest-opp-${suffix}@luckyplay.test`,
      username: "matchopp_" + Math.random().toString(36).slice(2, 8),
      credits: 50,
      isOnline: true,
    },
  });
  await prisma.creditTx.create({
    data: { userId: opp.id, type: "bonus", amount: 50, balanceAfter: 50, description: "Welcome" },
  });
  console.log(`Seeded opponent ${opp.id}`);

  let allPassed = true;

  // ─── Scenario 1: "给我匹配一个挑战" → should hit matchMe ──────────────
  {
    console.log("\n=== Scenario 1: drift-bottle match ===");
    const history: AgentMessage[] = [];
    const draft: DraftState = emptyDraftState();
    const r = await runAgentTurn({
      userId: opp.id,
      baseUrl: "https://gamble-ai-agent.vercel.app",
      message: "给我匹配一个挑战",
      history,
      draftState: draft,
    });
    console.log("AI:", r.userVisibleReply);
    console.log("action:", r.agentAction, "tool:", r.toolName);
    console.log("toolResult:", JSON.stringify(r.toolResult, null, 2));
    if (r.toolError) console.log("toolError:", r.toolError);

    const tr = r.toolResult as { matched?: boolean; marketUrl?: string; challengeId?: string } | undefined;
    const checks: [string, boolean][] = [
      ["agentAction === call_tool", r.agentAction === "call_tool"],
      ["toolName === matchMe", r.toolName === "matchMe"],
      ["tool dispatched (toolResult populated)", tr !== undefined],
      ["matched === true", tr?.matched === true],
      ["marketUrl mentions seeded market id", typeof tr?.marketUrl === "string" && tr!.marketUrl!.includes(market.id)],
    ];
    for (const [name, ok] of checks) {
      console.log(` ${ok ? PASS : FAIL} ${name}`);
      if (!ok) allPassed = false;
    }

    // Verify opponent is now a participant on the market
    const partRow = await prisma.participant.findFirst({ where: { challengeId: market.id, userId: opp.id } });
    const partOk = !!partRow;
    console.log(` ${partOk ? PASS : FAIL} DB: opponent Participant row exists on market`);
    if (!partOk) allPassed = false;
  }

  // ─── Scenario 2: "有什么可以玩的" → should hit findOpenMarkets ───────
  // Create a second market for this scenario (the first was just accepted).
  const market2 = await prisma.challenge.create({
    data: {
      creatorId: creator.id,
      title: "Test match 2 — 30 pushups",
      description: "test seed 2",
      type: "fitness",
      proposition: "First to 30 pushups wins.",
      stake: 0,
      maxParticipants: 2,
      evidenceType: "video",
      rules: "AI counts pushups in both videos.",
      status: "open",
      isPublic: true,
      visibility: "public",
    },
  });
  await prisma.participant.create({
    data: {
      challengeId: market2.id,
      userId: creator.id,
      role: "creator",
      status: "accepted",
    },
  });
  console.log(`\nSeeded second market ${market2.id} "${market2.title}"`);

  // Make another throwaway opp so matchMe's "already participating" filter doesn't exclude market1
  const opp2 = await prisma.user.create({
    data: {
      email: `matchtest-opp2-${suffix}@luckyplay.test`,
      username: "matchopp2_" + Math.random().toString(36).slice(2, 8),
      credits: 50,
      isOnline: true,
    },
  });
  await prisma.creditTx.create({
    data: { userId: opp2.id, type: "bonus", amount: 50, balanceAfter: 50, description: "Welcome" },
  });

  {
    console.log("\n=== Scenario 2: browse open markets ===");
    const history: AgentMessage[] = [];
    const draft: DraftState = emptyDraftState();
    const r = await runAgentTurn({
      userId: opp2.id,
      baseUrl: "https://gamble-ai-agent.vercel.app",
      message: "有什么可以玩的?",
      history,
      draftState: draft,
    });
    console.log("AI:", r.userVisibleReply);
    console.log("action:", r.agentAction, "tool:", r.toolName);
    console.log("toolResult keys:", r.toolResult ? Object.keys(r.toolResult as object) : "(none)");
    if (r.toolError) console.log("toolError:", r.toolError);

    const tr = r.toolResult as { count?: number; markets?: { id: string; title: string }[] } | undefined;
    const checks: [string, boolean][] = [
      ["agentAction === call_tool", r.agentAction === "call_tool"],
      ["toolName === findOpenMarkets", r.toolName === "findOpenMarkets"],
      ["tool dispatched", tr !== undefined],
      ["count >= 1", typeof tr?.count === "number" && tr!.count! >= 1],
      ["markets array contains seeded title", Array.isArray(tr?.markets) && tr!.markets!.some((m) => m.id === market2.id || m.title === market2.title)],
    ];
    for (const [name, ok] of checks) {
      console.log(` ${ok ? PASS : FAIL} ${name}`);
      if (!ok) allPassed = false;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────
  console.log("\n=== cleanup ===");
  await prisma.creditTx.deleteMany({ where: { userId: { in: [opp.id, opp2.id, creator.id] } } });
  await prisma.participant.deleteMany({ where: { challengeId: { in: [market.id, market2.id] } } });
  await prisma.challenge.deleteMany({ where: { id: { in: [market.id, market2.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [opp.id, opp2.id, creator.id] } } });
  console.log("cleanup done");

  console.log("\n" + (allPassed ? `${PASS} ALL MATCHME CHECKS PASSED` : `${FAIL} SOME CHECKS FAILED`));
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
