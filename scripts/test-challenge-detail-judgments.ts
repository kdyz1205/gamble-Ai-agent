import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import prisma from "../src/lib/db";
import { GET } from "../src/app/api/challenges/[id]/route";
import ResultReceiptCard from "../src/components/ResultReceiptCard";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/summoner_verification");
  const run = randomUUID().replaceAll("-", "");
  const players = await Promise.all(["a", "b"].map(label => prisma.user.create({ data: {
    email: `detail-${label}-${run}@example.invalid`, username: `detail_${label}_${run}`, credits: 100,
  } })));
  let challengeId: string | undefined;
  try {
    const challenge = await prisma.challenge.create({ data: {
      title: `Explicit review display fixture ${run}`, creatorId: players[0].id, type: "General", status: "disputed", isPublic: false,
      participants: { create: players.map((user, index) => ({ userId: user.id, role: index === 0 ? "creator" : "opponent", status: "accepted" })) },
    } });
    challengeId = challenge.id;
    const original = await prisma.judgment.create({ data: {
      challengeId, method: "rules", status: "completed", winnerId: players[0].id, confidence: 0.85,
      reasoning: "Explicit completed recommendation fixture; not a model judgment.", createdAt: new Date(Date.now() - 5_000),
    } });
    const processing = await prisma.judgment.create({ data: {
      challengeId, method: "manual", status: "pending", winnerId: players[1].id, confidence: 1,
      reasoning: "Explicit unfinished review decision fixture.", createdAt: new Date(Date.now() - 1_000),
    } });
    await prisma.judgment.create({ data: { challengeId, method: "ai", status: "failed", reasoning: "Explicit failed provider fixture.", createdAt: new Date() } });
    const review = await prisma.reviewCase.create({ data: {
      challengeId, originalJudgmentId: original.id, finalJudgmentId: processing.id,
      status: "processing", resolution: "override", resolvedWinnerId: players[1].id,
      reason: "Explicit interrupted-review display fixture.", expiresAt: new Date(Date.now() + 86_400_000),
    } });
    const read = async (id = challengeId!) => GET(new NextRequest(`http://localhost/api/challenges/${id}`), { params: Promise.resolve({ id }) });
    const first = await read(); assert.equal(first.status, 200);
    const initial = (await first.json()).challenge.judgments;
    assert.deepEqual(initial.map((row: { id: string }) => row.id), [original.id]);
    assert.equal(initial[0].winnerId, players[0].id);
    console.log("PASS actual challenge GET never exposes pending manual or failed judgments as the current recommendation");
    await prisma.challenge.update({ where: { id: challengeId }, data: { status: "settled" } });
    const unfinished = (await (await read()).json()).challenge;
    assert.equal(unfinished.reviewCase.status, "processing");
    assert.deepEqual(unfinished.judgments, []);
    console.log("PASS interrupted post-settlement review cannot display an older, conflicting winner");
    await prisma.$transaction([
      prisma.judgment.update({ where: { id: processing.id }, data: { status: "completed" } }),
      prisma.reviewCase.update({ where: { id: review.id }, data: { status: "resolved", resolvedAt: new Date() } }),
    ]);
    const detail = (await (await read()).json()).challenge;
    const final = detail.judgments;
    assert.deepEqual(final.map((row: { id: string }) => row.id), [processing.id, original.id]);
    assert.equal(final[0].winnerId, players[1].id);
    const receipt = renderToStaticMarkup(createElement(ResultReceiptCard, { challenge: detail, judgment: final[0], shareUrl: "http://localhost/qa-review-receipt" }));
    assert.match(receipt, /Human reviewer/);
    assert.match(receipt, /Human review/);
    assert.match(receipt, /Review notes/);
    assert.doesNotMatch(receipt, />100%<|>Confidence<|>AI Familiar</);
    assert.equal((await read(`missing_${run}`)).status, 404);
    assert.deepEqual((await prisma.user.findMany({ where: { id: { in: players.map(player => player.id) } }, select: { credits: true } })).map(row => row.credits), [100, 100]);
    assert.equal(await prisma.creditTx.count({ where: { userId: { in: players.map(player => player.id) } } }), 0);
    console.log("PASS completed manual result becomes visible; missing challenge remains404 and all reads preserve balances");
    console.log("PASS actual receipt component renders human review notes without fabricated model confidence");
  } finally {
    if (challengeId) await prisma.reviewCase.deleteMany({ where: { challengeId } });
    if (challengeId) await prisma.challenge.delete({ where: { id: challengeId } });
    await prisma.user.deleteMany({ where: { id: { in: players.map(player => player.id) } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
