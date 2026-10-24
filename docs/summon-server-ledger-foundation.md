# Summoner.world server ledger foundation (feature-gated)

## Explicit release boundary
New Prisma models and additive SQL migration are for isolated verification first.
SUMMON_PERSISTENCE_ENABLED must be set exactly to true before any new database write.
Flag OFF is the default, retains read-only virtual Pico eligibility, and avoids querying the new tables.
Vercel buildCommand uses prisma generate and next build, not prisma migrate deploy.
GitHub CI uses an isolated local PostgreSQL and applies the migration there.
Do NOT activate on production before migration review, rollback readiness and data integrity checks.

## Tables
SummonInstance: owner, species, unique grantKey, origin, optional career genes, rarity, form, status.
ProfessionXpEvent: immutable receipt keyed uniquely by user, Quest, profession and rule version.
SummonTicket: owner-bound future grant/spent state with unique key, no current minting endpoint.
Migration creates new tables and indexes; leaves Credits, User balances and Quest settlement untouched.

## Starter behavior
New signup after flag enable inserts its Pico inside existing auth provisioning transaction.
Concurrent or repeated starter activation uses unique grantKey starter:pico-universal-v1:{userId}.
Existing accounts claim through authenticated POST /api/summons/starter/claim after GET says persistence is active.
Guests cannot activate a starter, request another account's grant, or spend credits.
Enabled-mode missing migration returns 503, not an invented empty inventory.
Unbackfilled XP and tickets remain null/unknown, never misleading zero.

## Internal XP reconciliation, intentionally NOT wired into live settlement
Only supported fixed Quest categories Coding, Fitness, Cooking can map to profession families.
Require settled state, two accepted creator/opponent players, proof from both, final consent or resolved review,
and a consistent completed final judgment/winner. Unsettled, disputed, third-party and unsupported types fail closed.
XP is fixed win 100 / proof-accepted loss 80, NEVER multiplied by cash, credits or wager size.
Unique source eventKey prevents double credit. Conflicting replay fails for manual audit.
Still missing anti-collusion, frozen profession tags, dispute reversal and historical backfill.
No public XP-awarding endpoint. Real Summon draws, paid chance, ticket consumption and fusion remain disabled.

## Verification gates
Schema validate; isolated-Postgres migration; concurrent starter claim and XP fixture tests;
TypeScript, ESLint, complete CI and native Simulator verification. Existing production remains unchanged.
Release activation must be separately approved and executed only after schema migration verification.
