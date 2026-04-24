import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });
import { runAgentTurn } from "../src/lib/agent/orchestrator";
import { emptyDraftState, type AgentMessage, type DraftState } from "../src/lib/agent/types";

async function main() {
  const history: AgentMessage[] = [];
  let draft: DraftState = emptyDraftState();
  const turns = [
    "我想跟朋友比谁先喝完这瓶水",
    "不赌钱",
    "对，都上传视频",
    "创建",
  ];
  for (const msg of turns) {
    const t0 = Date.now();
    const r = await runAgentTurn({
      userId: "test-no-db",
      baseUrl: "https://gamble-ai-agent.vercel.app",
      message: msg, history, draftState: draft,
    });
    const ms = Date.now() - t0;
    history.push({ role: "user", content: msg });
    history.push({ role: "ai", content: r.userVisibleReply });
    draft = r.draftState;
    console.log(`\n[${ms}ms] user: ${msg}`);
    console.log(`        AI:   ${r.userVisibleReply}`);
    console.log(`        action=${r.agentAction} tool=${r.toolName ?? "-"} readyToPublish=${draft.readyToPublish}`);
    console.log(`        draft: title=${draft.title} stake=${draft.stake} stakeType=${draft.stakeType} evidence=${draft.evidenceType}`);
    if (r.toolError) console.log(`        toolError: ${r.toolError}`);
    if (r.toolResult) console.log(`        toolResult: ${JSON.stringify(r.toolResult).slice(0,250)}`);
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
