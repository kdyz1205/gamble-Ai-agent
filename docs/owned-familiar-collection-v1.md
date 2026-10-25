# Summoner.world — server-verified owned Familiar collection

This is a **read-only** iOS Familiars inventory, NOT a local random draw, preview, simulation or clone of the career catalog.

## What constitutes ownership
- `GET /api/summons/me` requires a verified session. Existing `inventory` and Pico starter availability remain unchanged for backward compatibility.
- The additive `ownedCollection` surface is separate and only activates when `SUMMON_PERSISTENCE_ENABLED`, `SUMMON_TICKETS_ENABLED`, and `SUMMON_DRAWS_ENABLED` are all true. Default: OFF.
- The internal `readOwnedFreeDrawInventory(ownerId)` takes the same account-wide lock as ticket redemption. It replays *all* versioned draw receipts, verifies the stored RNG, cross-career pity continuity, spent grant keys, ticket owner, exact profession/occupation/rarity/species, owned item ID, status and owner. It also checks the number of free-ticket inventory records equals the number of draw receipts. Unreceipted or corrupted items fail closed rather than appear as earned.
- The API separately invokes `readFreeCareerTicketLedger`, which validates current Quest settlement/source evidence for those audited tickets. The new read operation never spends tickets, mints items, calls an AI judge, adjusts credits, or edits account state.
- If the feature is inactive or the database cannot be verified, the owned collection is **UNKNOWN**, not 0. Enabled accounts with no backed draws show an actual empty collection. Loading and errors never reveal stale item IDs.
- Up to 50 most recent owned items are displayed; when exactly 50 are present, `totalKnown=false` conservatively signals there may be older items. The backend still verifies the full bounded draw history, not just the most recent 50.
- A collection card shows unique persisted instance ID, profession, occupation, rarity, current form and record date. Existing 2D art is labeled a **concept illustration**, never the literal earned 3D model. Careers without approved concept art receive a neutral letter crest, not an invented species render.
- Pico's separate starter entitlement remains unchanged. 3D procedural blockouts, local preview rolls, fusion recipes and unevaluated Quest XP do not enter the owned collection.

## Verification
`scripts/test-owned-summon-contract.ts`: fail-closed wire schema, duplicate IDs, unsupported species, unsafe dates, disabled vs truly empty state and 50-item pagination.
`scripts/test-owned-familiar-render.tsx`: real server-rendered collection cards, anonymity, loading, offline fallback and artwork provenance.
`scripts/test-free-summon-draw-db.ts`: isolated PostgreSQL validates three actual drawn items across software and athletics; rejects forged orphan inventory and tampered history, confirms cross-account isolation. Draw/inventory flags remain OFF in production.

No production database migration, TestFlight signing or main-branch deployment is authorized by this presentation/inventory-read task.
