import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { createQuizDuel, acceptQuizDuel, getQuizDuelView, submitQuizAnswers, QuizDuelError } from "../src/lib/quiz/quiz-duel";
import { revealQuizAnswers } from "../src/lib/quiz/quiz-bank";
import { cancelChallengeAtomic } from "../src/lib/challenge-cancellation";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification",
  "Fullstack regression fixtures require isolated local summoner_verification; never production");
const suffix = randomUUID().replaceAll("-", "");
const userIds: string[] = [], challengeIds: string[] = [];
let checks = 0;
const eq = (actual: unknown, expected: unknown, reason: string) => { assert.deepEqual(actual, expected, reason); checks++; };
const rejected = async (operation: () => Promise<unknown>, reason: string) => {
  await assert.rejects(operation, (error) => error instanceof QuizDuelError && error.statusCode === 403, reason); checks++;
};
async function main() {
  const players = [];
  for (const role of ["creator", "opponent", "spectator"]) {
    const user = await prisma.user.create({ data: { email: `fullstack-${role}-${suffix}@example.invalid`, username: `fs_${role}_${suffix}`, credits: 35 } });
    userIds.push(user.id); players.push(user);
  }
  const [creator, opponent, spectator] = players;
  const balances = () => prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, credits: true, totalCreditsWon: true, totalCreditsLost: true }, orderBy: { id: "asc" } });
  const before = await balances();
  const input = { topic: "science", requestKey: randomUUID(), stakeCredits: 0 };
  const created = await createQuizDuel(creator.id, input);
  challengeIds.push(created.challengeId);
  eq(created.status, "open", "New creation has the actual open status");
  eq((await createQuizDuel(creator.id, input)).status, "open", "Unjoined replay remains open");
  await acceptQuizDuel(created.challengeId, opponent.id);
  const liveReplay = await createQuizDuel(creator.id, input);
  eq(liveReplay.status, "live", "Replaying creation after acceptance must not falsely reopen the room");
  eq(liveReplay.challengeId, created.challengeId, "Replay still targets the exact committed room");
  eq(liveReplay.reused, true, "Live replay does not create a duplicate invitation");
  await prisma.participant.create({ data: { challengeId: created.challengeId, userId: spectator.id, role: "spectator", status: "accepted" } });
  await rejected(() => getQuizDuelView(created.challengeId, spectator.id), "Accepted spectator must not receive live questions or player-only state");
  const live = await getQuizDuelView(created.challengeId, creator.id);
  assert(live.questions); checks++;
  const answers = revealQuizAnswers(live.questions.map((q) => q.id)).map((q) => q.answer);
  await submitQuizAnswers(created.challengeId, creator.id, answers);
  await submitQuizAnswers(created.challengeId, opponent.id, answers);
  const completeReplay = await createQuizDuel(creator.id, input);
  eq(completeReplay.status, "completed", "Post-game retry must preserve the completed state");
  eq(completeReplay.challengeId, created.challengeId, "Completed replay cannot create a new game");
  await rejected(() => getQuizDuelView(created.challengeId, spectator.id), "Spectator cannot receive sealed post-game player receipts");
  eq((await getQuizDuelView(created.challengeId, creator.id)).status, "completed", "Actual competitor retains verified result access");
  eq(await prisma.judgment.count({ where: { challengeId: created.challengeId } }), 1, "Replays never duplicate the final judgment");
  const cancelledInput = { topic: "math", requestKey: randomUUID(), stakeCredits: 0 };
  const pending = await createQuizDuel(creator.id, cancelledInput);
  challengeIds.push(pending.challengeId);
  assert.equal((await cancelChallengeAtomic(pending.challengeId, creator.id)).ok, true); checks++;
  const cancelledReplay = await createQuizDuel(creator.id, cancelledInput);
  eq(cancelledReplay.status, "cancelled", "Cancelled creation replay must not report an open invitation");
  eq(cancelledReplay.reused, true, "Cancellation retry remains idempotent");
  eq(await prisma.quizDuel.count({ where: { challengeId: { in: challengeIds } } }), 2, "Only the two intended games exist");
  eq(await prisma.creditTx.count({ where: { challengeId: { in: challengeIds } } }), 0, "No credit transfer from retries, spectator denial or result read");
  eq(await balances(), before, "All fixture balances are unchanged");
  console.log(`FULLSTACK_BACKEND_REGRESSIONS_PASS ${checks} checks: truthful create replay, private competitor-only questions/receipts, unchanged balances, once-only judgment`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const id of challengeIds) await prisma.challenge.deleteMany({ where: { id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
