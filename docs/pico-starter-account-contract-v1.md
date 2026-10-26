# Pico Starter — Authenticated Account Rule (Read-only v1)

Scope: first genuine account-bound eligibility contract, not a minted collectible. Every authenticated player is eligible for a free Pico by universal product rule, without requiring wins, payment, specific occupation or chance draw.

## Public catalog
GET /api/summons/catalog
- HTTP 200 to guests and authenticated users.
- Versioned categories (12), example skills (36), base rarity odds and free Pico.
- Non-Pico species marked concept-preview-only, not owned or claimable.
- No user data or account writes; public caching permitted.

## Authenticated starter
GET /api/summons/me
- 401 without authentication, 503 on session infrastructure failure.
- Requires trusted NextAuth session user ID. Ignores any untrusted supplied account ID.
- Cache-Control private no-store, including error responses.
- Returns Pico as virtual universal entitlement with persistedInventory=false, tradable=false, supportsFusion=false.
- XP, summon tickets, extra inventory are null/unknown, not fabricated 0 or an empty owned list.
- No database writes, monetary spending, actual item minting or AI judgment.

Frontend only confirms account eligibility on successful authenticated response. Guests see a sign-in explanation.

## Remaining work
1. Add independently reviewed additive inventory schema, idempotent starter grant, and audit log.
2. Secure, settlement-proven, participant-scoped profession XP event ledger and free-ticket issuance with once-only identity.
3. Cryptographically secure server RNG, pity state, transaction-safe ticket consumption.
4. Consent-bound fusion with item instance ownership, versioned recipes and audit receipts.
5. Real authenticated test-account end-to-end verification, not invented claims.

This PR is deliberately read-only; no migration, payment, credits, betting amount, settlement or protected judge logic changes.
