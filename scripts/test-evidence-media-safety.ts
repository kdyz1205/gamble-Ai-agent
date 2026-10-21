import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import https from "node:https";
import { EventEmitter } from "node:events";
import { mock } from "node:test";
import { parse } from "dotenv";
import { put, del } from "@vercel/blob";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { fetchBinaryCapped, isEvidenceUrlAllowed } from "../src/lib/media/evidence-url";
import { extractTimelineFrames, ffprobeDurationFromUrl } from "../src/lib/media/ffmpeg-helpers";
import { capJudgeVisuals, prepareParticipantVisuals, prepareParticipantVisualsFast } from "../src/lib/media/prepare-evidence-visuals";

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "evidence-safety-"));
  const uploaded: string[] = [];
  const checks: string[] = [];
  try {
    for (const url of ["http://example.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://[::ffff:127.0.0.1]/a", "https://203.0.113.5/a", "https://user:pass@example.com/a", "https://example.com:8443/a"]) {
      assert.equal(isEvidenceUrlAllowed(url), false, url);
      await assert.rejects(fetchBinaryCapped(url), /rejected/);
    }
    await assert.rejects(fetchBinaryCapped("https://127.0.0.1.nip.io/test", 1024, 10_000), /private or reserved/);
    checks.push("private_literals_credentials_ports_and_private_DNS_rejected");
    // Controlled HTTP event injection exercises malformed/hostile redirects;
    // live Blob assertions below separately cover the actual TLS transport.
    let location = "http://[";
    let requests = 0;
    const transport = mock.method(https, "request", () => {
      requests++;
      const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error?: Error) => void };
      req.destroy = (error) => { if (error) req.emit("error", error); req.emit("close"); };
      req.end = () => setImmediate(() => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: { location: string }; destroy: () => void };
        res.statusCode = 302; res.headers = { location }; res.destroy = () => req.emit("close");
        req.emit("response", res);
      });
      return req as unknown as ReturnType<typeof https.request>;
    });
    try {
      await assert.rejects(fetchBinaryCapped("https://example.com/redirect"), /malformed/);
      location = "https://127.0.0.1/private"; requests = 0;
      await assert.rejects(fetchBinaryCapped("https://example.com/redirect"), /rejected/); assert.equal(requests, 1);
      location = "/again"; requests = 0;
      await assert.rejects(fetchBinaryCapped("https://example.com/redirect"), /redirect limit/); assert.equal(requests, 5);
      await assert.rejects(fetchBinaryCapped("https://example.com/webhook", 1024, 1000, { method: "POST", body: "{}" }), /Webhook redirects/);
      checks.push("malformed_private_loop_and_webhook_redirect_contracts");
    } finally { transport.mock.restore(); }
    await assert.rejects(async () => ffprobeDurationFromUrl("https://example.com/video.mp4"), /staged local/);
    await assert.rejects(extractTimelineFrames("https://example.com/video.mp4", 2, 4, dir), /staged local/);
    const playlist = join(dir, "attack.m3u8");
    await writeFile(playlist, "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttps://127.0.0.1/private.ts\n#EXT-X-ENDLIST\n");
    assert.equal(await ffprobeDurationFromUrl(playlist, 3000), null);
    checks.push("decoders_reject_remote_URL_and_nested_network_protocol");
    const qaFrame = (caption: string) => ({ caption, mimeType: "image/jpeg" as const, base64: "x".repeat(12) });
    const capped = capJudgeVisuals(Array.from({ length: 24 }, () => qaFrame("A")), [qaFrame("B")], 4, 48);
    assert.ok(capped.some((image) => image.caption === "A") && capped.some((image) => image.caption === "B"));
    assert.ok(capped.length <= 4);
    assert.deepEqual(capJudgeVisuals([qaFrame("A")], [qaFrame("B")], 2, 12), []);
    checks.push("visual_caps_preserve_both_players_and_enforce_hard_bytes");
    assert.ok(ffmpegPath);
    const video = join(dir, "qa.mp4");
    await promisify(execFile)(ffmpegPath, ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=12", "-t", "2", "-threads", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", video], { timeout: 30_000, windowsHide: true });
    assert.equal(await ffprobeDurationFromUrl(video), 2);
    const frames = join(dir, "frames"); await mkdir(frames);
    assert.equal((await extractTimelineFrames(video, 2, 4, frames)).length, 4);
    await assert.rejects(extractTimelineFrames(video, 2, 4, frames, 1), (error: unknown) => Boolean((error as { killed?: boolean }).killed));
    checks.push("real_ffprobe_frames_and_timeout_child_termination");
    if (process.argv.includes("--live")) {
      const env = parse(await readFile(".vercel/stubborn-development.env"));
      const token = env.BLOB_READ_WRITE_TOKEN?.replace(/^\uFEFF/, "").trim();
      assert.ok(token, "Existing Blob credential required");
      const image = await sharp({ create: { width: 240, height: 180, channels: 3, background: "red" } }).png().toBuffer();
      const imageBlob = await put(`diagnostics/media-safety-${Date.now()}.png`, image, { token, access: "public", contentType: "image/png", addRandomSuffix: true }); uploaded.push(imageBlob.url);
      const downloaded = await fetchBinaryCapped(imageBlob.url);
      assert.deepEqual(downloaded.buffer, image);
      await assert.rejects(fetchBinaryCapped(imageBlob.url, 2), /exceeds cap|exceeded/);
      await assert.rejects(fetchBinaryCapped(imageBlob.url, 1024, 1), /timeout/);
      const photo = await prepareParticipantVisuals("QA-A", { type: "photo", url: imageBlob.url, description: "Controlled synthetic image" });
      assert.equal(photo.visuals.length, 1);
      assert.equal((await prepareParticipantVisualsFast("QA-A", [imageBlob.url]))?.visuals.length, 1);
      assert.equal(await prepareParticipantVisualsFast("QA-A", ["https://127.0.0.1/private.jpg"]), null);
      const videoBlob = await put(`diagnostics/media-safety-${Date.now()}.mp4`, await readFile(video), { token, access: "public", contentType: "video/mp4", addRandomSuffix: true }); uploaded.push(videoBlob.url);
      const prepared = await prepareParticipantVisuals("QA-A", { type: "video", url: videoBlob.url, description: "Controlled two-second video" });
      assert.ok(prepared.visuals.length >= 3, JSON.stringify(prepared.preambleLines));
      checks.push("real_Blob_upload_guarded_download_photo_cached_frames_video_caps_timeout");
    }
    const receipt = { passed: checks.length, checks, realModelInference: false, at: new Date().toISOString() };
    await mkdir("output", { recursive: true });
    await writeFile(process.argv.includes("--live") ? "output/evidence-media-safety-live.json" : "output/evidence-media-safety-unit.json", JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally {
    // Only the exact synthetic objects created by this run are eligible for cleanup.
    if (uploaded.length) {
      const env = parse(await readFile(".vercel/stubborn-development.env"));
      await del(uploaded, { token: env.BLOB_READ_WRITE_TOKEN.replace(/^\uFEFF/, "").trim() });
    }
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
