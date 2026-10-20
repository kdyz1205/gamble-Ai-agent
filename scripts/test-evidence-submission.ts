/** Real PostgreSQL proof/readiness contract for both HTTP's production service and agent tools. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { request, type APIRequestContext } from "@playwright/test";
import prisma from "../src/lib/db";
import { submitChallengeEvidence, EvidenceSubmissionError } from "../src/lib/evidence-submission";
import { executeAgentTool } from "../src/lib/agent/tools";
import { emptyDraftState } from "../src/lib/agent/types";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname === "/summoner_verification");
  const runId = randomUUID().replaceAll("-", "");
  const http = process.argv.includes("--http");
  const base = process.env.TEST_EVIDENCE_BASE_URL || "http://localhost:3018";
  assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const password = randomUUID();
  const passwordHash = await hash(password, 8);
  const contexts = new Map<string, APIRequestContext>();
  const fixtures: string[] = [];
  let passed = 0;
  const pass = (message: string) => { passed++; console.log(`PASS ${message}`); };
  try {
  for (const channel of (http ? ["service", "agent", "http"] : ["service", "agent"])) {
    const players = await Promise.all(["a", "b", "spectator", "pending"].map((label) => prisma.user.create({ data: {
      username: `proof_${runId}_${channel}_${label}`, email: `proof_${runId}_${channel}_${label}@example.invalid`, credits: 100, passwordHash,
    } })));
    if (channel === "http") for (const player of players) {
      const context = await request.newContext({ baseURL: base });
      contexts.set(player.id, context);
      const csrf = await (await context.get("/api/auth/csrf")).json() as { csrfToken: string };
      await context.post("/api/auth/callback/credentials", { form: { email: player.email, password,
        csrfToken: csrf.csrfToken, callbackUrl: `${base}/summons`, json: "true" } });
      const session = await (await context.get("/api/auth/session")).json() as { user: { email: string } };
      assert.equal(session.user.email, player.email);
    }
    const [creator, opponent, spectator, pending] = players;
    const makeQuest = (label: string, evidenceType = "self_report") => prisma.challenge.create({ data: {
      title: `Proof transaction ${label} ${runId}`, type: "General", creatorId: creator.id, status: "live", stake: 0, evidenceType,
      participants: { create: [
        { userId: creator.id, role: "creator", status: "accepted" }, { userId: opponent.id, role: "opponent", status: "accepted" },
        { userId: spectator.id, role: "spectator", status: "accepted" }, { userId: pending.id, role: "opponent", status: "pending" },
      ] },
    } });
    const submit = async (user: typeof creator, challengeId: string, proof: string | { type?: string; description?: string; url?: string | null; metadata?: unknown }) => {
      const args = { challengeId, ...(typeof proof === "string" ? { type: "text", description: proof } : proof) };
      if (channel === "http") {
        const response = await contexts.get(user.id)!.post(`/api/challenges/${challengeId}/evidence`, { data: args });
        const body = await response.json() as { evidence?: { id: string }; error?: string };
        if (!response.ok()) throw new EvidenceSubmissionError(body.error || "HTTP evidence request failed", response.status());
        return body.evidence!;
      }
      if (channel === "agent") {
        const result = await executeAgentTool("uploadEvidence", { userId: user.id, baseUrl: "http://localhost", draftState: emptyDraftState() }, args);
        if (!result.ok) throw new Error(result.error);
        return { id: (result.data as { evidenceId: string }).evidenceId };
      }
      return (await submitChallengeEvidence({ userId: user.id, username: user.username }, challengeId, args)).evidence;
    };
    const challenge = await makeQuest("concurrent");
    fixtures.push(challenge.id);
    // A historical spectator record must never substitute for an accepted opponent's proof.
    await prisma.evidence.create({ data: { challengeId: challenge.id, userId: spectator.id, type: "text", description: "Historical spectator content" } });
    const submissions = await Promise.all(Array.from({ length: 8 }, () => submit(creator, challenge.id, "Answer 56")));
    assert.equal(new Set(submissions.map((item) => item.id)).size, 1);
    assert.equal(await prisma.evidence.count({ where: { challengeId: challenge.id, userId: creator.id } }), 1);
    assert.equal(await prisma.activityEvent.count({ where: { challengeId: challenge.id, type: "evidence_submitted" } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: challenge.id, action: "evidence.submitted" } }), 1);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).status, "live");
    await assert.rejects(submit(spectator, challenge.id, "Spectators cannot decide the result"));
    await assert.rejects(submit(pending, challenge.id, "Pending players cannot submit"));
    pass(`${channel}: duplicate proof is idempotent; spectator and pending proof cannot substitute for opponent`);
    const opponentCalls = await Promise.all(Array.from({ length: 8 }, () => submit(opponent, challenge.id, "Answer 55")));
    assert.equal(new Set(opponentCalls.map((item) => item.id)).size, 1);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).status, "judging");
    assert.equal(await prisma.activityEvent.count({ where: { challengeId: challenge.id, type: "evidence_submitted" } }), 2);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: challenge.id, action: "challenge.status_changed" } }), 1);
    assert.equal((await submit(opponent, challenge.id, "Answer 55")).id, opponentCalls[0].id);
    await assert.rejects(submit(opponent, challenge.id, "Changed after judging started"));
    assert.equal((await prisma.evidence.findUniqueOrThrow({ where: { id: opponentCalls[0].id } })).description, "Answer 55");
    pass(`${channel}: last player's concurrent retries transition to judging once; frozen proof permits only exact retries`);

    const failure = await makeQuest("rollback");
    fixtures.push(failure.id);
    await submit(creator, failure.id, "Creator proof");
    const functionName = `verify_proof_${channel}_${runId}`;
    const triggerName = `verify_proof_trigger_${channel}_${runId}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled final proof transition audit failure'; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW WHEN (NEW."challengeId" = '${failure.id}' AND NEW.action = 'challenge.status_changed') EXECUTE FUNCTION "${functionName}"()`);
      try {
        await assert.rejects(submit(opponent, failure.id, "Opponent proof"));
        assert.equal(await prisma.evidence.count({ where: { challengeId: failure.id } }), 1);
        assert.equal(await prisma.evidence.count({ where: { challengeId: failure.id, userId: opponent.id } }), 0);
        assert.equal(await prisma.activityEvent.count({ where: { challengeId: failure.id, type: "evidence_submitted" } }), 1);
        assert.equal(await prisma.auditLog.count({ where: { challengeId: failure.id, action: "evidence.submitted" } }), 1);
        assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: failure.id } })).status, "live");
      } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "AuditLog"`); }
    } finally { await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`); }
    await submit(opponent, failure.id, "Opponent proof");
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: failure.id } })).status, "judging");
    assert.equal(await prisma.evidence.count({ where: { challengeId: failure.id } }), 2);
    assert.equal(await prisma.activityEvent.count({ where: { challengeId: failure.id, type: "evidence_submitted" } }), 2);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: failure.id, action: "evidence.submitted" } }), 2);
    pass(`${channel}: final transition audit failure rolls back proof/activity/readiness; successful retry commits all three`);

    const simultaneous = await makeQuest("both-players");
    fixtures.push(simultaneous.id);
    await Promise.all([submit(creator, simultaneous.id, "A proof"), submit(opponent, simultaneous.id, "B proof")]);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: simultaneous.id } })).status, "judging");
    assert.equal(await prisma.evidence.count({ where: { challengeId: simultaneous.id } }), 2);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: simultaneous.id, action: "challenge.status_changed" } }), 1);
    assert((await prisma.user.findMany({ where: { id: { in: players.map((player) => player.id) } } })).every((player) => player.credits === 100));
    assert.equal(await prisma.creditTx.count({ where: { userId: { in: players.map((player) => player.id) } } }), 0);
    pass(`${channel}: simultaneous participant submissions reach judging without affecting credits`);

    const late = await makeQuest("deadline");
    fixtures.push(late.id);
    const beforeDeadline = await submit(creator, late.id, "Proof received before cutoff");
    await prisma.challenge.update({ where: { id: late.id }, data: { deadline: new Date(Date.now() - 1_000), proofWindow: "48 hours" } });
    assert.equal((await submit(creator, late.id, "Proof received before cutoff")).id, beforeDeadline.id);
    const deadlineError = (error: unknown) => error instanceof Error && /deadline/.test(error.message)
      && (channel === "agent" || error instanceof EvidenceSubmissionError && error.status === 409);
    await assert.rejects(submit(creator, late.id, "Late replacement"), deadlineError);
    await assert.rejects(submit(opponent, late.id, "Late new proof"), deadlineError);
    assert.equal(await prisma.evidence.count({ where: { challengeId: late.id } }), 1);
    assert.equal((await prisma.evidence.findUniqueOrThrow({ where: { id: beforeDeadline.id } })).description, "Proof received before cutoff");
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: late.id } })).status, "live");
    assert.equal(await prisma.activityEvent.count({ where: { challengeId: late.id, type: "evidence_submitted" } }), 1);
    pass(`${channel}: cutoff rejects late new or changed proof while preserving exact successful retries`);

    const empty = await makeQuest("empty", "text");
    fixtures.push(empty.id);
    await assert.rejects(submit(creator, empty.id, { type: "text", description: "  " }));
    assert.equal(await prisma.evidence.count({ where: { challengeId: empty.id } }), 0);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: empty.id } })).status, "live");
    const validText = await submit(creator, empty.id, "A substantive proof description");
    await assert.rejects(submit(creator, empty.id, { type: "text" }));
    assert.equal((await prisma.evidence.findUniqueOrThrow({ where: { id: validText.id } })).description, "A substantive proof description");
    pass(`${channel}: empty written proof is rejected before storage and cannot erase valid proof`);

    for (const policy of ["video", "photo"]) {
      const media = await makeQuest(policy, policy);
      fixtures.push(media.id);
      for (const invalid of [{ type: "text", description: "Text cannot replace required media" }, { type: policy }, { type: policy, url: "   " },
        ...["https://127.0.0.1/private", "http://example.com/proof", "https://youtube.com/watch?v=qa", "https://user:password@example.com/proof"].map((url) => ({ type: policy, url }))]) {
        await assert.rejects(submit(creator, media.id, invalid));
      }
      assert.equal(await prisma.evidence.count({ where: { challengeId: media.id } }), 0);
      assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: media.id } })).status, "live");
      const validUrl = `https://example.invalid/proof.${policy === "video" ? "mp4" : "jpg"}`;
      // The HTTP negative-path fixture avoids scheduling unrelated media network work.
      const validMedia = channel === "http"
        ? await prisma.evidence.create({ data: { challengeId: media.id, userId: creator.id, type: policy, url: validUrl } })
        : await submit(creator, media.id, { type: policy, url: validUrl });
      await assert.rejects(submit(creator, media.id, { type: "text", description: "Invalid replacement" }));
      assert.equal((await prisma.evidence.findUniqueOrThrow({ where: { id: validMedia.id } })).url, validUrl);
      pass(`${channel}: ${policy} policy rejects mismatched or missing media without overwriting valid proof`);
    }
  }
  console.log(JSON.stringify({ runId, passed, fixtures, retained: true, providerCalls: 0 }));
  } finally { await Promise.all([...contexts.values()].map((context) => context.dispose())); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
