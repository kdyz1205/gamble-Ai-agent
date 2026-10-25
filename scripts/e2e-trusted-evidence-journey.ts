/**
 * CI-only, real PostgreSQL + S3-compatible private video transfer and binding.
 * No live AI credentials, wagering, real user assets or automatic awards.
 * Uses actual ffmpeg-generated, decodable MP4 bytes (not a fake video URL).
 *
 * This intentionally DOES NOT claim AI winner accuracy. The local HTTP
 * object host is rejected at judge time by the SSRF policy; this must
 * leave the Quest in judging with no false result or movement of credits.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";

function verifySafeEnvironment() {
  const db = new URL(process.env.DATABASE_URL || "postgresql://none/none");
  if (!["localhost", "127.0.0.1"].includes(db.hostname) ||
      db.pathname !== "/summoner_verification" ||
      process.env.AI_ENABLED !== "false" ||
      process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS !== "true" ||
      process.env.TRUSTED_EVIDENCE_REQUIRED_FOR_MEDIA !== "true" ||
      process.env.S3_TRUSTED_EVIDENCE_BUCKET !== "ci-private-evidence" ||
      process.env.S3_TRUSTED_EVIDENCE_ENDPOINT !== "http://127.0.0.1:9000") {
    throw new Error("Trusted video E2E requires isolated local Postgres, MinIO and AI disabled");
  }
}

async function readJson(response: { json: () => Promise<unknown>; text: () => Promise<string> }) {
  return await response.json() as Record<string, unknown>;
}

async function main() {
  verifySafeEnvironment();
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const store = new S3Client({
    region: process.env.AWS_REGION!,
    endpoint: process.env.S3_TRUSTED_EVIDENCE_ENDPOINT!,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const contexts: APIRequestContext[] = [];
  const users: string[] = [];
  const questIds: string[] = [];
  const folder = await mkdtemp(join(tmpdir(), "sum-trusted-video-"));
  const tag = randomUUID().replaceAll("-", "").slice(0, 13);
  const mp4 = join(folder, "one-second-real-video.mp4");
  assert.ok(ffmpegPath, "Bundled FFmpeg binary is required; no system FFmpeg assumption");
  execFileSync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=15:d=1.5",
    "-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", mp4,
  ], { timeout: 30_000 });
  const bytes = await readFile(mp4);
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.ok(bytes.length > 1024 && bytes.toString("ascii", 4, 8) === "ftyp");

  async function register(label: string) {
    const ctx = await request.newContext({ baseURL: base });
    contexts.push(ctx);
    const username = "trust_" + label + "_" + tag;
    const email = username + "@example.invalid";
    const csrf = (await readJson(await ctx.get("/api/auth/csrf"))).csrfToken as string;
    const res = await ctx.post("/api/auth/callback/credentials", {
      form: {
        csrfToken: csrf, action: "register", username,
        email, password: randomUUID() + "Aa9!",
        callbackUrl: base + "/app", json: "true",
      },
    });
    assert.equal(res.status(), 200, await res.text());
    const session = (await readJson(await ctx.get("/api/auth/session"))).user as { id: string };
    assert.ok(session?.id);
    users.push(session.id);
    return { id: session.id, ctx };
  }
  async function count(table: string, questId: string): Promise<number> {
    if (!["Evidence", "Judgment", "CreditTx", "ProfessionXpEvent", "JudgeJob"].includes(table)) {
      throw new Error("Invalid internal E2E table");
    }
    const result = await db.query('SELECT COUNT(*)::int AS n FROM "' + table + '" WHERE "challengeId"=$1', [questId]);
    return result.rows[0].n as number;
  }
  async function uploadFor(ctx: APIRequestContext, questId: string) {
    const ticketResponse = await ctx.post("/api/uploads/trusted-evidence", {
      data: { challengeId: questId, contentType: "video/mp4", fileSizeBytes: bytes.length },
    });
    assert.equal(ticketResponse.status(), 201, await ticketResponse.text());
    const ticket = await readJson(ticketResponse);
    const id = ticket.uploadSessionId as string;
    const url = ticket.uploadUrl as string;
    const headers = ticket.headers as Record<string, string>;
    assert.ok(id && url && headers["If-None-Match"] === "*");
    const rawPut = await ctx.put(url, { data: bytes, headers });
    assert.ok(rawPut.ok(), "Private signed PUT: " + rawPut.status() + " " + await rawPut.text());
    const replay = await ctx.put(url, { data: bytes, headers });
    assert.ok(!replay.ok(), "Presigned PUT must not replace the same object");
    const beforeComplete = await ctx.post("/api/challenges/" + questId + "/evidence/trusted", {
      data: { uploadSessionId: id, description: "Real ffmpeg test media, no sports result" },
    });
    assert.equal(beforeComplete.status(), 409);
    const complete = await ctx.post("/api/uploads/trusted-evidence/" + id + "/complete");
    assert.equal(complete.status(), 200, await complete.text());
    const receipt = await readJson(complete);
    assert.equal(receipt.sha256, digest);
    assert.equal(receipt.sizeBytes, bytes.length);
    const bound = await ctx.post("/api/challenges/" + questId + "/evidence/trusted", {
      data: { uploadSessionId: id, description: "Synthetic test recording for trusted bytes only" },
    });
    assert.equal(bound.status(), 201, await bound.text());
    const proof = (await readJson(bound)).evidence as { trustedUploadId: string; url: string | null };
    assert.equal(proof.trustedUploadId, id);
    assert.equal(proof.url, null);
    const retry = await ctx.post("/api/challenges/" + questId + "/evidence/trusted", {
      data: { uploadSessionId: id },
    });
    assert.equal(retry.status(), 200);
    assert.equal((await readJson(retry)).reused, true);
    return id;
  }

  try {
    const creator = await register("creator");
    const friend = await register("friend");
    const outsider = await register("outsider");
    const originalCredits = (await db.query(
      'SELECT id,credits FROM "User" WHERE id=ANY($1::text[]) ORDER BY id', [users],
    )).rows;

    const created = await creator.ctx.post("/api/challenges", {
      data: {
        title: "Trusted video challenge " + tag,
        type: "Fitness",
        stake: 0,
        evidenceType: "video",
        deadline: "2 hours",
        rules: "Both players supply their own real video. This E2E test never determines a sports winner.",
        visibility: "invite_only", isPublic: false,
      },
    });
    assert.equal(created.status(), 201, await created.text());
    const challengeId = ((await readJson(created)).challenge as { id: string }).id;
    questIds.push(challengeId);
    const joined = await friend.ctx.post("/api/challenges/" + challengeId + "/accept");
    assert.equal(joined.status(), 200, await joined.text());

    // One participant cannot issue another user's private object capability.
    const outsiderIssue = await outsider.ctx.post("/api/uploads/trusted-evidence", {
      data: { challengeId, contentType: "video/mp4", fileSizeBytes: bytes.length },
    });
    assert.equal(outsiderIssue.status(), 403);

    const legacy = await creator.ctx.post("/api/challenges/" + challengeId + "/evidence", {
      data: { type: "video", url: "https://example.com/legacy-video.mp4", description: "URL spoof" },
    });
    assert.equal(legacy.status(), 409, await legacy.text());
    assert.equal(await count("Evidence", challengeId), 0);

    const uploadA = await uploadFor(creator.ctx, challengeId);

    // Independent real decoder receipt, through the PRIVATE S3 SDK rather
    // than a public URL or a fabricated video header.
    const objectRow = await db.query(
      'SELECT "objectKey" FROM "TrustedEvidenceUpload" WHERE id=$1', [uploadA],
    );
    assert.equal(objectRow.rows.length, 1);
    const retrieved = await store.send(new GetObjectCommand({
      Bucket: "ci-private-evidence",
      Key: objectRow.rows[0].objectKey as string,
    }));
    assert.ok(retrieved.Body);
    const chunks: Buffer[] = [];
    let transferred = 0;
    for await (const item of retrieved.Body as AsyncIterable<Uint8Array>) {
      const chunk = Buffer.from(item);
      transferred += chunk.length;
      assert.ok(transferred <= 80 * 1024 * 1024, "Private object read exceeds budget");
      chunks.push(chunk);
    }
    const downloaded = Buffer.concat(chunks);
    assert.equal(createHash("sha256").update(downloaded).digest("hex"), digest);
    const decodedPath = join(folder, "s3-retrieved.mp4");
    await writeFile(decodedPath, downloaded);
    assert.ok(ffprobeStatic.path, "Bundled FFprobe must be available");
    const duration = Number(execFileSync(ffprobeStatic.path, [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", decodedPath,
    ], { encoding: "utf8", timeout: 15_000 }).trim());
    assert.ok(duration >= 1 && duration < 3, "Private MP4 decode produced invalid duration");
    const imagePath = join(folder, "actual-decoded-frame.jpg");
    execFileSync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", decodedPath,
      "-frames:v", "1", imagePath,
    ], { timeout: 25_000 });
    assert.ok((await stat(imagePath)).size > 500, "Private MP4 did not yield a JPEG frame");

    const otherFinish = await friend.ctx.post("/api/uploads/trusted-evidence/" + uploadA + "/complete");
    assert.equal(otherFinish.status(), 404);
    assert.equal(await count("Evidence", challengeId), 1);
    assert.equal((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [challengeId])).rows[0].status, "live");

    const uploadB = await uploadFor(friend.ctx, challengeId);
    assert.notEqual(uploadA, uploadB);
    assert.equal(await count("Evidence", challengeId), 2);
    assert.equal((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [challengeId])).rows[0].status, "judging");
    const playerView = await readJson(await creator.ctx.get("/api/challenges/" + challengeId));
    const proofs = (playerView.challenge as { evidence: Array<{ url: string | null; trustedUploadId: string }> }).evidence;
    assert.equal(proofs.length, 2);
    assert.ok(proofs.every(p => p.url === null && typeof p.trustedUploadId === "string"));
    assert.equal(await count("Judgment", challengeId), 0);

    // The fixture store is deliberately HTTP localhost. The outbound media
    // policy must NOT let even a verified object bypass public-HTTPS SSRF
    // checks at judge time. A task may fail, never settle a false winner.
    const referee = await creator.ctx.post("/api/challenges/" + challengeId + "/judge/async", {
      data: { tier: 1, providerId: "openai", model: "gpt-4o-mini" },
    });
    assert.equal(referee.status(), 202, await referee.text());
    const jobId = (await readJson(referee)).jobId as string;
    assert.ok(jobId);
    let finalStatus = "";
    for (let attempt = 0; attempt < 35; attempt++) {
      const polled = await creator.ctx.get("/api/judge-jobs/" + jobId);
      assert.equal(polled.status(), 200);
      finalStatus = (await readJson(polled)).status as string;
      if (["failed", "completed"].includes(finalStatus)) break;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    assert.equal(finalStatus, "failed", "Local MinIO HTTP URL must fail closed");
    assert.equal(await count("Judgment", challengeId), 0);
    assert.equal(await count("CreditTx", challengeId), 0);
    assert.equal(await count("ProfessionXpEvent", challengeId), 0);
    const finalCredits = (await db.query(
      'SELECT id,credits FROM "User" WHERE id=ANY($1::text[]) ORDER BY id', [users],
    )).rows;
    assert.deepEqual(finalCredits, originalCredits);
    console.log(JSON.stringify({
      result: "PASS", authenticatedPlayers: 2,
      privateMP4Bytes: bytes.length,
      distinctUploads: 2, immutableEvidenceRows: 2,
      sha256Verified: true, presignedReplayRejected: true,
      decoderDurationSeconds: Number(duration.toFixed(3)), verifiedPrivateFrames: 1,
      AI: "disabled_and_http_storage_denied",
      fakeVerdicts: 0, creditMovement: 0, xpIssued: 0,
    }));
  } finally {
    // Every operation is scoped to this disposable challenge and test users.
    for (const id of questIds) {
      const objects = await db.query('SELECT "objectKey" FROM "TrustedEvidenceUpload" WHERE "challengeId"=$1', [id]).catch(() => ({ rows: [] }));
      for (const row of objects.rows) {
        await store.send(new DeleteObjectCommand({
          Bucket: "ci-private-evidence", Key: row.objectKey,
        })).catch(() => {});
      }
      await db.query('DELETE FROM "AuditLog" WHERE "challengeId"=$1', [id]).catch(() => {});
      await db.query('DELETE FROM "ActivityEvent" WHERE "challengeId"=$1', [id]).catch(() => {});
      await db.query('DELETE FROM "Challenge" WHERE id=$1', [id]).catch(() => {});
    }
    if (users.length) {
      await db.query('DELETE FROM "AuditLog" WHERE "actorUserId"=ANY($1::text[]) OR "targetUserId"=ANY($1::text[])', [users]).catch(() => {});
      await db.query('DELETE FROM "ActivityEvent" WHERE "userId"=ANY($1::text[])', [users]).catch(() => {});
      await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [users]).catch(() => {});
    }
    await Promise.all(contexts.map(ctx => ctx.dispose().catch(() => {})));
    store.destroy();
    await db.end();
    await rm(folder, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
