# Audited zero-payment Summon draw — v1

This is **real server-owned item issuance**, not the existing 2D/3D preview animation. It remains disabled everywhere by default. Only owners with already-issued, evidence-backed **free** career tickets may intentionally spend one.

## Server guarantees

- Three independent flags must be explicitly true: `SUMMON_PERSISTENCE_ENABLED`, `SUMMON_TICKETS_ENABLED`, `SUMMON_DRAWS_ENABLED`. All default OFF. No money/USDT/stake/purchased credit increases odds or creates a ticket.
- The authenticated POST `/api/summons/free-draw` requires `professionId`, `occupationId`, a stable per-click `requestKey`, and `confirmSpend:true`. No user/account IDs, odds, currency, RNG seeds, item IDs or ticket IDs are accepted from untrusted request JSON. An unknown property rejects the request.
- PostgreSQL account-scoped advisory lock serializes all draws for **one account across every profession**. In the same transaction, independently revalidate the final, accepted Quest receipts behind every career XP row; validate minted ticket lineage; spend exactly one unused free ticket; cryptographically sample a 1e9-unit random value; mint exactly one unique owned `SummonInstance`; persist its draw receipt and one audit event.
- Receipt key is unique per account/request. Ticket ID and instance ID are unique in `SummonDrawReceipt`; account+ordinal is unique. Retrying the same request returns the original receipt and never consumes another ticket. Changing career/specialty with the same request is denied.
- Rank probabilities: Common 6000/10000, Uncommon 2700/10000, Rare 1000/10000, Epic 260/10000, Legendary 40/10000 before guarantees. After 19 consecutive non-Rare+, the next draw is guaranteed Rare+. After 79 non-Epic+, the next draw is guaranteed Epic+. Conditional draws reweight only eligible tiers without hidden stake modifiers.
- Pity is account-wide, **never reset by switching careers**. Every prior draw is replay-validated against exact stored RNG, effective weights, account, spent ticket, owned item, before/after counters and contiguous ordinal.
- New items are `form=base` and `originKind=free_ticket`. They may later evolve through a separately authenticated, versioned path. The creature catalog and 3D GLB assets remain distinct; original 3D prototypes are not final rigged/game-ready animations.
- Pilot UI offers visible odds, select career and specialty, a second irreversible confirmation, and a stable retry key across network failures. Server exposes `freeDrawsAvailable` only when the gated capability is truly active for the authenticated account.

## Migration / safety

`prisma/migrations/20261024200500_free_summon_draw_receipts` adds a receipt table, uniqueness, foreign keys and bounds checks; it never changes any existing balances, purchased credits, challenges or adjudications. New migrations must run only on **isolated** `summoner_verification` in CI. Do not deploy them to production or enable the flags without an independent rollout and rollback plan.

**Blocked before production**: anti-collusion/Quest farming controls, post-spend appeal/reversal and asset-compensation policy, independently reviewed probability fairness and disclosure, abuse rate limits, signed TestFlight and real-device energy/thermal tests. Replaying a recorded random value validates the committed result but does **not** prove the original server RNG was unbiased; stronger independent public verifiability may be needed. Purchased credits and any real-money lottery remain excluded.

## Acceptance

- `scripts/test-free-summon-draw-policy.ts`: published base odds, limits, Rare/Epic pity, account-global carry, independent gates, stable grant keys.
- `scripts/test-free-summon-draw-db.ts`: isolated real PostgreSQL, parallel retries, new request rivalry, evidence disputes, account isolation, ticket exhaustion, career change, persisted pity continuity, tamper rejection and financial invariance.
- Existing PostgreSQL Quest/XP/ticket/Quiz tests, Next production build, browser tests, exact-head Vercel preview, native iPhone Simulator/unsigned archive must remain green.
