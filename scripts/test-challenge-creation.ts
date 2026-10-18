/** Real PostgreSQL transactions; --http exercises the authenticated Next.js POST route too. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { request, type APIRequestContext } from "@playwright/test";
import prisma from "../src/lib/db";
import { createChallengeForUser, ChallengeCreationCreditsError, ChallengeCreationInputError } from "../src/lib/challenge-creation";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname === "/summoner_verification");
  const http = process.argv.includes("--http");
  const base = process.env.TEST_CREATION_BASE_URL || "http://localhost:3018";
  assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const runId = randomUUID().replaceAll("-", "");
  const password = randomUUID();
  const passwordHash = await hash(password, 8);
  const contexts: APIRequestContext[] = [];
  const players: string[] = [];
  let passed = 0;
  const pass = (message: string) => { passed++; console.log(`PASS ${message}`); };
  async function player(label: string, credits: number) {
    const row = await prisma.user.create({ data: { username: `creation_${runId}_${label}`, email: `creation_${runId}_${label}@example.invalid`, passwordHash, credits } });
    players.push(row.id);
    const context = http ? await request.newContext({ baseURL: base }) : null;
    if (context) {
      contexts.push(context);
      const csrf = await context.get("/api/auth/csrf");
      assert.equal(csrf.status(), 200);
      const { csrfToken } = await csrf.json() as { csrfToken: string };
      const signedIn = await context.post("/api/auth/callback/credentials", { form: {
        email: row.email, password, csrfToken, callbackUrl: `${base}/summons`, json: "true",
      } });
      assert(signedIn.ok());
      const session = await (await context.get("/api/auth/session")).json() as { user: { email: string } };
      assert.equal(session.user.email, row.email);
    }
    return { row, context };
  }
  async function submit(user: Awaited<ReturnType<typeof player>>, body: unknown) {
    if (user.context) {
      const response = await user.context.post("/api/challenges", { data: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
      return { status: response.status(), body: await response.json() as Record<string, unknown> };
    }
    try {
      return { status: 201, body: { challenge: await createChallengeForUser({ userId: user.row.id, username: user.row.username }, body) } as Record<string, unknown> };
    } catch (error) {
      return { status: error instanceof ChallengeCreationInputError ? 400 : error instanceof ChallengeCreationCreditsError ? 402 : 500,
        body: { error: "Transaction rejected" } as Record<string, unknown> };
    }
  }
  const credits = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;
  try {
    const success = await player("success", 20);
    const created = await submit(success, { title: "Arithmetic proof quest", stake: 5, deadline: "2 hours", description: "Complete the shared proof task", isPublic: false });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const challenge = created.body.challenge as { id: string; status: string; stake: number; deadline: string | Date; visibility: string; evidenceType: string; creator: { credits: number }; participants: Array<{ role: string; status: string }> };
    assert.equal(challenge.status, "open");
    assert.equal(challenge.stake, 5);
    assert.equal(challenge.visibility, "private");
    assert.equal(challenge.evidenceType, "self_report");
    assert.equal(challenge.creator.credits, 15);
    assert.equal(challenge.participants.length, 1);
    assert.equal(challenge.participants[0].role, "creator");
    assert.equal(challenge.participants[0].status, "accepted");
    assert(Math.abs(new Date(challenge.deadline).getTime() - Date.now() - 2 * 60 * 60_000) < 30_000);
    const ledger = await prisma.creditTx.findMany({ where: { userId: success.row.id } });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].challengeId, challenge.id);
    assert.equal(ledger[0].amount, -5);
    assert.equal(ledger[0].balanceAfter, 15);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: challenge.id, action: "challenge.created", actorUserId: success.row.id } }), 1);
    assert.equal(await prisma.activityEvent.count({ where: { challengeId: challenge.id, type: "challenge_created" } }), 1);
    pass("creation commits challenge, creator, linked escrow ledger, audit and activity together");

    const invalid = await player("invalid", 20);
    for (const body of [null, [], { title: 23 }, { title: " " }, { title: "Valid", stake: -1 }, { title: "Valid", stake: 0.5 },
      { title: "Valid", stake: "5" }, { title: "Valid", stake: Number.NaN }, { title: "Valid", stake: Number.POSITIVE_INFINITY },
      { title: "Valid", stake: 2_147_483_648 }, { title: "Valid", description: {} }, { title: "Valid", isPublic: "true" },
      { title: "Valid", deadline: "999999999999999999999999 hours" }]) {
      const rejected = await submit(invalid, body);
      assert.equal(rejected.status, 400, JSON.stringify({ body, rejected }));
    }
    assert.equal(await credits(invalid.row.id), 20);
    assert.equal(await prisma.challenge.count({ where: { creatorId: invalid.row.id } }), 0);
    assert.equal(await prisma.creditTx.count({ where: { userId: invalid.row.id } }), 0);
    if (invalid.context) {
      const malformed = await invalid.context.post("/api/challenges", { data: Buffer.from("{"), headers: { "Content-Type": "application/json" } });
      assert.equal(malformed.status(), 400);
      assert.deepEqual(await malformed.json(), { error: "Invalid JSON body" });
    }
    pass("malformed titles, bodies, stakes and field types reject before any credit mutation");

    const fault = await player("rollback", 20);
    const functionName = `verify_create_${runId}`;
    const triggerName = `verify_create_trigger_${runId}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled creation final write failure'; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "ActivityEvent" FOR EACH ROW WHEN (NEW."userId" = '${fault.row.id}' AND NEW.type = 'challenge_created') EXECUTE FUNCTION "${functionName}"()`);
      try {
        const rejected = await submit(fault, { title: "Controlled failure quest", stake: 5 });
        assert.equal(rejected.status, 500);
        assert(!JSON.stringify(rejected.body).includes("controlled creation final write failure"));
        assert.equal(await credits(fault.row.id), 20);
        assert.equal(await prisma.challenge.count({ where: { creatorId: fault.row.id } }), 0);
        assert.equal(await prisma.participant.count({ where: { userId: fault.row.id } }), 0);
        assert.equal(await prisma.creditTx.count({ where: { userId: fault.row.id } }), 0);
        assert.equal(await prisma.auditLog.count({ where: { actorUserId: fault.row.id } }), 0);
        assert.equal(await prisma.activityEvent.count({ where: { userId: fault.row.id } }), 0);
      } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "ActivityEvent"`); }
    } finally { await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`); }
    const recovered = await submit(fault, { title: "Recovered creation quest", stake: 5 });
    assert.equal(recovered.status, 201);
    assert.equal(await credits(fault.row.id), 15);
    assert.equal(await prisma.creditTx.count({ where: { userId: fault.row.id, type: "stake" } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { userId: fault.row.id, type: "refund" } }), 0);
    pass("last-write database failure rolls back all creation state; retry needs no compensating refund");

    const concurrent = await player("concurrent", 5);
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => submit(concurrent, { title: `Concurrent quest ${index}`, stake: 5 })));
    assert.equal(attempts.filter((result) => result.status === 201).length, 1, JSON.stringify(attempts));
    assert.equal(attempts.filter((result) => result.status === 402).length, 7);
    assert.equal(await credits(concurrent.row.id), 0);
    assert.equal(await prisma.challenge.count({ where: { creatorId: concurrent.row.id } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { userId: concurrent.row.id } }), 1);
    pass("eight concurrent creations with one affordable stake create exactly one funded quest");
    const free = await player("free", 0);
    const freeResult = await submit(free, { title: "Default free quest" });
    assert.equal(freeResult.status, 201);
    assert.equal(await credits(free.row.id), 0);
    assert.equal(await prisma.creditTx.count({ where: { userId: free.row.id } }), 0);
    pass("default zero-stake creation remains available without credits");
    console.log(JSON.stringify({ runId, passed, transport: http ? "actual authenticated Next.js HTTP" : "production creation service", players, retained: true }));
  } finally { await Promise.all(contexts.map((context) => context.dispose())); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
