# Private evidence upload intake (opt-in)

Status: implemented intake and verification endpoints, **not enabled or integrated into challenge submission, AI Judge or settlement**.

## Why this is a separate path

Existing `/api/uploads/evidence-presign` and Vercel Blob uploads return
public URLs for the older judge. They remain unchanged. Passing a client
supplied URL or its metadata is not proof that it is a genuine recording.

The new intake uses a **separate, private S3-compatible bucket** and a DB
`TrustedEvidenceUpload` row. An issued session belongs to one signed-in
participant and one challenge. It must be finalized by server-side object
verification before any future evidence binding.

## Configuration

- `ENABLE_TRUSTED_EVIDENCE_UPLOADS=true`: opt in (default is off).
- `S3_TRUSTED_EVIDENCE_BUCKET`: **a private bucket**, must differ from
  `S3_EVIDENCE_BUCKET`. Never attach a public CDN/domain to this bucket.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`: credentials
  scoped to this bucket. Use `AWS_REGION=auto` for Cloudflare R2.
- `S3_TRUSTED_EVIDENCE_ENDPOINT`: optional custom endpoint (R2 uses
  `https://<account-id>.r2.cloudflarestorage.com`).
- `S3_TRUSTED_EVIDENCE_FORCE_PATH_STYLE=true` when required by provider.
- Configure bucket CORS to allow the app origin for PUT, `Content-Type`,
  `If-None-Match` headers. Do **not** allow unrestricted origins in production.
- Add a private-bucket lifecycle rule for abandoned uploads and align evidence
  retention with dispute/privacy requirements. The cleanup job is not in this PR.

## API

`POST /api/uploads/trusted-evidence` (authenticated)

```json
{"challengeId":"...","contentType":"video/mp4","fileSizeBytes":12345,"recordingSessionId":"..."}
```

- Only accepted challenge participants while its evidence window is open.
- Recording session ID is mandatory when the protocol requires it and must
  belong to the authenticated user/challenge.
- Supported types: MP4, QuickTime, WebM, JPEG, PNG, WebP.
- Video limit 100 MiB; image limit 20 MiB; 5 outstanding active sessions
  per user. The signed URL lasts 15 minutes.
- Returns `uploadSessionId`, `uploadUrl`, `headers`, `expiresAt`.
  There is **no public media URL**.

Client uploads the file directly to the returned URL:

```ts
const ticket = await issueTrustedEvidenceUpload({
  challengeId, contentType: file.type, fileSizeBytes: file.size,
});
const response = await fetch(ticket.uploadUrl, {
  method: "PUT", headers: ticket.headers, body: file,
});
if (!response.ok) throw new Error(`PUT failed (${response.status})`);
const receipt = await completeTrustedEvidenceUpload(ticket.uploadSessionId);
if (receipt.status !== "verified") throw new Error("Not verified");
```

Conditional `If-None-Match: *` is **part of the signed PUT request**, ensuring
the same object cannot be overwritten through a replayed signed URL.

`POST /api/uploads/trusted-evidence/{uploadSessionId}/complete` (authenticated)

- Re-checks ownership, challenge status, state, expiration.
- Checks the actual object's HEAD length and declared type.
- Streams GET with a byte cap, computes SHA-256 and checks basic media magic.
  ETag is **not** treated as the cryptographic checksum; no client-supplied
  checksum is promoted to trusted data.
- Persists SHA-256, size and verification time with an atomic compare-and-set
  (`issued -> verified`). A second completion returns the same receipt.
- **Basic file signatures do not prove the video is unedited or authentic.**
  Decoder validation, provenance, identity and AI Judge remain separate steps.

## Known boundaries before production enablement

1. This is an intake milestone. A `verified` upload is **not** an `Evidence`
   row and cannot trigger judging or credits. Implement binding/consumption as
   a single idempotent DB transaction before connecting to Judge.
2. The existing Judge still reads public HTTPS URLs. Implement short-lived
   authorized read access for trusted objects at judge time, not a stored
   expiring URL and not a publicly exposed bucket.
3. Verification performs a bounded **server-side download**; move it into a
   durable processing queue before high traffic. This route has a 300-second
   execution cap, so slow uploads/completions may need retry/refactor.
4. Signed PUT does not enforce an ingress byte cap on every S3-compatible
   provider. The server rejects oversized objects at completion, but abandoned
   objects still require bucket-side lifecycle and abuse/quota controls.
5. Stream hashing and signatures do not detect deepfakes, edits, replays or
   spoofed participants. Human/AI review and challenge-specific protocols are
   required. Never settle credits solely on this receipt.
6. Actual S3/R2 CORS, conditional PUT behavior, object integrity, process
   interruptions and iOS thermal performance need environment/device E2E
   tests before activation.

## Local/CI checks

```sh
npm run smoke:evidence-admission
npm run smoke:upload-session-policy
npm run smoke:trusted-evidence-intake
npm run lint
npm run build
```

The CI job also deploys all Prisma migrations into a disposable PostgreSQL
service and executes `next build`. These unit/CI tests do not contact a
real S3/R2 bucket; successful CI is not proof of real mobile upload behavior.
