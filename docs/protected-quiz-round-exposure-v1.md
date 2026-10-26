# Server-private Quiz Round Exposure Ledger (staging v1)

This implements a real, authenticated **server-only staging flow**, not a public game mode.

The new `QuizPrivateRound` and `QuizPrivateExposure` database tables atomically store a fresh 256-bit server-secret nonce, pinned SHA-256 answer commitment, and six exposure records (three reviewed questions per competitor). Only two distinct existing accounts may reserve a round. Deterministic account-level PostgreSQL advisory locks and unique exposure constraints serialize concurrent pairs, including when one player switches opponents.

Repeated requests with the *same stable key* return the original round without minting extra exposures. A different opponent, topic or bank version with the same key is rejected. New requests exclude all questions seen by **either** player, across their prior opponents; no public-bank fallback occurs when inventory is exhausted.

On a server-only read, the service re-verifies Ed25519 review signatures, pinned nonce/answer commitment, topic/version, both player identities and all six exposure receipts. An interrupted, corrupted or tampered record blocks the entire read. The public-safe projection contains prompt/choices, opaque question IDs, hash and expiry; it does **not** include correct answers, offline private review key, 256-bit nonce, payouts or account balances.

The entire flow defaults OFF with `QUIZ_PROTECTED_BANK_ENABLED` absent. There is **no** public route for these reservations, no change to live Quiz creation or settlement, and no conversion to redeemable XP/tickets or purchased credits. The existing fixed-answer public Quiz remains practice-only.

The isolated PostgreSQL test `test-protected-quiz-round-db.ts` checks six concurrent same-key reservations, replay and opponent-switch protection, changing/retiring question records, server nonce tampering, missing exposure receipts, stranger reads and exact zero changes in money, Quiz settlement and Summon ledgers. Fresh and legacy migration replay covers the additive tables.

Production blockers: actual externally reviewed 96+ question pool, dual-player sealed answer submission, expiry and scoring orchestration, anti-bot/collusion/identity proof, account maturity, reward reversal/disputes, rate controls, physical iOS testing and separate production rollout approval. Do not migrate a live DB or enable the feature as part of this PR.
