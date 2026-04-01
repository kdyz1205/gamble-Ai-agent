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

## Breaking change note

Escrow ABI changed from `bytes32` + `settle(bytes32,address)` to **`uint256` keys** + **`settle(uint256,address,bytes32)`**. Redeploy contracts and update `ESCROW_ADDRESS`.
