import "dotenv/config";
import assert from "node:assert/strict";
import { runAgentTurn } from "../src/lib/agent/orchestrator";
import { emptyDraftState } from "../src/lib/agent/types";

async function main() {
  const savedProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  const savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ORACLE_DEFAULT_PROVIDER = "anthropic";
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const settings = "Challenge settings: stake 50 credits; opponent Invite only; proof window 24 hours.";
    const first = await runAgentTurn({
      userId: "fallback-test-user",
      baseUrl: "https://summoner.world",
      message: `我和朋友打羽毛球，5个球定胜负\n\n${settings}`,
      history: [],
      draftState: emptyDraftState(),
    });
    assert.equal(first.agentAction, "ask_followup");
    assert.equal(first.draftState.readyToPublish, false);
    assert.equal(first.toolName, null);

    const second = await runAgentTurn({
      userId: "fallback-test-user",
      baseUrl: "https://summoner.world",
      message: `总共打5个回合\n\n${settings}`,
      history: [
        { role: "user", content: "我和朋友打羽毛球，5个球定胜负" },
        { role: "ai", content: first.userVisibleReply },
      ],
      draftState: first.draftState,
    });
    assert.equal(second.agentAction, "show_draft");
    assert.equal(second.draftState.readyToPublish, true);
    assert.match(second.draftState.judgeRule ?? "", /Exactly 5 rallies/);
    assert.match(second.draftState.judgeRule ?? "", /scoreboard.*optional/i);

    const generic = await runAgentTurn({
      userId: "fallback-test-user",
      baseUrl: "https://summoner.world",
      message: `我挑战朋友一分钟做最多俯卧撑\n\n${settings}`,
      history: [],
      draftState: emptyDraftState(),
    });
    assert.equal(generic.agentAction, "show_draft");
    assert.equal(generic.draftState.readyToPublish, true);
    assert.equal(generic.draftState.participants, "you + 1 invited friend");

    console.log("PASS real orchestrator degrades without provider credit/key instead of returning 500");
    console.log("PASS fallback keeps one-question continuity and produces a publishable friend quest");
  } finally {
    if (savedProvider === undefined) delete process.env.ORACLE_DEFAULT_PROVIDER;
    else process.env.ORACLE_DEFAULT_PROVIDER = savedProvider;
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
