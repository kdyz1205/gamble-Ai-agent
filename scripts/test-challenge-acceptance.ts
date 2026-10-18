import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { acceptChallenge, acceptChallengeAtomic, persistSharedLiveTask } from "../src/lib/challenge-acceptance";
import { executeAgentTool } from "../src/lib/agent/tools";
import { emptyDraftState } from "../src/lib/agent/types";

async function main() {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "postgresql://missing").hostname), "Requires an explicit isolated local test database");
  const run = randomUUID().replaceAll("-", "");
  const savedAI = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "false";
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const functionName = `acceptance_failure_${run}`;
  const creditTrigger = `acceptance_credit_${run}`;
  const auditTrigger = `acceptance_audit_${run}`;
  async function player(label: string, credits = 100) {
    const user = await prisma.user.create({ data: { email: `${label}-${run}@example.invalid`, username: `${label}_${run}`, credits } });
    userIds.push(user.id); return user;
  }
  const creator = await player("creator");
  async function quest(label: string, stake = 7, maxParticipants = 2, status = "open") {
    const row = await prisma.challenge.create({ data: {
      creatorId: creator.id, title: `Acceptance ${label}`, type: "General", stake, maxParticipants, status,
      rules: "Original agreed rules remain intact.",
      participants: { create: { userId: creator.id, role: "creator", status: "accepted" } },
    } });
    challengeIds.push(row.id); return row;
  }
  const balance = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })).credits;
  try {
    const opponents = await Promise.all(Array.from({ length: 8 }, (_, i) => player(`opponent${i}`)));
    const raced = await quest("seat race");
    const results = await Promise.all(opponents.map((user) => acceptChallengeAtomic(raced.id, user.id)));
    assert.equal(results.filter((result) => result.ok).length, 1);
    const winnerIndex = results.findIndex((result) => result.ok);
    const winner = opponents[winnerIndex];
    const allSeats = await prisma.participant.findMany({ where: { challengeId: raced.id } });
    assert.equal(allSeats.length, 2);
    assert.equal(allSeats.filter((row) => row.status === "accepted").length, 2);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: raced.id } })).status, "live");
    for (const user of opponents) assert.equal(await balance(user.id), user.id === winner.id ? 93 : 100);
    const stakeRows = await prisma.creditTx.findMany({ where: { challengeId: raced.id } });
    assert.equal(stakeRows.length, 1); assert.equal(stakeRows[0].amount, -7); assert.equal(stakeRows[0].balanceAfter, 93);
    assert.equal(await prisma.auditLog.count({ where: { challengeId: raced.id, action: "challenge.accepted" } }), 1);
    assert.equal(await prisma.activityEvent.count({ where: { challengeId: raced.id, type: "challenge_accepted" } }), 1);
    console.log("PASS eight different opponents race for one seat: one accepted, seven unchanged balances, one debit/ledger/audit/event, status live");

    const retries = await Promise.all(Array.from({ length: 8 }, () => acceptChallengeAtomic(raced.id, winner.id)));
    for (const result of retries) { assert(result.ok); assert.equal(result.reused, true); assert.equal(result.creditsDebited, 0); assert.equal(result.transitionedToLive, false); }
    const toolRetry = await executeAgentTool("acceptChallenge", { userId: winner.id, baseUrl: "http://localhost", draftState: emptyDraftState() }, { challengeId: raced.id });
    assert.equal(toolRetry.ok, true);
    assert.equal((toolRetry.data as { reused: boolean }).reused, true);
    assert.equal(await balance(winner.id), 93);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: raced.id } }), 1);
    console.log("PASS eight same-user retries and agent-tool retry reuse accepted seat without a second stake or task");

    const pending = await quest("reserved invite");
    const invitation = await prisma.participant.create({ data: { challengeId: pending.id, userId: opponents[0].id, role: "opponent", status: "pending" } });
    const blocked = await acceptChallengeAtomic(pending.id, opponents[1].id);
    assert(!blocked.ok && blocked.status === 409);
    const invitedBalance = await balance(opponents[0].id);
    const invited = await acceptChallengeAtomic(pending.id, opponents[0].id);
    assert(invited.ok); assert.equal(invited.participantId, invitation.id); assert.equal(invited.challenge.status, "live");
    assert.equal(await balance(opponents[0].id), invitedBalance - 7);
    assert.equal(await prisma.participant.count({ where: { challengeId: pending.id } }), 2);
    const group = await quest("pending group", 0, 3);
    await prisma.participant.create({ data: { challengeId: group.id, userId: opponents[1].id, role: "opponent", status: "pending" } });
    const third = await acceptChallengeAtomic(group.id, opponents[2].id);
    assert(third.ok); assert.equal(third.challenge.status, "open", "pending reservations cannot start live play before acceptance");
    const finalInvite = await acceptChallengeAtomic(group.id, opponents[1].id);
    assert(finalInvite.ok); assert.equal(finalInvite.challenge.status, "live");
    console.log("PASS reserved pending invites exclude strangers, upgrade the original row and only fully accepted groups become live");

    const closed = await quest("closed", 7, 2, "cancelled");
    const missing = await acceptChallengeAtomic(`missing_${run}`, winner.id);
    assert(!missing.ok && missing.status === 404);
    const own = await acceptChallengeAtomic(closed.id, creator.id);
    assert(!own.ok && own.error.includes("own challenge"));
    const closedResult = await acceptChallengeAtomic(closed.id, winner.id);
    assert(!closedResult.ok && closedResult.status === 400);
    const poor = await player("poor", 0); const paid = await quest("insufficient");
    const insufficient = await acceptChallengeAtomic(paid.id, poor.id);
    assert(!insufficient.ok && insufficient.status === 402 && insufficient.balance === 0);
    assert.equal(await prisma.participant.count({ where: { challengeId: paid.id } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: paid.id } }), 0);
    const expired = await quest("expired open");
    await prisma.challenge.update({ where: { id: expired.id }, data: { deadline: new Date(Date.now() - 60_000) } });
    const beforeExpired = await balance(winner.id);
    const expiredResult = await acceptChallengeAtomic(expired.id, winner.id);
    assert(!expiredResult.ok && expiredResult.status === 409);
    assert.equal(await balance(winner.id), beforeExpired);
    assert.equal(await prisma.participant.count({ where: { challengeId: expired.id } }), 1);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: expired.id } }), 0);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: expired.id } })).status, "open");
    console.log("PASS creator, missing, closed, expired-open and insufficient-credit requests create no seat or debit");

    const sameUserQuest = await quest("same-user first acceptance");
    const sameUser = await player("same_user", 7);
    const sameAttempts = await Promise.all(Array.from({ length: 8 }, () => acceptChallengeAtomic(sameUserQuest.id, sameUser.id)));
    assert.equal(sameAttempts.filter((attempt) => attempt.ok && !attempt.reused).length, 1);
    assert.equal(sameAttempts.filter((attempt) => attempt.ok && attempt.reused).length, 7);
    assert.equal(await balance(sameUser.id), 0);
    assert.equal(await prisma.creditTx.count({ where: { challengeId: sameUserQuest.id } }), 1);
    assert.equal(await prisma.participant.count({ where: { challengeId: sameUserQuest.id } }), 2);
    console.log("PASS eight simultaneous first accepts by one user create one seat and one debit even with only one stake available");

    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected acceptance write failure'; END; $$`);
    const rollback = await quest("write rollback");
    assert.match(rollback.id, /^[a-z0-9]+$/i);
    for (const [table, trigger] of [["CreditTx", creditTrigger], ["AuditLog", auditTrigger]] as const) {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "${table}" FOR EACH ROW WHEN (NEW."challengeId" = '${rollback.id}') EXECUTE FUNCTION "${functionName}"()`);
      const before = await balance(winner.id);
      await assert.rejects(() => acceptChallengeAtomic(rollback.id, winner.id), /Injected acceptance write failure/);
      assert.equal(await balance(winner.id), before);
      assert.equal(await prisma.participant.count({ where: { challengeId: rollback.id } }), 1);
      assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: rollback.id } })).status, "open");
      assert.equal(await prisma.creditTx.count({ where: { challengeId: rollback.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { challengeId: rollback.id } }), 0);
      assert.equal(await prisma.activityEvent.count({ where: { challengeId: rollback.id } }), 0);
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${trigger}" ON "${table}"`);
    }
    console.log("PASS real ledger and post-seat audit trigger failures roll back balances, seats, status, ledger and events together");

    const taskQuest = await quest("task CAS", 0);
    const acceptedTask = await acceptChallengeAtomic(taskQuest.id, winner.id); assert(acceptedTask.ok);
    assert.equal(await persistSharedLiveTask(acceptedTask.challenge, winner.id, "What is 2 + 2?"), true);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: taskQuest.id } })).rules, "Original agreed rules remain intact.\n\nShared live task: What is 2 + 2?");
    assert.equal(await persistSharedLiveTask(acceptedTask.challenge, winner.id, "Second task?"), false);
    const edited = await quest("concurrent rules edit", 0);
    const acceptedEdit = await acceptChallengeAtomic(edited.id, winner.id); assert(acceptedEdit.ok);
    await prisma.challenge.update({ where: { id: edited.id }, data: { rules: "Newly agreed rules" } });
    assert.equal(await persistSharedLiveTask(acceptedEdit.challenge, winner.id, "What is 2 + 2?"), false);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: edited.id } })).rules, "Newly agreed rules");
    const quiz = await quest("math quiz", 0);
    const quizAccepted = await acceptChallenge(quiz.id, winner.id); assert(quizAccepted.ok);
    const quizReplay = await acceptChallenge(quiz.id, winner.id); assert(quizReplay.ok && quizReplay.reused);
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: quiz.id } })).rules, quiz.rules);
    assert.equal(await prisma.auditLog.count({ where: { actorUserId: { in: userIds }, action: "ai.call.reserved" } }), 0);
    console.log("PASS shared tasks append agreed rules once, reject concurrent edits, and disabled optional AI never blocks acceptance or runs on retries");
    console.log(JSON.stringify({ run, opponents: 8, accepted: 1, stakeDebit: 7, winnerBalanceAfterRace: 93, paidAiCalls: 0 }));
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${creditTrigger}" ON "CreditTx"`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${auditTrigger}" ON "AuditLog"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    await prisma.auditLog.deleteMany({ where: { OR: [{ challengeId: { in: challengeIds } }, { actorUserId: { in: userIds } }] } });
    await prisma.activityEvent.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.creditTx.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (savedAI === undefined) delete process.env.AI_ENABLED; else process.env.AI_ENABLED = savedAI;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
