# Off-chain AI oracle + on-chain settlement — instruction set

This app treats the AI backend as an **off-chain oracle**: the model produces a verdict in PostgreSQL; the **single `judgeAddress` wallet** is the only on-chain actor that may lock funds (`beginJudging`) and release them (`settle`).

## Phase 1 — Trust base: escrow state machine (`ChallengeEscrow.sol`)

| Solidity `State` | Meaning |
|------------------|---------|
| `Created` | Creator deposited; waiting for opponent. |
| `Active` | Both sides deposited; evidence window (off-chain). |
| `Judging` | Oracle locked the pool — **no `cancel` / refund** on-chain. |
| `Settled` | `settle` executed; ERC-1155 payout done. |
| `Disputed` | Escalation; use `resolveDispute` (owner) to complete payout. |

- **Challenge id (on-chain):** `uint256(uint256(keccak256(utf8(offChainPrismaId))))` — see `challengeIdToUint256` in `src/lib/contracts.ts` (must match how challenges were created on-chain).
- **`onlyJudge`:** `msg.sender == judgeAddress` (rotatable by `owner` via `setJudge`).
- **`settle(challengeId, winner, evidenceHash)`:** requires `State.Judging`, `evidenceHash != 0`, then immediate `safeTransferFrom` payout (ERC-1155 batch semantics).
- **`beginJudging`:** moves `Active → Judging`; the backend should call this before `settle` if the chain is still `Active` (handled in `settleOnChain`).

## Phase 2 — Oracle logic (application / AI)

- Aggregate **rules + description + deadline + evidence** in `judgeChallenge`; emit structured JSON verdict; persist `Judgment`; **`verdictCommitmentHash`** on `settle`.
- **Vision (real pixels):**
  - **Photos:** HTTPS fetch (capped) → `sharp` → JPEG → multimodal API (Anthropic / OpenAI-compatible / Gemini).
  - **Videos (direct MP4/WebM):** `ffprobe` duration → **adaptive frame count** (`video-strategy.ts`) → `ffmpeg` evenly spaced JPEGs → same multimodal path.
  - **YouTube watch pages:** not auto-ingested; use **direct file** URLs or images.
  - **Safety:** `evidence-url.ts` (HTTPS, SSRF blocks); optional `EVIDENCE_URL_HOST_ALLOWLIST`.
- If no decodable media is produced, the judge falls back to **text-only** prompts (URLs/descriptions only).

## Phase 3 — Economics

- **Off-chain credits** or **on-chain burns** still gate inference (`spendForInference`).
- Settlement moves **staked ERC-1155** per token tier, not ETH `transfer` (tokens are the stake asset).

## Phase 4 — Operations

- Deploy escrow with **`constructor(_usageToken, initialJudge)`**; `initialJudge` must equal `SERVER_PRIVATE_KEY`’s address (or the key you use for `writeContract`).
- Env: `ORACLE_DEFAULT_PROVIDER` optional default for cron/automation when the UI does not send `providerId`.
- Optional LLM keys: see `src/lib/llm-providers.ts` (`OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `GROQ_API_KEY`, …).

## App 录制 → 判定 → 结算（推荐闭环）

1. **直传对象存储（可选）**  
   `POST /api/uploads/evidence-presign`（需配置 AWS + bucket）→ App **PUT** 到 `uploadUrl` → 把返回的 **`publicUrl`** 写入证据 `url`（不要经 Node 收整段 MP4）。

2. **触发裁决**  
   - **同步**：`POST /api/challenges/[id]/judge`（等待 ffmpeg + 多模态 + 结算）。  
   - **异步（推荐 App）**：`POST /api/challenges/[id]/judge/async` → **202** `{ status: "processing", jobId, pollUrl }`，服务端用 Next `after()` 跑 `runJudgeJob`；客户端轮询 **`GET /api/judge-jobs/[jobId]`** 或传 **`webhookUrl`**（公网 HTTPS，走与证据相同的 SSRF 规则）。

3. **防伪 / 元数据**  
   App 端可在录制时写入时间戳、GPS 等到证据 **`metadata`**（JSON）；后端已支持存库，判词 prompt 仍以 `description` + 视觉帧为主，可按产品需要把 metadata 拼进 prompt。

4. **部署**  
   Vercel 上 `ffmpeg-static` 体积与 `after()` 行为需自行验证；重负载时可将「抽帧 + 调用模型」拆到 **Cloud Run / Lambda 容器**。

## Breaking change note

Escrow ABI changed from `bytes32` + `settle(bytes32,address)` to **`uint256` keys** + **`settle(uint256,address,bytes32)`**. Redeploy contracts and update `ESCROW_ADDRESS`.

## Phase 5 — Discovery, state machine, parse schema, audit

### Challenge-level discovery (creator geo)

- On **create**, the API snapshots `discoveryLat` / `discoveryLng` from the creator’s `User` row (if present).
- **`GET /api/challenges/discover?lat=&lng=&limit=`** — sorts open public challenges by distance: snapshot first, else creator’s current profile lat/lng.
- **`GET /api/users/nearby`** — still returns nearby users; challenge list includes optional `discovery: { distanceMiles, source }` when GPS is sent.

### Status enums (PostgreSQL)

- `ChallengeStatus`, `ParticipantRole`, `ParticipantStatus` are native enums in Prisma; illegal transitions throw in accept / evidence / judgment paths (`src/lib/challenge-state-machine.ts`).

### AI parse — fixed JSON

- LLM output must match **`src/lib/parse-bet-schema.ts`** (Zod `.strict()`). `POST /api/challenges/parse` rejects invalid payloads with **502**.

### AuditLog

- Append-only rows for create, accept, evidence, status→judging, judgment complete, and cron deadline transitions. Query table `AuditLog` in SQL / Studio for investigations.

### Related sites / consoles (checklist)

**This app on Vercel (dashboard):** [gamble-ai-agent — kdyz1205s-projects](https://vercel.com/kdyz1205s-projects/gamble-ai-agent) — use **Settings → Environment Variables**, **Deployments** (production URL for `NEXTAUTH_URL`), and connect **Git** to `kdyz1205/gamble-Ai-agent` if the checklist still shows “Connect Git Repository”.

| Where | What to align with production |
|--------|-------------------------------|
| **Vercel** | Set `DATABASE_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET` (generate locally: `npm run gen:cron-secret`). **`npm run build:vercel` now runs `prisma migrate deploy`** so each production deploy applies migrations. **Set `NEXTAUTH_URL` to your canonical domain** (copy from **Domains** — e.g. `https://…vercel.app` or custom domain); preview deployments should set `NEXTAUTH_URL` to that preview URL if you test Google sign-in there. |
| **Google Cloud OAuth** | Authorized redirect URI: `https://<your-domain>/api/auth/callback/google` |
| **Supabase** (if using Realtime) | Same project as DB when possible; run **`scripts/sql/supabase-realtime-publication.sql`** in SQL Editor (adds `"Challenge"` / `"Participant"` to `supabase_realtime`); set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| **Vercel Cron** | `CRON_SECRET` env; cron hits `/api/cron/challenge-judgment` with `Authorization: Bearer <CRON_SECRET>` (see `vercel.json`). |
| **Pricing microsite** (optional) | Set `NEXT_PUBLIC_PRICING_SITE_URL` to the deployed pricing app so the main app shows the finance link. |
| **S3 / CDN** (optional uploads) | `AWS_*` + `S3_EVIDENCE_BUCKET` + `S3_PUBLIC_BASE_URL` for presigned evidence. |
