# Summoner.world — Audited Free Profession Ticket Issuance

Status: gated internal service only. No production activation and no public ticket-mint endpoint.

## Outcome
Profession XP is tied to real proof-accepted, finally settled Quests, with immutable source receipt keys.
An authenticated player's distinct career families accumulate XP independently.
A free ticket is eligible at profession XP thresholds 100, 250, 450, 700, 1000, etc., using the existing public concept rule.
A player can train multiple professions; the first robotics/software ticket never counts toward athletics and vice versa.
Winning does give more profession XP than losing with valid proof, but wager sizes, purchased credits, crypto, deposits and cash transfers have ZERO effect on XP or ticket entitlement.

## Security gates
- SUMMON_PERSISTENCE_ENABLED=true AND SUMMON_TICKETS_ENABLED=true are both required.
- Both flags default OFF; no live callers currently invoke ticket issuance.
- No new database migration or changes to the existing CreditTx or settlement paths.
- Internal reconcileFreeCareerTickets reads only persisted profession XP events.
- It revalidates CURRENT source Quest status, both players' proof and acceptance/review, final judgment receipt and player outcome.
- A refunded/reversed/disputed Quest blocks new ticket issuance, requiring manual review of previous receipts.
- Corrected or inconsistent XP events, incomplete snapshots (over 2000 rows), duplicate Quest keys and unsupported occupations fail closed.
- The unique grant key includes rule version, account ID, career ID and ordinal, not a user-controllable event.
- PostgreSQL per-account/per-career advisory transaction locks plus conflict-safe createMany protect concurrent workers.
- Ticket already marked spent stays spent. A revoked or conflicting ticket record blocks reconciliation until an auditor resolves it.
- Ticket can NOT currently be spent; no paid random draw or fusion occurs.

## Provenance and limitations
The current XP source service is internal and not yet called by production settlement. It handles only frozen fixed Quest categories: Coding, Fitness, Cooking. Any expansion to 360+ careers requires signed, agreed, pre-acceptance occupation tags and anti-collusion safeguards.
Event coverage is explicitly 'recorded-verification-events-only': this is NOT a complete lifetime XP backfill.
A dispute/reversal after a ticket was spent is not automatically clawed back. Do not activate until an auditable correction and asset reconciliation policy exists.
Ticket generation is independent of the gacha rarity simulation. No chance-based earning from monetary stakes is allowed.

## Verification
- scripts/test-free-ticket-planner.ts checks exact thresholds, stable cross-account/career IDs and failure cases without a database mutation.
- scripts/test-summon-ledger-db.ts runs against isolated local PostgreSQL and tests 10 simultaneous ticket reconciles, milestone crossings, two professions, owner separation, retained spent status and invalid/fraudulent/refunded/corrected source rejection.
- CI runs on its own ephemeral database; migration of any real database is a separately authorized release operation.

## Next
After explicit policy review: add immutable profession tags at Quest acceptance, anti-farming caps, reversal compensation, safely-bound client progress views, a cryptographic server RNG/ticket-spend transaction, pity receipts and cross-profession fusion.
