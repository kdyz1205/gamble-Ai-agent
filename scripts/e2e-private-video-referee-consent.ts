/**
 * Isolated, deterministic REFEREE WIRING fixture — never a model-accuracy test.
 *
 * Actual private S3 video -> SHA-256 checked SDK -> FFmpeg JPEG frames ->
 * locally mocked OpenAI-compatible vision HTTP -> persisted recommended
 * winner -> two participant consents -> zero-stake settlement.
 *
 * No network AI provider, no real money, no XP or Summon mint.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import prisma from "../src/lib/db";
import { verifyTrustedEvidenceObject } from "../src/lib/media/trusted-evidence-storage";
import { getProviderById } from "../src/lib/llm-providers";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";
import { recordVerdictDecision, VerdictDecision } from "../src/lib/verdict-review";
import { reconcileVerifiedQuestProfessionXp } from "../src/lib/summons/server-ledger";
import { assessTrustedQuestXpForManualReview } from "../src/lib/summons/trusted-xp-audit";
import { AI_RECEIPT_ACTION, AI_RESERVATION_ACTION } from "../src/lib/ai-governance";

function assertIsolated() {
  const db = new URL(process.env.DATABASE_URL || "postgresql://invalid/none");
  assert.ok(["localhost", "127.0.0.1"].includes(db.hostname) &&
    db.pathname === "/summoner_verification", "Disposable PostgreSQL only");
  assert.equal(process.env.S3_TRUSTED_EVIDENCE_BUCKET, "ci-private-evidence");
  assert.equal(process.env.S3_TRUSTED_EVIDENCE_ENDPOINT, "http://127.0.0.1:9000");
  assert.equal(process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS, "true");
  assert.equal(process.env.TRUSTED_EVIDENCE_REQUIRED_FOR_MEDIA, "true");
  assert.equal(process.env.AI_ENABLED, "false", "Server/main CI must default AI OFF");
  assert.notEqual(process.env.SUMMON_PERSISTENCE_ENABLED, "true");
  assert.notEqual(process.env.SUMMON_TICKETS_ENABLED, "true");
  assert.ok(!process.env.SERVER_PRIVATE_KEY && !process.env.USAGE_TOKEN_ADDRESS,
    "CI must never include a chain wallet or token");
}

async function generateVideo(directory: string, color: "blue" | "red") {
  assert.ok(ffmpegPath);
  const file = join(directory, color + ".mp4");
  execFileSync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=${color}:s=320x180:r=15:d=2`,
    "-c:v", "mpeg4", "-q:v", "4", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", file,
  ], { timeout: 30_000 });
  const bytes = await readFile(file);
  assert.ok(bytes.length > 1024 && bytes.toString("ascii", 4, 8) === "ftyp");
  return bytes;
}

async function colorFromEncodedImage(dataUri: string): Promise<"red" | "blue" | "unknown"> {
  assert.match(dataUri, /^data:image\/jpeg;base64,/);
  const pixels = Buffer.from(dataUri.split(",")[1], "base64");
  const stats = await sharp(pixels).stats();
  const red = stats.channels[0]?.mean ?? 0;
  const blue = stats.channels[2]?.mean ?? 0;
  if (blue > red + 30) return "blue";
  if (red > blue + 30) return "red";
  return "unknown";
}

async function main() {
  assertIsolated();
  const previousAi = process.env.AI_ENABLED;
  const previousKey = process.env.OPENAI_API_KEY;
  const provider = getProviderById("openai");
  assert.ok(provider && provider.kind === "openai_compat");
  const originalBase = provider.baseUrl;
  const folder = await mkdtemp(join(tmpdir(), "sum-mocked-referee-"));
  const store = new S3Client({
    region: process.env.AWS_REGION!,
    endpoint: process.env.S3_TRUSTED_EVIDENCE_ENDPOINT!,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 15);
  const mediaKeys: string[] = [];
  const people: string[] = [];
  let challengeId: string | null = null;
  let replayQuestId: string | null = null;
  let fixtureCalls = 0;
  let frameColors: string[] = [];
  const fixtureServer = createServer(async (req, res) => {
    try {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/chat/completions");
      assert.equal(req.headers.authorization, "Bearer ci-local-stub");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        model: string;
        messages: Array<{ role: string; content: unknown }>;
      };
      assert.equal(payload.model, "gpt-4o-mini");
      const userMessage = payload.messages.find(m => m.role === "user");
      assert.ok(userMessage && Array.isArray(userMessage.content));
      const parts = userMessage.content as Array<{
        type: string; text?: string; image_url?: { url: string };
      }>;
      const prose = parts.filter(p => p.type === "text").map(p => p.text).join(" ");
      assert.ok(prose.includes("server-verified private object"));
      assert.ok(!/X-Amz-|S3_TRUSTED|ci-private-evidence|127\.0\.0\.1:9000/i.test(prose),
        "Provider text leaked private storage authority");
      const frames = parts.filter(p => p.type === "image_url");
      assert.ok(frames.length >= 2, "Must transmit actual decoded frames for both players");
      const colors = await Promise.all(frames.map(f => colorFromEncodedImage(f.image_url?.url || "")));
      frameColors = colors;
      assert.ok(colors.includes("blue") && colors.includes("red"),
        "Model fixture must see blue and red videos, not claims/descriptions");
      assert.equal(colors[0], "blue", "First participant's first frame must be blue");
      assert.equal(colors[colors.length - 1], "red", "Second participant's last frame must be red");
      fixtureCalls++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          winner: "A",
          confidence: 0.96,
          reasoning: "CI fixture: blue A and red B were decoded as images. Simulated outcome; not AI model accuracy.",
        }) } }],
        usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
      }));
    } catch (error) {
      // Keep the test failure visible without leaking any storage secrets.
      res.statusCode = 422;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: error instanceof Error ? error.name : "FixtureRejected" }));
    }
  });

  try {
    const creator = await prisma.user.create({ data: {
      username: "fixture_blue_" + suffix,
      email: "fixture_blue_" + suffix + "@example.invalid",
      credits: 10,
    } });
    const opponent = await prisma.user.create({ data: {
      username: "fixture_red_" + suffix,
      email: "fixture_red_" + suffix + "@example.invalid",
      credits: 10,
    } });
    people.push(creator.id, opponent.id);
    const beforeBalances = await prisma.user.findMany({
      where: { id: { in: people } },
      select: { id: true, credits: true },
      orderBy: { id: "asc" },
    });
    const quest = await prisma.challenge.create({ data: {
      creatorId: creator.id,
      title: "CI colored video referee " + suffix,
      type: "Fitness",
      rules: "CI fixture only: blue clip is player A, red clip is player B. Do not interpret as a real fitness competition.",
      evidenceType: "video",
      stake: 0,
      status: "judging",
      participants: { create: [
        { userId: creator.id, role: "creator", status: "accepted" },
        { userId: opponent.id, role: "opponent", status: "accepted" },
      ] },
    } });
    challengeId = quest.id;
    const pairs = [
      { userId: creator.id, color: "blue" as const },
      { userId: opponent.id, color: "red" as const },
    ];
    for (const participant of pairs) {
      const video = await generateVideo(folder, participant.color);
      const key = `trusted-evidence/${quest.id}/${participant.userId}/${randomUUID()}`;
      mediaKeys.push(key);
      await store.send(new PutObjectCommand({
        Bucket: "ci-private-evidence", Key: key,
        ContentType: "video/mp4", Body: video,
      }));
      const verified = await verifyTrustedEvidenceObject({
        key, contentType: "video/mp4", expectedSizeBytes: video.length,
      });
      assert.equal(verified.sha256, createHash("sha256").update(video).digest("hex"));
      const evidence = await prisma.evidence.create({ data: {
        challengeId: quest.id, userId: participant.userId,
        type: "video", description: "CI synthetic " + participant.color + " demonstration",
        url: null,
      } });
      await prisma.trustedEvidenceUpload.create({ data: {
        id: randomUUID(),
        challengeId: quest.id,
        userId: participant.userId,
        evidenceId: evidence.id,
        objectKey: key,
        contentType: "video/mp4",
        expectedSizeBytes: video.length,
        observedSizeBytes: video.length,
        sha256: verified.sha256,
        status: "consumed",
        expiresAt: new Date(Date.now() + 60 * 60_000),
        verifiedAt: new Date(),
        consumedAt: new Date(),
      } });
    }

    fixtureServer.listen(0, "127.0.0.1");
    await once(fixtureServer, "listening");
    const addr = fixtureServer.address();
    assert.ok(addr && typeof addr !== "string");
    provider.baseUrl = `http://127.0.0.1:${addr.port}`;
    process.env.OPENAI_API_KEY = "ci-local-stub";
    process.env.AI_ENABLED = "true"; // This node process ONLY; never Vercel or Next server.

    // A normal live provider is NOT used; all HTTP goes to the private mock.
    const verdict = await executeChallengeJudgment(quest.id, 1, {
      providerId: "openai", model: "gpt-4o-mini",
    });
    assert.equal(verdict.ok, true,
      verdict.ok ? "" : "Mock judge refused: " + ("error" in verdict ? verdict.error : "skipped"));
    if (!verdict.ok) throw new Error("unreachable");
    assert.equal(verdict.judgment.winnerId, creator.id);
    assert.ok((verdict.judgment.confidence ?? 0) >= 0.85);
    assert.equal(verdict.creditsUsed, 0);
    assert.equal(fixtureCalls, 1);
    assert.ok(frameColors.includes("blue") && frameColors.includes("red"));

    const firstState = await prisma.challenge.findUniqueOrThrow({
      where: { id: quest.id }, select: { status: true },
    });
    assert.equal(firstState.status, "disputed", "Recommendation is not settlement");
    assert.equal(await prisma.judgment.count({ where: { challengeId: quest.id } }), 1);
    assert.equal(await prisma.professionXpEvent.count({ where: { challengeId: quest.id } }), 0);

    const retry = await executeChallengeJudgment(quest.id, 1, {
      providerId: "openai", model: "gpt-4o-mini",
    });
    assert.equal(retry.ok, false, "Rejudge must not duplicate the same winner");
    assert.equal(fixtureCalls, 1, "Idempotent retries cannot repeat inference");

    const aConsent = await recordVerdictDecision({
      challengeId: quest.id, userId: creator.id,
      decision: VerdictDecision.accepted,
    });
    assert.equal(aConsent.settled, false, "One acceptance is not consensus");
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: quest.id } })).status, "disputed");
    assert.equal(await prisma.professionXpEvent.count({ where: { challengeId: quest.id } }), 0);

    const bConsent = await recordVerdictDecision({
      challengeId: quest.id, userId: opponent.id,
      decision: VerdictDecision.accepted,
    });
    assert.equal(bConsent.settled, true, "Both accepted fixtures must settle");
    assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: quest.id } })).status, "settled");
    const settledRetry = await recordVerdictDecision({
      challengeId: quest.id, userId: opponent.id,
      decision: VerdictDecision.accepted,
    });
    assert.equal(settledRetry.settled, true, "Settled retry should be read-only");

    const balances = await prisma.user.findMany({
      where: { id: { in: people } },
      select: { id: true, credits: true }, orderBy: { id: "asc" },
    });
    assert.deepEqual(balances, beforeBalances,
      "No zero-stake fake money transfers allowed");
    assert.equal(await prisma.creditTx.count({ where: { challengeId: quest.id } }), 0);
    const usage = await prisma.auditLog.findMany({
      where: { challengeId: quest.id, action: {
        in: [AI_RESERVATION_ACTION, AI_RECEIPT_ACTION],
      } },
    });
    assert.equal(usage.filter(row => row.action === AI_RESERVATION_ACTION).length, 1);
    assert.equal(usage.filter(row => row.action === AI_RECEIPT_ACTION).length, 1);

    // Settled does NOT authorize XP or a creature until an independent
    // anti-farming gate is reviewed and feature flags deliberately enabled.
    const audit = await assessTrustedQuestXpForManualReview({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(audit.admittedForManualReview, true, audit.blockers.join(","));
    assert.equal(audit.xpGranted, false,
      "A read-only eligibility report must never grant XP");
    assert.equal(audit.ticketsGranted, 0);
    assert.equal(audit.ownedSummonsGranted, 0);

    // Even a settled record must never enter an XP review queue while an
    // appeal/review is open. Simulate a recovery boundary without awarding.
    await prisma.reviewCase.create({ data: {
      challengeId: quest.id,
      requestedByUserId: opponent.id,
      originalJudgmentId: verdict.judgment.id,
      reason: "CI pending appeal should block all progression",
      status: "pending",
      expiresAt: new Date(Date.now() + 3600_000),
    } });
    const pendingAudit = await assessTrustedQuestXpForManualReview({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(pendingAudit.admittedForManualReview, false);
    assert.ok(pendingAudit.blockers.includes("unresolved_review_case"));
    await prisma.reviewCase.delete({ where: { challengeId: quest.id } });

    // An attacker cannot replay the same video into another Quest to farm
    // multiple profession receipts. Query the REAL private-upload database.
    const replayQuest = await prisma.challenge.create({ data: {
      creatorId: creator.id,
      title: "CI duplicated media " + suffix,
      type: "Fitness", evidenceType: "video", stake: 0, status: "live",
    } });
    replayQuestId = replayQuest.id;
    const identicalVideo = await readFile(join(folder, "blue.mp4"));
    const replayKey = `trusted-evidence/${replayQuest.id}/${creator.id}/${randomUUID()}`;
    mediaKeys.push(replayKey);
    await store.send(new PutObjectCommand({
      Bucket: "ci-private-evidence", Key: replayKey,
      Body: identicalVideo, ContentType: "video/mp4",
    }));
    const replayReceipt = await verifyTrustedEvidenceObject({
      key: replayKey, contentType: "video/mp4",
      expectedSizeBytes: identicalVideo.length,
    });
    const duplicateEvidence = await prisma.evidence.create({ data: {
      challengeId: replayQuest.id, userId: creator.id,
      type: "video", description: "CI test cross-Quest byte replay",
      url: null,
    } });
    await prisma.trustedEvidenceUpload.create({ data: {
      id: randomUUID(), challengeId: replayQuest.id,
      evidenceId: duplicateEvidence.id, userId: creator.id,
      objectKey: replayKey, status: "consumed", contentType: "video/mp4",
      sha256: replayReceipt.sha256,
      expectedSizeBytes: identicalVideo.length,
      observedSizeBytes: identicalVideo.length,
      verifiedAt: new Date(), consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
    } });
    const rejectedReplayAudit = await assessTrustedQuestXpForManualReview({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(rejectedReplayAudit.admittedForManualReview, false);
    assert.ok(rejectedReplayAudit.blockers.includes("media_replay_across_quests"));
    assert.equal(rejectedReplayAudit.xpGranted, false);
    await prisma.challenge.delete({ where: { id: replayQuest.id } });
    replayQuestId = null;
    const recoveredAdmission = await assessTrustedQuestXpForManualReview({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(recoveredAdmission.admittedForManualReview, true,
      "Removing the reused-media challenge should restore review eligibility");

    await assert.rejects(
      () => reconcileVerifiedQuestProfessionXp({ challengeId: quest.id, userId: creator.id }),
      /disabled/i,
    );
    assert.equal(await prisma.professionXpEvent.count({ where: { challengeId: quest.id } }), 0);
    assert.equal(await prisma.summonTicket.count({ where: { ownerId: { in: people } } }), 0);
    assert.equal(await prisma.summonInstance.count({ where: { ownerId: { in: people } } }), 0);
    console.log(JSON.stringify({
      result: "PASS",
      fixture: "controlled_local_model_only",
      actualPrivateMP4s: 2,
      serverVerifiedColors: ["blue", "red"],
      submittedVisionFrames: frameColors.length,
      mockInferenceRequests: fixtureCalls,
      recommendationWinner: "A",
      confirmationCount: 2,
      committedSettlement: true,
      duplicatedJudgments: 0,
      creditMovement: 0,
      xpAwards: 0,
      trustedXpAdmission: "review_candidate_only",
      replayedVideoBlockedFromXp: true,
      pendingAppealBlockedFromXp: true,
      ownedSummons: 0,
      modelAccuracyClaim: false,
    }));
  } finally {
    process.env.AI_ENABLED = previousAi;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    provider.baseUrl = originalBase;
    fixtureServer.closeAllConnections();
    if (fixtureServer.listening) {
      await new Promise<void>(resolve => fixtureServer.close(() => resolve()));
    }
    for (const key of mediaKeys) {
      await store.send(new DeleteObjectCommand({
        Bucket: "ci-private-evidence", Key: key,
      })).catch(() => {});
    }
    if (replayQuestId) {
      await prisma.challenge.delete({ where: { id: replayQuestId } }).catch(() => {});
    }
    if (challengeId) {
      await prisma.auditLog.deleteMany({ where: { challengeId } }).catch(() => {});
      await prisma.activityEvent.deleteMany({ where: { challengeId } }).catch(() => {});
      await prisma.challenge.delete({ where: { id: challengeId } }).catch(() => {});
    }
    if (people.length > 0) {
      await prisma.auditLog.deleteMany({ where: {
        OR: [{ actorUserId: { in: people } }, { targetUserId: { in: people } }],
      } }).catch(() => {});
      await prisma.activityEvent.deleteMany({ where: { userId: { in: people } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: people } } }).catch(() => {});
    }
    await prisma.$disconnect();
    store.destroy();
    await rm(folder, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
