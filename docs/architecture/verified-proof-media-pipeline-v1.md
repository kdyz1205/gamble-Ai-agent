# SUM / Summoner: Verified Proof and Media Pipeline (v1)

## Status / boundaries

This is the target design and a staged implementation plan, **not a claim that the production media pipeline is migrated**. The current web client uploads to public Vercel Blob, falling back to S3 presigned PUT with a public URL; the judge uses FFmpeg and public extracted-frame URLs. It is NOT equivalent to private immutable evidence. Existing credit, consent, review, and XP gates must remain intact.

The current isolated implementation adds `POST /api/challenges/judgeability`, the pure `assessJudgeability` engine, and an atomic preflight audit receipt at Quest creation. A `reviewable` status authorizes **review only**, never an automatic verdict or settlement. The returned hash fingerprints normalized **proof** rules, not the entire financial/market contract.

## Trust boundaries

1. **Client:** iPhone/WebView may request an upload and display a recording preview; it is not trusted to assert ownership, duration, MIME, location, time, identity, or success. Background networking on iOS requires a native file-based URLSession bridge; web fetch is not a substitute.
2. **API/auth:** issue a single-use scoped upload intent only to the accepted participant in an active Quest before the true deadline; persist `userId`, `challengeId`, purpose, MIME family, max size, nonce, expiration and object key. Never send permanent bucket credentials to clients.
3. **Object storage:** private S3-compatible bucket, AES256/KMS encrypted, blocked public access, least-privilege IAM. Upload from client directly to bucket using short-lived signed PUT/multipart. No raw videos through Next.js application memory. Quarantine before review. Only server-authorized expiring GET links for playback; never write public original or frame URLs to user-visible API fields.
4. **Finalize:** the backend checks intent ownership/state/expiry, object key exactly matches intent, performs HEAD to validate existence and bounded length, sniffs actual media, hashes full bytes in trusted media worker (not the client alone), rejects malformed/truncated or oversized input, and marks the intent once. A client-supplied arbitrary HTTPS URL must NOT be treated as equivalent to this verified path.
5. **Jobs:** upload finalize commits the verified evidence pointer plus a durable outbox job in the same DB transaction. A queue/worker processes file decoding, malware scanning, ffprobe duration/fps, shot/timestamp integrity checks, keyframe and action-window sampling, and optional pose/motion analysis. Retry with exponential backoff; dead-letter and alert on exhausted retries. Worker results are immutable versioned artifacts.
6. **Judge:** select verifier by canonical challenge rules and evidence requirements; cost-aware stages: deterministic trusted platform receipts -> cheap metadata/proof quality checks -> sparse frames -> dense temporal analysis near decisive events -> human review. Vision model outputs time-stamped observations; deterministic scoring computes the candidate result. Low quality, ambiguous identity, cuts, missing time, conflicting evidence, AI outages -> no automatic winner.
7. **Review:** return signed playback clips and an evidence-timestamped rationale to authorized participants/reviewers only. Existing mutual-confirmation / dispute / settlement workflow remains authoritative. Freeze original proof, rubric version and model version for appeals.
8. **XP:** issue XP/tickets only from final audited valid settlement (subject to the existing feature gates); never grant from a speculative prediction or provisional vision suggestion.

## State machine / idempotence

UploadIntent: `ISSUED -> UPLOADING -> UPLOADED -> VERIFIED -> QUEUED -> PROCESSED`, terminal `REJECTED | EXPIRED | QUARANTINED`.

Judge: `WAITING_FOR_PROOF -> ANALYZING -> RECOMMENDATION | MANUAL_REVIEW | INSUFFICIENT_EVIDENCE`. Existing Quest lifecycle remains the authority for settlement.

Use unique `(challengeId, userId, submissionRevision)` and `(jobType, evidenceId, assetDigest, verifierVersion)`. Jobs must check whether the evidence revision is still current before publishing results (existing `preparedFrames` race guard illustrates this). Replays and duplicate storage events are harmless. A timeout MUST NOT mutate payout; missing usage or metadata is **unknown**, not zero or success.

## Data migration proposal (requires approved Prisma migration)

- `UploadIntent`: id, userId, challengeId, objectKey, sizeLimit, expectedContentType, status, expiresAt, verifiedAt, createdAt, unique nonce/idempotencyKey.
- `EvidenceAsset`: id, evidenceId, uploadIntentId unique, objectVersion, sha256, bytes, sniffedMime, mediaDurationMs, serverVerified, quarantineStatus, createdAt.
- `EvidenceDerivative`: assetId, type, objectKey, contentSha256, extractorVersion, timestampMs, expiresAt, unique per processing version.
- `EvidenceProcessingJob`: assetId, pipelineVersion, status, attempts, nextAttemptAt, leaseUntil, errorCode, updatedAt.
- `JudgmentObservation`: evidenceAssetId, rubricHash, verifierVersion, spanStartMs, spanEndMs, observation, confidence, provenance.

Keep `Evidence.url` for legacy compatibility but do not promote an arbitrary/public URL to `serverVerified=true`. Freeze or reject client edits after proof deadline; no backdating. Retain a cryptographic source digest and a short audit receipt even when originals expire; define privacy deletion workflows and legal holds separately.

## Device/thermal budget

- Capture normally 720p / 24fps / hardware-supported H.264 MP4; avoid sustained 4K, 60fps, on-device LLM or frame-by-frame CV. Choose low-light and evidence-category presets only when needed.
- Approximate **illustration**: 60 s at 1.8 Mb/s video bitrate = ~13.5 MB video payload before audio/metadata. Two 1-minute clips per match => ~27 MB uploaded. Actual bitrate, quality and thermal performance require device tests.
- Video data should be persisted immediately to a temporary **file**, never accumulated as an unbounded RAM Blob. Existing `MediaRecorder` chunks are RAM-resident; the true native AVFoundation + background URLSession bridge is future work.
- Use iOS `URLSessionConfiguration.background(withIdentifier:)` with `uploadTask(fromFile:)`; safely persist a local manifest and reconcile after process relaunch. The platform controls schedule; force-quit and iOS restrictions matter. Honor user Wi-Fi/cellular and Low Power Mode preferences.
- Initial tests: a low-end supported iPhone and a recent iPhone; 1/3/5-minute proof, Wi-Fi/LTE, airplane-mode resume, foreground/background/force-quit, upload interruption, camera restart; log MB/energy/thermal-state and success rates without logging raw proof.

## Privacy & reliability gates

- Private uploads, access tokens with scope and TTL, reviewer role checks, TLS; no video visibility via guessed IDs or public URL; avoid third-party AI retention beyond needed processing; scrub GPS/EXIF and faces when unnecessary.
- Retention proposal (adjust to legal/privacy needs): 30-day raw post-finalization default with longer exception for disputed/audited cases; derived contact sheets 7 days; minimum lawful transaction metadata independently retained. This is a proposal, **not configured**.
- Moderation: prevent dangerous/invasive contests and nonconsensual recordings at authoring and upload. For minors and regulated wagering, apply separate stronger eligibility/legal checks.
- Metrics: upload success/time-to-ready, frame-coverage failures, worker retry/dead-letter, AI cost per review, inference provenance, dispute reversal rate, false-positive auto-win rate assessed against blind human-labeled videos. No auto-settlement launch until statistically validated on representative real-world clips.

## What to borrow, not copy

- **Mux Direct Uploads:** authenticated, direct-to-storage upload, asynchronous encoding with webhook status, no media proxy through the API: https://www.mux.com/docs/guides/upload-files-directly
- **Cloudflare Stream Direct Creator Uploads:** one-time upload URLs, resumable tus where appropriate, max duration, signed viewing: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- **Apple URLSession background transport:** background **file** tasks with app lifecycle callbacks: https://developer.apple.com/documentation/foundation/downloading-files-in-the-background
- For SUM, start with private S3+workers because most video is *evidence*, not public video streaming. Only adopt Mux/Stream if viewer transcoding, playback, and CDN become needed at scale.

## Incremental rollout: do not claim these are already shipped

1. **Now (PR only):** deterministic conservative preflight + transactional audit receipt, endpoint, tests; reduce capture bitrate/resolution where possible. Keep legacy storage behavior unchanged.
2. **Next behind feature flag:** private bucket, verified upload intents, HEAD/hash, signed playback, backfill path, deletion/retention; isolated PostgreSQL migration and negative security tests.
3. **Next:** durable media worker/outbox, retry/DLQ, dense temporal video verifiers and real-video labeled acceptance set.
4. **Next:** native Capacitor iOS AVFoundation file recording and background URLSession module (macOS/Xcode/iPhone simulator + physical device required).
5. **Only after gates pass:** production migration and activated feature flag, cloud object HEAD/webhook checks, TestFlight thermal/airplane mode tests, and release verification. No autonomous money, credits, or XP policy changes.
