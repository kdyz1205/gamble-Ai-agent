# Summoner.world — protected Quiz bank and competitive eligibility boundary

## Verified failure we are addressing

The current zero-stake `quiz-curated-mcq-v1` stores a **30-question fixed answer key in application source**. It is valuable for verifying game mechanics, voice -> invite -> answer -> server score and cinematic feedback, but fundamentally unsuited to awarding spendable profession XP or free Summon tickets. A determined player can read or memorize the key and win repeat matches. Proof of correct scores is not proof of honest play or unique human opponents.

**Never connect that version to `ProfessionXpEvent`, `SummonTicket`, any purchasable wager, or the free-draw/Ascension gate.** The new code does not do so.

## This stage implements

- New additive `QuizProtectedQuestion` table; the answer index, reviewed choice order and attestations live in server-only PostgreSQL, **not client JS**. The table has fixed bank-version/topic indexes and DB constraints (answer index 0-3; signature exactly 128 hex chars). Existing Quiz, Quest, user, bank, wallet and XP rows are not touched.
- Ed25519 **offline reviewer signatures** over canonical `policy, id, bankVersion, topic, prompt, choices, correct answer and review time`. The app/CI verifies using only the corresponding public PEM supplied through `QUIZ_PROTECTED_REVIEW_PUBLIC_KEY`. The reviewer **private key is never placed in the application environment, repository, or browser**. No signer exists in the app. Tampering with reviewed prompt/answer/choice order makes the row unusable.
- `QUIZ_PROTECTED_BANK_ENABLED` must be explicitly `true`; absence and malformed review key fail closed. `QUIZ_COMPETITIVE_XP_ENABLED` is **not activated** and is not an implemented payout route. The live Quiz game keeps its public practice bank unless a separate later, tested engine upgrade switches to the protected source.
- A protected topic needs **at least 96 independently signed active questions**, bounded to 5,000 per topic. Repository/public IDs cannot masquerade as private. Four normalized, distinct, bounded answer choices are required; retired questions are excluded from new rounds but remain immutable/verifiable for historical replay.
- The staging sampler uses Node cryptographic randomness and rejects a bounded list of already-exposed question IDs rather than quietly replaying them. It returns two explicitly separated objects: `public` has only prompt/choices/IDs and an answer commitment; `serverNonce` is sensitive and **must be persisted in a server-only round record before an actual game can use it**. No API uses the sampler yet.
- Commitment is SHA-256 over the pinned version, IDs, original answers and a **fresh 256-bit server-secret nonce**. This avoids the brute-force vulnerability of hashing only three 4-choice answers (just 64 possible combinations). The nonce is revealed only after finalization, enabling independent checking; a wrong nonce is rejected.
- The staged replay scorer verifies pinned question IDs, review signatures and original salted commitment *again* before it can score an answer list. It is intentionally **server-only** and currently not wired to spendable rewards.
- Isolated one-shot importer `scripts/import-reviewed-quiz-questions.ts` accepts only external, offline-reviewed JSON files, outside the Git repository, and **only** a localhost `summoner_verification` database. It cannot overwrite IDs; rejected batches fail atomically.

## Required before competitive rewards can operate

1. Populate genuinely written and independently reviewed questions from outside the public repository. The 96 procedurally generated **CI test fixtures are never a deployable question bank**.
2. Integrate the secure bank with `QuizDuel` creation, stored server-only nonce, submit, objective scoring, completion and receipt replay. Bind immutable question exposure to both verified players and enforce non-reuse across sessions and invitations. The current live engine still uses public `quiz-bank.ts` and must not be misreported as protected.
3. Implement and independently test rate/collusion restrictions: account maturity, per-player and per-opponent caps, min play durations, anti-bot checks and multi-account/appeal mechanisms. Tested final scores alone do **not** establish distinct, honest human competitors.
4. Define a reversible, versioned **Quiz-only award receipt** with a separate account/career ledger. It must not alias `verified-quest-skill-v1`; bind credits/loot to a reviewed anti-farm policy and consistent reversal/dispute semantics. Default to **no award** if anything is unverifiable.
5. Separate feature rollout approval, privacy/security review, staged database deployment, signed TestFlight, real-device FPS/thermal checks. No real-money or bought-credit Quiz wagers without specialized legal and security review.

## Verification

- `test-protected-quiz-bank-policy.ts` checks external Ed25519 attestations, tamper rejection, public-safe projection, weak or missing public keys, invalid content, retired/static bank rejection.
- `test-protected-quiz-bank-db.ts` runs only on isolated localhost `summoner_verification`: 96 actual signed database questions, no fallback, answer-key secrecy, server salt, correct/incorrect scores, replay, retired questions, and checks **no QuizDuel, profession XP, SummonTicket or CreditTx were created**.
- Fresh/legacy migration replays include the additive private table and assert it never updates monetary, account or Quest tables. Full existing Quiz, XP, Summon, browser, native iPhone and Vercel regressions must remain green.

This is a production-safety foundation, **not** finished anti-cheat, not a launched private Quiz mode, and not a promised competitive award. No production mutation or flag activation is permitted in this PR.
