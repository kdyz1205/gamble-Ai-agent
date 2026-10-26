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
- Local controlled-provider CI has verified the winner-recommendation,
  two-player consent and zero-stake settlement path. This **does not validate
  live model accuracy**. A separate one-off synthetic badminton test uses
  `tsx scripts/test-scored-match-judge.ts --live`; it now refuses to run
  without an accessible isolated `summoner_verification` PostgreSQL database
  and `AI_REQUEST_CALL_LIMIT=2`. Do not bypass the AI usage reservation
  audit or use production database credentials for a provider experiment.
- Live system/provider accuracy, real phone capture and outdoor game footage
  still require explicit device/provider testing before payout or XP issuance.
- Automatic profession XP, free-ticket issuance, owned Familiar draw and
  evolution **remain disabled**, subject to anti-farming/collusion and
  reversal/dispute policy reviews.

## XP / Familiar award admission — not automatic issuance

- A winning AI recommendation and both players clicking Accept are **not enough**
  to automatically issue spendable XP, draws or an owned Familiar.
- `evaluateTrustedXpAdmission` is a pure read-only rule and
  `assessTrustedQuestXpForManualReview` uses a read-only PostgreSQL snapshot.
  Both return **manual-review candidates only**, never XP values or grants.
- The policy requires a final settled winner and two accepted players, two
  participant-owned consumed private media receipts (exact size, MIME, SHA,
  verified and consumed timestamps), a high-confidence outcome or a resolved
  manual review, and final consent where no review overrides it.
- It rejects reusing a media SHA-256 from another Quest and blocks additional
  same-opponent XP candidates after two previously credited matches within a
  seven-day window. Shared-camera video in the **same** Quest is allowed.
- This is only an initial anti-replay/collusion barrier. Distinct users may
  still collude, splice/edit video, or intentionally lose. A future separate
  moderator/anti-farm approval and durable award outbox are required before
  allowing automatic XP issuance. The existing internal reconciler remains
  **disabled in production**, and no settlement hook grants XP.
- Controlled local mock-video winner tests prove engineering wiring but not
  real model accuracy or verified human performance.

## Independent moderator clearance for video/photo XP

**All flags default OFF**, including `SUMMON_XP_MANUAL_REVIEW_ENABLED`.
The new additive `VerifiedXpApproval` table preserves one reviewer-signed
authorization per (Quest, recipient). It references the **exact final
Judgment ID and a SHA-256 of the server-provenance snapshot**: two consumed
private-media receipts, both participant roles, both consent decisions,
review status and resolved winner.

- A reviewer must hold `User.isReviewer=true` and must **not** be a player
  in the same Quest. `POST /api/reviews/xp` requires authenticated moderator
  permissions and `confirm=true`. Its explicit actions are `approve`,
  `revoke` and `issue`, with `challengeId`, `ownerId` and a 25+ character
  `reason` for approval/revocation.
- `approve` writes an immutable, idempotent, separate decision. It never
  issues XP, tickets or owned items.
- `issue` is separately confirmed by an independent moderator. Its current
  Quest/proof fingerprint, reviewer authorization, appeal state and final
  judgment are **rechecked in the SAME transaction as the XP receipt**.
  Any removed consent, replaced private media, reopened appeal, forged
  receipt or revoked approval fails closed.
- `revoke` blocks issuance of an unused approval. If XP is already awarded,
  revocation refuses automatic clawback; a separate explicit ledger correction,
  ticket freeze and owned-item review will be necessary.
- `ProfessionXpEvent.eventKey` remains unique and idempotent across retries.
  When the separate `SUMMON_TICKETS_ENABLED=true` feature is explicitly
  activated, a moderator's confirmed XP issuance subsequently runs the
  existing audited and idempotent free-career-ticket milestone reconciler.
  A failure returns **XP committed / tickets pending reconciliation**, not
  a false success or a second XP grant; the same action is safe to retry.
- A free ticket is **not an owned Summon**. The player must separately
  confirm a free-ticket draw behind `SUMMON_DRAWS_ENABLED=true`. That
  server-owned transaction spends exactly one audited free ticket, uses
  cryptographic randomness and stores the pity/RNG/rarity receipt alongside
  one account-owned Familiar instance. A repeated client request key
  replays that original receipt **without consuming another ticket**.
  Draws and Familiar evolution have distinct opt-in flags; issuing XP
  alone never auto-mints a creature.
- The isolated CI E2E now verifies the complete synthetic route:
  two private MP4 proofs → mock referee outcome → double consent →
  independent moderator → exactly one 100-XP receipt → one free milestone
  ticket → **separate explicit user draw** → one owned Familiar. It also
  tests duplicate/reused keys and refuses a second ticket spend. No real
  user XP, paid AI model, wager, production grant or silent draw occurs.
- `node scripts/qa-free-summon-draw-mobile.cjs` separately mounts the real
  FreeSummonDrawPanel in a 390px Chromium browser against an isolated HTTP
  fixture. Viewing tickets, selecting a career and reviewing consent cause
  **zero POST requests**. An explicit Confirm triggers the POST. A simulated
  network timeout retains the exact same request key for safe retry; the
  accepted server receipt refreshes the display, and a disabled feature
  shows no active draw button. The UI test complements rather than replaces
  the real S3/PostgreSQL RNG, ticket and owned-inventory E2E test.
- A second **authenticated full-stack mobile test** is incorporated into
  `e2e-private-video-referee-consent.ts`: after synthetic verified private
  video, consented settlement, independent moderation, 100 XP and one
  free-ticket milestone, Chromium signs in to the REAL Next Web App as the
  same isolated fixture account. Opening `/app/picos` and reviewing/canceling
  a draw must not send an HTTP POST. Explicit Confirm sends exactly one
  request to the real `/api/summons/free-draw` endpoint; the response's
  owned inventory ID appears in the App, and database checks verify one
  consumed ticket, one free-ticket Familiar, stable retry idempotency and
  unchanged credit balances. A separately signed-in opponent's inventory
  stays empty; replaying the winner's exact draw key under the second account
  is rejected. The Next server's progression flags are ON
  **only for that disposable GitHub CI PostgreSQL job**, never for public
  preview or production.
- Source review approvals use a separate new table; **no legacy Evidence,
  Challenge or User columns are modified** in this migration. Preview builds
  keep all read/write calls behind the disabled feature flag.

This is a staging **manual** release gate. Nothing in the ordinary challenge
settlement hook auto-approves or auto-issues XP. Production needs real
moderation procedures, appeal/reversal workflows, abuse analysis and consent.

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
