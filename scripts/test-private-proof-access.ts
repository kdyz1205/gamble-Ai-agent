import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { request, type APIRequestContext } from "@playwright/test";

async function main() {
  const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3018";
  assert(["localhost", "127.0.0.1", "summoner.world"].includes(new URL(base).hostname)
    || /^stubborn-[a-z0-9]+-kdyz1205s-projects\.vercel\.app$/.test(new URL(base).hostname));
  const run = randomUUID().replaceAll("-", "");
  const contexts: APIRequestContext[] = [];
  const quests: string[] = [];
  const actor = async (label: string) => {
    const context = await request.newContext({ baseURL: base }); contexts.push(context);
    const { csrfToken } = await (await context.get("/api/auth/csrf")).json();
    assert.equal((await context.post("/api/auth/callback/credentials", { form: {
      csrfToken, action: "register", email: `qa_privacy_${run}_${label}@example.invalid`, username: `qa_privacy_${run}_${label}`,
      password: randomUUID() + "Aa9!", callbackUrl: `${base}/summons`, json: "true",
    } })).status(), 200);
    assert.ok((await (await context.get("/api/auth/session")).json()).user?.id);
    return context;
  };
  try {
    const creator = await actor("a"), opponent = await actor("b"), outsider = await actor("c");
    const anon = await request.newContext({ baseURL: base }); contexts.push(anon);
    for (const visibility of ["private", "invite_only", "public"]) {
      const created = await creator.post("/api/challenges", { data: {
        title: `QA proof privacy ${visibility} ${run}`, stake: 0, evidenceType: "text", visibility,
        isPublic: true, deadline: "2h", rules: "Write the agreed answer. Correct answers tie.",
      } });
      assert.equal(created.status(), 201);
      const id = (await created.json()).challenge.id as string; quests.push(id);
      assert.equal((await opponent.post(`/api/challenges/${id}/accept`)).status(), 200);
      for (const player of [creator, opponent]) {
        assert.equal((await player.post(`/api/challenges/${id}/evidence`, { data: { type: "text", description: `Synthetic private proof sentinel ${run}` } })).status(), 201);
      }
      for (const player of [creator, opponent]) {
        const detail = await (await player.get(`/api/challenges/${id}`)).json();
        assert.equal(detail.challenge.evidence.length, 2);
        assert.equal((await player.get(`/api/challenges/${id}/evidence`)).status(), 200);
      }
      for (const viewer of [anon, outsider]) {
        const detail = await (await viewer.get(`/api/challenges/${id}`)).json();
        assert.equal(detail.challenge.evidence.length, visibility === "public" ? 2 : 0);
        assert.equal((await viewer.get(`/api/challenges/${id}/evidence`)).status(), visibility === "public" ? 200 : 403);
        if (visibility !== "public") {
          assert.equal(detail.challenge.proofAccess, "players_only");
          assert.ok(!JSON.stringify(detail).includes(`Synthetic private proof sentinel ${run}`));
        }
      }
      const feed = await (await anon.get("/api/feed?limit=50")).json();
      assert.equal(feed.events.some((event: { challengeId: string }) => event.challengeId === id), visibility === "public");
      const discovery = await (await anon.get("/api/challenges?limit=50")).json();
      assert.equal(discovery.challenges.some((quest: { id: string }) => quest.id === id), visibility === "public");
    }
    const receipt = { base, quests, passed: 3, checks: ["private_and_invite_only_proof_requires_authorized_viewer", "public_proof_and_invitation_preview_preserved", "private_activity_and_discovery_excluded"], providerCalls: 0, at: new Date().toISOString() };
    await mkdir("output", { recursive: true });
    await writeFile(process.env.PRIVATE_PROOF_RECEIPT ?? "output/private-proof-access.json", JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally { await Promise.all(contexts.map((context) => context.dispose())); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
