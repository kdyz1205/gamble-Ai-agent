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
      // These actors use the repository's explicit @example.invalid fixture
      // marker. Even their public Quests stay out of the player activity feed.
      // Positive ordinary-public visibility/count/pagination is covered by
      // test-public-feed-db.ts with distinct non-fixture-domain accounts.
      assert.equal(feed.events.some((event: { challengeId: string }) => event.challengeId === id), false);
      const discovery = await (await anon.get("/api/challenges?limit=50")).json();
      assert.equal(discovery.challenges.some((quest: { id: string }) => quest.id === id), visibility === "public");
    }
    let legacyIncompleteProof: string = "not_run_cloud_data_is_preserved";
    if (["localhost", "127.0.0.1"].includes(new URL(base).hostname) && process.env.DATABASE_URL) {
      const dbUrl = new URL(process.env.DATABASE_URL);
      assert(["localhost", "127.0.0.1"].includes(dbUrl.hostname) && dbUrl.pathname === "/summoner_verification");
      const { Client } = await import("pg");
      const db = new Client({ connectionString: dbUrl.href }); await db.connect();
      const questId = quests.at(-1)!;
      const proof = (await db.query('SELECT id, description FROM "Evidence" WHERE "challengeId"=$1 LIMIT 1', [questId])).rows[0];
      try {
        // Only this run's local synthetic fixture: represent an invalid legacy
        // proof row after readiness was already advanced by older code.
        await db.query('UPDATE "Evidence" SET description=\' \' WHERE id=$1', [proof.id]);
        assert.equal((await creator.post(`/api/challenges/${questId}/judge/async`)).status(), 409);
        assert.equal((await db.query('SELECT count(*)::int AS count FROM "JudgeJob" WHERE "challengeId"=$1', [questId])).rows[0].count, 0);
        legacyIncompleteProof = "409_no_job_created";
      } finally {
        await db.query('UPDATE "Evidence" SET description=$2 WHERE id=$1', [proof.id, proof.description]); await db.end();
      }
    }
    const receipt = { base, quests, passed: 3, checks: ["private_and_invite_only_proof_requires_authorized_viewer", "public_proof_and_invitation_preview_preserved", "private_activity_and_discovery_excluded"], providerCalls: 0, at: new Date().toISOString() };
    Object.assign(receipt, { legacyIncompleteProof });
    await mkdir("output", { recursive: true });
    await writeFile(process.env.PRIVATE_PROOF_RECEIPT ?? "output/private-proof-access.json", JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally { await Promise.all(contexts.map((context) => context.dispose())); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
