/**
 * Unit-style test: the server-side guard in createChallengeTool rejects
 * unjudgeable / mood-statement / garbage-title requests, and still accepts
 * well-formed ones. Runs against the real tool (not a mock) so we know the
 * actual executor behaves.
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });
import { executeAgentTool } from "../src/lib/agent/tools";
import { emptyDraftState } from "../src/lib/agent/types";
import prisma from "../src/lib/db";

async function main() {
  // Make a throwaway creator
  const user = await prisma.user.create({
    data: {
      email: `guardtest-${Date.now()}@luckyplay.test`,
      username: "guardtest_" + Math.random().toString(36).slice(2, 8),
      credits: 50,
      isOnline: true,
    },
  });

  const ctx = {
    userId: user.id,
    baseUrl: "https://example.com",
    draftState: emptyDraftState(),
  };

  const cases: { name: string; args: Record<string, unknown>; expectOk: boolean }[] = [
    // Garbage: mood statements should be rejected
    { name: "'I'm so hungry' rejected", args: { title: "I'm so hungry" }, expectOk: false },
    { name: "'我好饿啊' rejected", args: { title: "我好饿啊" }, expectOk: false },
    // Garbage: no judgeRule + proposition === title is rejected
    { name: "no judgeRule, thin prop rejected", args: { title: "pushups", proposition: "pushups" }, expectOk: false },
    { name: "hi greeting rejected", args: { title: "hi" }, expectOk: false },
    { name: "'帮我生成' meta-request rejected", args: { title: "帮我生成一个" }, expectOk: false },
    // Valid: real challenge with judgeRule passes
    {
      name: "real challenge accepted",
      args: {
        title: "Most pushups in 60 seconds",
        proposition: "Who does more pushups in 60 seconds",
        stake: 0,
        evidenceType: "video",
        judgeRule:
          "AI counts the pushups in each submitted video and awards the higher count; ties go to whoever completed faster.",
        timeWindow: "within 1 hour",
      },
      expectOk: true,
    },
  ];

  const created: string[] = [];
  let allPass = true;
  for (const c of cases) {
    const r = await executeAgentTool("createChallenge", ctx, c.args);
    const actual = r.ok;
    const pass = actual === c.expectOk;
    console.log(`${pass ? "✅" : "❌"} ${c.name}  (expected ok=${c.expectOk}, got ok=${actual}${r.ok ? "" : `, err="${r.error}"`})`);
    if (r.ok) {
      const data = r.data as { challengeId?: string } | undefined;
      if (data?.challengeId) created.push(data.challengeId);
    }
    if (!pass) allPass = false;
  }

  // Cleanup
  if (created.length) {
    await prisma.participant.deleteMany({ where: { challengeId: { in: created } } });
    await prisma.activityEvent.deleteMany({ where: { challengeId: { in: created } } });
    await prisma.challenge.deleteMany({ where: { id: { in: created } } });
  }
  await prisma.creditTx.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("\ncleanup done");

  console.log(allPass ? "\n✅ ALL GUARD CHECKS PASSED" : "\n❌ SOME CHECKS FAILED");
  process.exit(allPass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
