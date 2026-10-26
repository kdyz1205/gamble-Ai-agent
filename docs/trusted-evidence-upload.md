# SUM private video/photo proof intake ? staging design

**Status:** Feature-gated implementation in the isolated game+rewards development
branch. Not rolled into the production game, not turned on in Vercel, and not
evidence that the game can autonomously identify winners in arbitrary videos.

**Legacy preview compatibility:** The optional foreign key is
`TrustedEvidenceUpload.evidenceId`, inside the new table. The existing
`Evidence` table receives **no additional column**. All reads of the
optional upload table are guarded by `ENABLE_TRUSTED_EVIDENCE_UPLOADS=true`.
With the feature off, old Web App routes continue to work even when the
private-upload migration has not yet run.

## End-to-end path

1. The authenticated accepted player calls
   `POST /api/uploads/trusted-evidence` with the existing challenge ID,
   actual MIME type and byte size. The server checks the **live** challenge,
   accepted participant, proof deadline, MIME policy and 80 MiB request limit;
   refuses client claims of recording-session authentication. It issues a
   random, expiring **conditional PUT** into a separate private S3/R2 bucket.
2. The mobile browser PUTs the raw file directly to that bucket using
   XMLHttpRequest upload events to show actual transfer percentage; the UI
   separately labels server SHA verification and the eventual Quest binding.
   Cancelling the transfer never commits Evidence. Safari cannot guarantee
   background uploads, so the player is asked to keep the page open. The
   trusted path refuses any error-triggered downgrade to the public store.
   `POST /api/uploads/trusted-evidence/{id}/complete` independently uses
   HEAD + bounded GET to check actual size, media magic and SHA-256, then
   stores `issued -> verified` with a database compare-and-set.
3. `POST /api/challenges/{challengeId}/evidence/trusted` **rehashes the
   object** and atomically binds one verified session to one Evidence row.
   The row saves the SHA-256 and upload ID, **never a public file URL**.
   A transaction locks the Quest, validates participants and deadline,
   consumes the session exactly once and updates `live -> judging` only
   after two accepted players submit.
4. The AI judge, when explicitly requested by the creator, checks the
   consumed object against the recorded SHA-256. Its trusted decoder streams
   **directly through the authenticated S3 SDK to a restricted temporary
   local file**, rehashing the exact bytes that FFmpeg will decode. No signed
   GET URL, CDN exposure or external HTTP fetch is used for this private
   path. The model only receives decoded images, timestamps and a generic
   trusted-source note. AI failures, unreadable video, inconsistent hashes or
   unavailable storage **must not produce a winner or a reward**.
5. The result remains a referee **recommendation**. Both participants
   accept or request human review. Existing settlement and credit invariants
   remain unchanged. Career XP/draw/evolution have independent disabled
   release gates and are not automatically awarded by this path.

## Configuration

- `ENABLE_TRUSTED_EVIDENCE_UPLOADS=true` activates private intake.
- `TRUSTED_EVIDENCE_REQUIRED_FOR_MEDIA=true` blocks legacy URL-based photo
  and video submissions and blocks judging legacy media. **Do not set it
  before private direct PUT, bucket CORS, authenticated SDK reads and
  supported codecs are tested on a real iPhone.**
- `S3_TRUSTED_EVIDENCE_BUCKET` must differ from `S3_EVIDENCE_BUCKET` and
  must remain inaccessible through a public bucket, CDN or public ACL.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` are the
  server credentials. Limit them to the private bucket.
- `S3_TRUSTED_EVIDENCE_ENDPOINT` and
  `S3_TRUSTED_EVIDENCE_FORCE_PATH_STYLE` are for an S3-compatible provider.
  Cloudflare R2 uses a public HTTPS account endpoint and `AWS_REGION=auto`.
- Bucket CORS must allow only the Web App origin and the signed PUT headers
  `Content-Type` and `If-None-Match`.
- Private reads are **server-only SDK GetObject streams**, not bearer URL
  requests. The public URL SSRF rules continue to apply to *legacy media
  URLs*, while the trusted path accepts a private/loopback **S3 endpoint**
  only in isolated CI. No model receives credentials, object keys, bucket
  endpoints or signatures. Production R2/S3 should use TLS and scoped IAM.
- Create bucket lifecycle cleanup for unused/expired objects plus retention
  rules for review, appeal and deletion requests.

## Known blockers / security claims we do NOT make

- Matching a full SHA-256 and MP4/QuickTime/WebM magic bytes proves *which
  bytes were uploaded* but not that the video is unedited, original, live,
  continuous or that the players really performed a claimed action. Liveness,
  player identity, deepfake/edit checks and reliable object-level game scoring
  need separate adjudication and appeal gates.
- The existing legacy Blob/public URL route remains available **unless**
  the explicitly separate `TRUSTED_EVIDENCE_REQUIRED_FOR_MEDIA` switch is on.
- No signed GET is generated. The private source is an in-memory server
  handle; every streamed staging operation rehashes the actual bytes before
  FFmpeg reads a local temp file and unlinks failed or tampered downloads.
  AWS SDK credentials and the private bucket must remain server-only.
- Current synchronous full-object verification doubles or triples object
  transfers. A durable bounded queue and per-file object lifecycle policy
  are required before higher-traffic release.
- File type sniffing does not replace strict codec/decoder validation,
  visual integrity review or maximum-video-duration enforcement.
- No real video victory, credit settlement or paid-provider acceptance test
  is implied by a successful MinIO smoke test. Live system/provider and
  mobile device verification must be separately conducted.
- Automatic profession XP, free-ticket issuance, owned Familiar draw and
  evolution **remain disabled**, subject to anti-farming/collusion and
  reversal/dispute policy reviews.

## Isolated CI gates

- `npm run test:trusted-evidence:smoke`: pure safe admission, policy,
  MIME and digest tests.
- `npx prisma migrate deploy` + `npx next build`: the new relations,
  migration and Next routes in disposable PostgreSQL.
- `npx tsx scripts/e2e-trusted-evidence-storage.ts`: real conditional PUT,
  replay rejection, streamed SHA and media-signature checks against ephemeral
  S3-compatible storage; no production credentials or data.
- `npx tsx scripts/e2e-trusted-evidence-journey.ts`: two disposable signed-in
  accounts, actual FFmpeg-generated MP4 files, private signed transfers, real
  PostgreSQL binding transactions, one-proof-per-player, replay/auth checks,
  no permanent public evidence URL, **post-verification object overwrite
  rejected even when file size and MP4 signature still match**, no unexpected
  credits/XP; also tests private S3 -> FFmpeg vision/timeline/dense rally
  extraction on decoded synthetic footage. This is **not** a successful AI
  winner accuracy test and deliberately does not call a live model.

Do not merge or turn on the flags until the complete isolated two-account CI,
real-device Safari transfer/return, codec corpus and real model/referee
reliability tests all pass.
