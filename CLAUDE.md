# CLAUDE.md

## Mission
This repository is a chat-first challenge platform, not a generic social app and not a generic dashboard.
The core product loop is:
natural user intent -> structured challenge draft -> publish -> participation -> evidence -> judgment -> settlement

Every change must protect or improve that loop.

## Product Identity
The system is:
- chat-first
- challenge-driven
- credits-aware
- evidence-based
- AI-judged
- settlement-sensitive

Do not redesign it as a cluttered multi-panel admin product.
Do not weaken the conversational entry flow.

## Non-Negotiable Priorities
When tradeoffs exist, prioritize in this order:
1. state correctness
2. credit and settlement safety
3. API contract integrity
4. user flow continuity
5. maintainability
6. responsiveness
7. UI polish

## Core Engineering Model
Treat this codebase as a coordinated system of:
- challenge lifecycle state
- participant state
- evidence submission
- AI judgment
- credits usage and top-ups
- settlement outcome
- audit trail

These are not separate features.
They are one connected product machine.

## Challenge State Rules
Challenge status is a core state machine.
Do not casually add, skip, merge, or reinterpret states.

Any change touching challenge lifecycle must account for:
- creation
- clarification
- publishing
- acceptance
- evidence submission
- judging
- settlement
- cancellation / dispute / recovery

Do not allow:
- impossible transitions
- duplicate settlement
- silent divergence between UI state and backend state
- repeated charging
- repeated reward distribution
- partial success without clear recovery behavior

## Credits / Money Safety Rules
Credits, stake accounting, top-ups, AI usage deductions, refunds, and rewards are high-risk flows.

When touching balance or settlement logic:
- assume financial correctness matters more than speed
- prefer idempotent handlers where relevant
- preserve auditability
- never update balances implicitly
- never leave money-moving logic hidden inside UI assumptions
- never guess on balance math
- make failure behavior explicit

If a charge, refund, or settlement can happen twice, that is a bug unless explicitly designed and guarded.

## API and Type Contract Rules
This repository depends on typed front-end / back-end contracts.

When changing behavior:
- update server route behavior
- update client wrappers and types
- update UI expectations
- update loading and error states
- verify returned shape still matches actual usage

Changing only schema or only UI is not enough.

## Database Rules
Prisma changes must be conservative.

Prefer:
- additive migrations
- migration-safe evolution
- preserving existing entity relationships
- changes justified by real product flow

Be especially careful around:
- User
- CreditTx
- Challenge
- Participant
- Evidence
- Judgment
- JudgeJob
- AuditLog

Do not casually collapse or rename core entities without strong reason.

## Chat-First UX Rules
The homepage and main flow should remain intentional and minimal.

Rules:
- preserve the composer-first entry
- keep progressive disclosure
- avoid dashboard clutter
- do not surface advanced controls before they are needed
- make the next valid action obvious
- treat confusion as a product bug

## Failure Handling Rules
Always consider:
- missing coordinates
- missing evidence
- insufficient credits
- model/provider failure
- async judge job failure
- settlement failure
- duplicate requests
- partial write success

Avoid flows that only work in the happy path.

## Verification Rules
For meaningful changes, reason through or validate:
- challenge parse
- challenge create
- challenge accept
- evidence submit
- judgment request
- async judge job polling
- credit mutation
- settlement result

## Output Rules
When reporting work:
- start with the product-level conclusion
- then list exact files, routes, schema, or components touched
- then explain why the state machine remains coherent
- then mention remaining risks or unverified paths
- explicitly call out high-risk assumptions

## Anti-Patterns
Do not:
- turn the product into a generic dashboard
- optimize visuals while weakening correctness
- patch the UI while ignoring state integrity
- change credits logic casually
- widen scope into a rewrite
- add "smart" behavior without preserving contract clarity
- treat settlement-sensitive code as normal UI code

## Definition of Done
A task is not done unless:
- the main challenge flow still works
- state transitions remain coherent
- credits logic is still safe
- frontend and backend contracts still align
- obvious failure states were considered
- the implementation remains maintainable
