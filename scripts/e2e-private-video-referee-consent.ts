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
import bcrypt from "bcryptjs";
import { chromium, type Browser } from "@playwright/test";
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import prisma from "../src/lib/db";
import { verifyTrustedEvidenceObject } from "../src/lib/media/trusted-evidence-storage";
import { getProviderById } from "../src/lib/llm-providers";
import { executeChallengeJudgment } from "../src/lib/challenge-judgment";
import { recordVerdictDecision, VerdictDecision } from "../src/lib/verdict-review";
import { reconcileVerifiedQuestProfessionXp } from "../src/lib/summons/server-ledger";
import { reconcileFreeCareerTickets } from "../src/lib/summons/free-ticket-ledger";
import { redeemFreeSummonTicket, readOwnedFreeDrawInventory } from "../src/lib/summons/free-draw-ledger";
import {
  approveTrustedQuestXpForReview,
  revokeTrustedQuestXpReview,
} from "../src/lib/summons/manual-xp-approval";
import { assessTrustedQuestXpForManualReview } from "../src/lib/summons/trusted-xp-audit";
import { readMyQuestXpStatus } from "../src/lib/summons/quest-xp-status";
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
  const priorPersistence = process.env.SUMMON_PERSISTENCE_ENABLED;
  const priorManualReview = process.env.SUMMON_XP_MANUAL_REVIEW_ENABLED;
  const priorTicketFlag = process.env.SUMMON_TICKETS_ENABLED;
  const priorDrawFlag = process.env.SUMMON_DRAWS_ENABLED;
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
  let mobileBrowser: Browser | null = null;
  const mobilePassword = randomUUID() + "Aa9!";
  const opponentPassword = randomUUID() + "Bb8!";
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
      passwordHash: await bcrypt.hash(mobilePassword, 10),
      credits: 10,
    } });
    const opponent = await prisma.user.create({ data: {
      username: "fixture_red_" + suffix,
      email: "fixture_red_" + suffix + "@example.invalid",
      passwordHash: await bcrypt.hash(opponentPassword, 10),
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

    // Staged independent reward approval test. These flags affect ONLY this
    // disposable CI process, never Next/Vercel or another player's account.
    process.env.SUMMON_PERSISTENCE_ENABLED = "true";
    process.env.SUMMON_XP_MANUAL_REVIEW_ENABLED = "true";
    const moderator = await prisma.user.create({ data: {
      username: "ci_xp_reviewer_" + suffix,
      email: "ci_xp_reviewer_" + suffix + "@example.invalid",
      isReviewer: true,
      credits: 10,
    } });
    people.push(moderator.id);
    const preApproval = await readMyQuestXpStatus({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(preApproval.status, "awaiting_independent_review");
    assert.equal(preApproval.verifiedXp, null);
    await assert.rejects(() => readMyQuestXpStatus({
      challengeId: quest.id, userId: moderator.id,
    }), /Only an accepted player/i,
    "Even an authorized moderator cannot read another player's account card");
    await assert.rejects(
      () => reconcileVerifiedQuestProfessionXp({
        challengeId: quest.id, userId: creator.id,
      }),
      /approval missing/i,
      "Settled videos without a separate reviewer may never grant XP",
    );
    // Even giving a competing player the generic reviewer role must never
    // permit them to approve their own Quest.
    await prisma.user.update({
      where: { id: creator.id }, data: { isReviewer: true },
    });
    await assert.rejects(
      () => approveTrustedQuestXpForReview({
        challengeId: quest.id, ownerId: creator.id,
        reviewerId: creator.id,
        reason: "Conflicted creator attempting to self-approve a video win",
      }),
      /cannot review their own Quest/i,
    );
    await prisma.user.update({
      where: { id: creator.id }, data: { isReviewer: false },
    });
    const authorized = await approveTrustedQuestXpForReview({
      challengeId: quest.id, ownerId: creator.id,
      reviewerId: moderator.id,
      reason: "Independent QA reviewer inspected original dual video receipts, both identities and final winner consent.",
    });
    assert.equal(authorized.status, "approved");
    assert.equal(authorized.issuedXp, false, "Approval is never automatic issuance");
    const pending = await readMyQuestXpStatus({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(pending.status, "approved_pending_issuance");
    assert.equal(pending.verifiedXp, null);
    const approvalRetry = await approveTrustedQuestXpForReview({
      challengeId: quest.id, ownerId: creator.id,
      reviewerId: moderator.id,
      reason: "Independent QA reviewer inspected original dual video receipts, both identities and final winner consent.",
    });
    assert.equal(approvalRetry.reused, true);
    assert.equal(approvalRetry.approvalId, authorized.approvalId);
    assert.equal(await prisma.professionXpEvent.count({
      where: { challengeId: quest.id },
    }), 0);

    // Approval fingerprints become invalid if either player withdraws
    // consent after review. Restoring verified consent re-enables that exact
    // unchanged approval — no acceptance data is silently fabricated.
    await prisma.verdictResponse.update({
      where: { challengeId_userId: {
        challengeId: quest.id, userId: opponent.id,
      } },
      data: { decision: "review_requested" },
    });
    await assert.rejects(
      () => reconcileVerifiedQuestProfessionXp({
        challengeId: quest.id, userId: creator.id,
      }),
      /consent|review|stale|changed/i,
      "Changed post-review consent must be rejected regardless of which guard fires first",
    );
    const consentRevoked = await readMyQuestXpStatus({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(consentRevoked.status, "not_eligible");
    assert.equal(consentRevoked.verifiedXp, null);
    await prisma.verdictResponse.update({
      where: { challengeId_userId: {
        challengeId: quest.id, userId: opponent.id,
      } },
      data: { decision: "accepted" },
    });

    const awards = await Promise.all(Array.from({ length: 3 }, () =>
      reconcileVerifiedQuestProfessionXp({
        challengeId: quest.id, userId: creator.id,
      }),
    ));
    assert.equal(new Set(awards.map(item => item.eventId)).size, 1,
      "Three same-user issuance retries must converge on one immutable XP receipt");
    assert.equal(awards[0].amount, 100);
    assert.equal(awards[0].professionId, "athletics");
    assert.equal(await prisma.professionXpEvent.count({
      where: { challengeId: quest.id, ownerId: creator.id },
    }), 1);
    const earnedStatus = await readMyQuestXpStatus({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(earnedStatus.status, "awarded");
    assert.equal(earnedStatus.verifiedXp, 100);
    assert.equal(earnedStatus.professionId, "athletics");
    // A forged or corrupted receipt MUST NEVER be shown as earned XP.
    await prisma.professionXpEvent.update({
      where: { id: awards[0].eventId }, data: { amount: 80 },
    });
    const corruptedStatus = await readMyQuestXpStatus({
      challengeId: quest.id, userId: creator.id,
    });
    assert.equal(corruptedStatus.status, "requires_correction");
    assert.equal(corruptedStatus.verifiedXp, null);
    await prisma.professionXpEvent.update({
      where: { id: awards[0].eventId }, data: { amount: 100 },
    });
    assert.equal((await readMyQuestXpStatus({
      challengeId: quest.id, userId: creator.id,
    })).status, "awarded");

    // An independent moderator may revoke a *not-yet-issued* opponent review,
    // but must not silently reverse XP already spent or converted into items.
    const secondApproval = await approveTrustedQuestXpForReview({
      challengeId: quest.id, ownerId: opponent.id,
      reviewerId: moderator.id,
      reason: "Separate review of the second competitor and the originally committed result.",
    });
    assert.equal(secondApproval.issuedXp, false);
    const revoked = await revokeTrustedQuestXpReview({
      challengeId: quest.id, ownerId: opponent.id,
      reviewerId: moderator.id,
      reason: "Further identity verification requested before awarding the opponent career experience.",
    });
    assert.equal(revoked.revoked, true);
    const revokedStatus = await readMyQuestXpStatus({
      challengeId: quest.id, userId: opponent.id,
    });
    assert.equal(revokedStatus.status, "review_revoked");
    assert.equal(revokedStatus.verifiedXp, null);
    await assert.rejects(
      () => reconcileVerifiedQuestProfessionXp({
        challengeId: quest.id, userId: opponent.id,
      }),
      /approval missing/i,
      "Revoked reviewer approval must block loser XP issuance",
    );
    await assert.rejects(
      () => revokeTrustedQuestXpReview({
        challengeId: quest.id, ownerId: creator.id,
        reviewerId: moderator.id,
        reason: "Attempted silent clawback after an XP record has been issued",
      }),
      /already issued/i,
    );
    assert.equal(await prisma.professionXpEvent.count({
      where: { challengeId: quest.id },
    }), 1);
    assert.equal(await prisma.summonTicket.count({
      where: { ownerId: { in: people } },
    }), 0);
    assert.equal(await prisma.summonInstance.count({
      where: { ownerId: { in: people } },
    }), 0);
    console.log(JSON.stringify({
      result: "PASS",
      phase: "independent_video_xp_review",
      reviewerIndependent: true,
      approvedThenIssued: true,
      staleConsentBlocked: true,
      repeatIssuanceSameEvent: true,
      revokedOpponentApprovalBlocksXp: true,
      deniedSilentClawback: true,
      qaXpEventCount: 1,
      realPlayerXpGrants: 0,
      playerReadStates: [
        "awaiting_independent_review",
        "approved_pending_issuance",
        "awarded",
        "review_revoked",
        "requires_correction",
      ],
      forgedXpReceiptHidden: true,
      ticketsIssued: 0,
      ownedSummonsIssued: 0,
    }));

    // Separately enable free-ticket milestones only AFTER independently
    // reviewed XP is in the immutable ledger. Never auto-draw a creature.
    process.env.SUMMON_TICKETS_ENABLED = "true";
    const earned = await reconcileFreeCareerTickets({
      ownerId: creator.id, professionId: "athletics",
    });
    assert.equal(earned.verifiedXp, 100);
    assert.equal(earned.earnedMilestones, 1);
    assert.equal(earned.available, 1);
    assert.equal(earned.spent, 0);
    const again = await reconcileFreeCareerTickets({
      ownerId: creator.id, professionId: "athletics",
    });
    assert.deepEqual(again.grantIds, earned.grantIds,
      "A second milestone reconciliation must not mint another ticket");
    assert.equal(await prisma.summonTicket.count({
      where: { ownerId: creator.id },
    }), 1);
    assert.equal(await prisma.summonInstance.count({
      where: { ownerId: { in: people } },
    }), 0, "Earned free ticket is not an owned Familiar");
    console.log(JSON.stringify({
      result: "PASS", phase: "verified_free_ticket_after_manual_xp",
      priorModeratorApprovalRequired: true,
      verifiedCareerXp: 100, freeTicketsIssued: 1,
      idempotentMilestone: true,
      freeTicketsSpent: 0, ownedSummonsMinted: 0,
      realPlayerRewards: 0,
    }));

    // Deliberate, user-initiated free Summon draw. Until the separate draw
    // feature is ON, earned tickets are INERT and cannot be consumed.
    const drawRequestKey = randomUUID();
    await assert.rejects(
      () => redeemFreeSummonTicket({
        ownerId: creator.id, professionId: "athletics",
        occupationId: "badminton", requestKey: drawRequestKey,
      }),
      /not enabled/i,
    );
    assert.equal(await prisma.summonDrawReceipt.count({
      where: { ownerId: creator.id },
    }), 0);
    process.env.SUMMON_DRAWS_ENABLED = "true";

    const beforeDrawBalances = await prisma.user.findMany({
      where: { id: { in: people } },
      select: { id: true, credits: true }, orderBy: { id: "asc" },
    });
    // Authenticate as the ACTUAL fixture account on the separate Next App
    // server. A 390px Chromium viewport exercises the real Familiars screen,
    // authenticated API, explicit draw confirmation and persisted inventory.
    // No direct library call may perform the initial draw in this stage.
    mobileBrowser = await chromium.launch({ headless: true });
    const mobileContext = await mobileBrowser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, reducedMotion: "reduce",
    });
    const origin = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
    const csrf = await mobileContext.request.get(origin + "/api/auth/csrf");
    assert.equal(csrf.status(), 200);
    const csrfToken = (await csrf.json() as { csrfToken: string }).csrfToken;
    const signedIn = await mobileContext.request.post(
      origin + "/api/auth/callback/credentials",
      { form: {
        csrfToken, email: creator.email, password: mobilePassword,
        action: "login", callbackUrl: origin + "/app/picos", json: "true",
      } },
    );
    assert.equal(signedIn.status(), 200, await signedIn.text());
    const authSession = await mobileContext.request.get(origin + "/api/auth/session");
    assert.equal(authSession.status(), 200);
    const actualUser = (await authSession.json() as { user?: { id?: string } }).user;
    assert.equal(actualUser?.id, creator.id, "Browser must own the same funded fixture account");

    const page = await mobileContext.newPage();
    const browserErrors: string[] = [];
    const observedDrawRequests: Array<{ requestKey: string; occupationId: string }> = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("request", req => {
      if (req.method() !== "POST" ||
          !req.url().endsWith("/api/summons/free-draw")) return;
      const value = req.postDataJSON() as {
        requestKey: string; occupationId: string; confirmSpend: boolean;
      };
      assert.equal(value.confirmSpend, true);
      observedDrawRequests.push(value);
    });
    const loaded = await page.goto(origin + "/app/picos", {
      waitUntil: "domcontentloaded", timeout: 45_000,
    });
    assert.equal(loaded?.status(), 200);
    await page.getByRole("heading", { name: "Summon a new Familiar" }).waitFor({
      timeout: 40_000,
    });
    await page.getByText("1 available", { exact: false }).first().waitFor();
    assert.equal(observedDrawRequests.length, 0, "Viewing the real inventory cannot draw");
    await page.getByRole("button", { name: "Review free ticket use" }).click();
    assert.equal(observedDrawRequests.length, 0, "Reviewing without confirmation cannot draw");
    await page.getByRole("button", { name: "Cancel" }).click();
    assert.equal(observedDrawRequests.length, 0, "Cancelling review cannot draw");
    await page.getByRole("button", { name: "Review free ticket use" }).click();
    const initialResponse = page.waitForResponse(
      response => response.request().method() === "POST" &&
        response.url().endsWith("/api/summons/free-draw"),
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Confirm and summon" }).click();
    const serverResponse = await initialResponse;
    assert.equal(serverResponse.status(), 201, await serverResponse.text());
    const payload = await serverResponse.json() as {
      draw?: Awaited<ReturnType<typeof redeemFreeSummonTicket>>;
    };
    assert.ok(payload.draw);
    const drawn = payload.draw;
    assert.equal(drawn.reused, false);
    assert.equal(drawn.creditsTransferred, 0);
    assert.ok(drawn.receiptId && drawn.instanceId);
    assert.ok(drawn.speciesId.startsWith("athletics-badminton-"));
    assert.ok(["common","uncommon","rare","epic","legendary"].includes(drawn.rarity));
    assert.equal(drawn.ordinal, 1);
    assert.equal(observedDrawRequests.length, 1);
    const actualDrawKey = observedDrawRequests[0].requestKey;
    assert.match(actualDrawKey, /^[0-9a-f-]{36}$/, "Real App must use one stable UUID");
    await page.getByText("Summoned: " + drawn.speciesId).waitFor();
    await page.getByTestId("owned-summon-" + drawn.instanceId).waitFor({
      timeout: 35_000,
    });
    assert.equal(await page.evaluate(() =>
      document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(browserErrors, []);
    await page.close();
    await mobileContext.close();

    // A second, separately authenticated participant may not read the
    // creator's owned item or steal an already-used request ID. Neither JWT
    // nor ticket receipt can be inferred from the challenge membership.
    const opponentContext = await mobileBrowser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true,
    });
    const otherCsrfRes = await opponentContext.request.get(origin + "/api/auth/csrf");
    assert.equal(otherCsrfRes.status(), 200);
    const otherCsrf = (await otherCsrfRes.json() as { csrfToken: string }).csrfToken;
    const opponentLogin = await opponentContext.request.post(
      origin + "/api/auth/callback/credentials",
      { form: {
        csrfToken: otherCsrf, email: opponent.email, password: opponentPassword,
        action: "login", callbackUrl: origin + "/app/picos", json: "true",
      } },
    );
    assert.equal(opponentLogin.status(), 200);
    const otherUser = await opponentContext.request.get(origin + "/api/auth/session");
    assert.equal((await otherUser.json() as { user?: { id?: string } }).user?.id,
      opponent.id);
    const otherInventory = await opponentContext.request.get(
      origin + "/api/summons/me",
    );
    assert.equal(otherInventory.status(), 200);
    const otherCollection = (await otherInventory.json() as {
      ownedCollection?: { available?: boolean; items?: unknown[] };
    }).ownedCollection;
    assert.equal(otherCollection?.available, true);
    assert.deepEqual(otherCollection?.items, [],
      "An accepted opponent must never see another user's owned Familiar");
    const stolenKey = await opponentContext.request.post(
      origin + "/api/summons/free-draw",
      { data: {
        professionId: "athletics", occupationId: "badminton",
        requestKey: actualDrawKey, confirmSpend: true,
      } },
    );
    assert.equal(stolenKey.status(), 409,
      "Someone else's draw key cannot authorize a new or replayed item");
    await opponentContext.close();

    // Network retries reuse the same client-generated key. Neither a duplicate
    // database creature nor another free ticket may be consumed on retry.
    const replayedDraw = await redeemFreeSummonTicket({
      ownerId: creator.id, professionId: "athletics",
      occupationId: "badminton", requestKey: actualDrawKey,
    });
    assert.equal(replayedDraw.reused, true);
    assert.equal(replayedDraw.receiptId, drawn.receiptId);
    assert.equal(replayedDraw.instanceId, drawn.instanceId);
    await assert.rejects(() => redeemFreeSummonTicket({
      ownerId: creator.id, professionId: "athletics",
      occupationId: "coaching", requestKey: actualDrawKey,
    }), /conflicts with an earlier free draw/i);
    await assert.rejects(() => redeemFreeSummonTicket({
      ownerId: creator.id, professionId: "athletics",
      occupationId: "badminton", requestKey: randomUUID(),
    }), /No issued, unused free ticket/i);

    const afterDrawInventory = await readOwnedFreeDrawInventory(creator.id);
    assert.ok(afterDrawInventory);
    assert.equal(afterDrawInventory.items.length, 1);
    assert.equal(afterDrawInventory.items[0].id, drawn.instanceId);
    assert.equal(afterDrawInventory.items[0].speciesId, drawn.speciesId);
    assert.equal(await prisma.summonDrawReceipt.count({
      where: { ownerId: creator.id },
    }), 1);
    assert.equal(await prisma.summonInstance.count({
      where: { ownerId: creator.id, originKind: "free_ticket" },
    }), 1);
    const afterDrawTicket = await prisma.summonTicket.findUniqueOrThrow({
      where: { id: earned.grantIds[0] },
      select: { status: true, spentByGrant: true },
    });
    assert.equal(afterDrawTicket.status, "spent");
    assert.ok(afterDrawTicket.spentByGrant);
    const afterDrawBalances = await prisma.user.findMany({
      where: { id: { in: people } },
      select: { id: true, credits: true }, orderBy: { id: "asc" },
    });
    assert.deepEqual(afterDrawBalances, beforeDrawBalances);
    console.log(JSON.stringify({
      result: "PASS", phase: "explicit_free_draw_creates_one_owned_familiar",
      independentlyApprovedXp: 100,
      verifiedFreeTicketsIssued: 1,
      freeTicketsSpent: 1,
      ownedFamiliars: 1,
      realAuthenticatedMobileWeb: true,
      browserConfirmedSingleSpend: observedDrawRequests.length === 1,
      crossAccountInventoryIsolation: true,
      stolenDrawKeyRejected: true,
      serverSelectedRarity: drawn.rarity,
      duplicateDrawRequests: 0,
      duplicateOwnedInstances: 0,
      creditMovement: 0,
      liveUserRewards: 0,
      liveModelAccuracyClaim: false,
    }));
  } finally {
    await mobileBrowser?.close().catch(() => {});
    process.env.AI_ENABLED = previousAi;
    if (priorPersistence === undefined) delete process.env.SUMMON_PERSISTENCE_ENABLED;
    else process.env.SUMMON_PERSISTENCE_ENABLED = priorPersistence;
    if (priorManualReview === undefined) delete process.env.SUMMON_XP_MANUAL_REVIEW_ENABLED;
    else process.env.SUMMON_XP_MANUAL_REVIEW_ENABLED = priorManualReview;
    if (priorTicketFlag === undefined) delete process.env.SUMMON_TICKETS_ENABLED;
    else process.env.SUMMON_TICKETS_ENABLED = priorTicketFlag;
    if (priorDrawFlag === undefined) delete process.env.SUMMON_DRAWS_ENABLED;
    else process.env.SUMMON_DRAWS_ENABLED = priorDrawFlag;
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
      // Manual reviewer approval is RESTRICT to retain forensic history in
      // production; the disposable fixture must explicitly drop its own rows.
      // Reverse creation order to respect RESTRICT FKs: draw receipts
      // reference both the spent ticket and the owned Familiar.
      await prisma.summonDrawReceipt.deleteMany({
        where: { ownerId: { in: people } },
      }).catch(() => {});
      await prisma.summonInstance.deleteMany({
        where: { ownerId: { in: people } },
      }).catch(() => {});
      await prisma.summonTicket.deleteMany({
        where: { ownerId: { in: people } },
      }).catch(() => {});
      await prisma.verifiedXpApproval.deleteMany({
        where: { challengeId },
      }).catch(() => {});
      await prisma.professionXpEvent.deleteMany({
        where: { challengeId },
      }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { challengeId } }).catch(() => {});
      await prisma.activityEvent.deleteMany({ where: { challengeId } }).catch(() => {});
      await prisma.challenge.delete({ where: { id: challengeId } }).catch(() => {});
    }
    if (people.length > 0) {
      // The disposable fixture may have a zero-cost or reservation ledger
      // row without a Quest foreign key. The User FK is intentionally
      // RESTRICT in production; only remove transactions for fixture users.
      await prisma.creditTx.deleteMany({
        where: { userId: { in: people } },
      }).catch(() => {});
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
