import assert from "node:assert/strict";
import prisma from "../src/lib/db";
import { createQuizDuel, getQuizDuelView, QuizDuelError } from "../src/lib/quiz/quiz-duel";
import { answerCommitment, chooseQuestionIds, QUIZ_RULE_VERSION } from "../src/lib/quiz/quiz-bank";

// Deterministic contract test of actual production functions with a read fixture.
// This is NOT database/concurrency verification; the paired DB suite covers that.
async function main() {
  const originalRead = prisma.quizDuel.findUnique;
  const id = "quiz_contract_room_20261027", creator = "quiz_contract_creator_20261027", outsider = "quiz_contract_spectator_20261027";
  const ids = chooseQuestionIds("science");
  const fixture = {
    challengeId: id, topic: "science", invitedUserId: null, status: "live",
    bankVersion: QUIZ_RULE_VERSION, questionIds: JSON.stringify(ids), answerCommitment: answerCommitment(ids),
    expiresAt: new Date(Date.now() + 60_000), resultJson: null, winnerId: null, attempts: [],
    challenge: {
      id, creatorId: creator, description: "A shared, verifiable knowledge challenge.",
      title: "Fixture Quiz", status: "live", stake: 0, arbiter: QUIZ_RULE_VERSION,
      resolutionHash: null, deadline: new Date(Date.now() + 60_000), creator: { username: "creator" },
      participants: [
        { userId: creator, role: "creator", status: "accepted", user: { username: "creator" } },
        { userId: "quiz_contract_opponent_20261027", role: "opponent", status: "accepted", user: { username: "opponent" } },
        { userId: outsider, role: "spectator", status: "accepted", user: { username: "spectator" } },
      ],
    },
  };
  prisma.quizDuel.findUnique = (async () => fixture) as unknown as typeof originalRead;
  try {
    for (const status of ["open", "live", "completed", "cancelled"]) {
      fixture.status = status;
      const replay = await createQuizDuel(creator, { topic: "science", requestKey: "stable_contract_request_20261027" });
      assert.equal(replay.status, status, "An idempotent create replay must report the existing lifecycle state");
      assert.equal(replay.reused, true);
      assert.equal(replay.challengeId, id);
    }
    fixture.status = "live";
    await assert.rejects(() => getQuizDuelView(id, outsider),
      (error) => error instanceof QuizDuelError && error.statusCode === 403,
      "Accepted spectator must not be treated as a competitor and receive private questions");
    const view = await getQuizDuelView(id, creator);
    assert.equal(view.accepted, true);
    assert.equal(view.questions?.length, 3);
    console.log("PASS fullstack Quiz contracts: all four replay states, spectator denial, and accepted competitor access (read fixtures; no live DB claim)");
  } finally {
    prisma.quizDuel.findUnique = originalRead;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
