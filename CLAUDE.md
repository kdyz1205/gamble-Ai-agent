# CLAUDE.md

## Mission
This repository is a real product, not a demo.
It is a chat-first challenge platform where users express a challenge naturally, structure it through AI, publish it, stake credits, submit evidence, receive a verdict, and settle the outcome.

Every meaningful change should improve one or more of these:
- challenge flow clarity
- state correctness
- credit safety
- judgment reliability
- settlement integrity
- production readiness

## Product Identity
This codebase is not:
- a generic social feed
- a generic dashboard
- a normal CRUD app
- a UI experiment

This codebase is:
- chat-first
- challenge-driven
- credit-sensitive
- evidence-aware
- AI-judged
- settlement-sensitive

The primary user experience starts from a clean conversational entry and progressively expands into draft, live challenge, evidence, verdict, and settlement.

## Current System Shape
Treat the repository as a coordinated system composed of these layers:

1. conversational challenge intake
2. structured draft generation
3. challenge state machine
4. participant management
5. evidence collection
6. AI parse / AI verdict / async judge jobs
7. credits ledger and top-up flows
8. settlement and audit trail
9. discovery / nearby / geolocation surfaces
10. auth and identity

Do not optimize one layer while breaking another.

## Source of Truth Files
When changing core behavior, these files are high-signal anchors:

- `src/app/page.tsx`
  Main chat-first entry flow and product interaction model.

- `src/lib/api-client.ts`
  Frontend contract surface for parse / challenge / evidence / judge / credits / nearby.

- `prisma/schema.prisma`
  Canonical data model for users, credits, challenge lifecycle, evidence, judgments, async jobs, and audit logs.

- `src/lib/challenge-state-machine.ts`
  State transition rules and guards.

- `src/lib/credits.ts`
  Credits ledger, stake/spend/settle/refund logic, tier multipliers.

- `src/lib/challenge-judgment.ts`
  Orchestration: AI verdict + settlement + audit in one path.

- `src/lib/ai-engine.ts`
  AI parse and AI judge prompt construction, multimodal evidence handling.

- `package.json`
  Build and deployment assumptions, especially Prisma generation and migration behavior.

Always inspect the relevant source-of-truth files before making structural changes.

## Non-Negotiable Priority Order
When tradeoffs exist, prioritize in this order:

1. state correctness
2. credit / settlement safety
3. API contract integrity
4. end-to-end challenge flow continuity
5. maintainability
6. responsiveness
7. UI polish
8. novelty

If a change makes the UI prettier but weakens state integrity, it is the wrong change.

## Default Working Style
Claude Code should behave as a disciplined product engineer inside this repo.

Default behavior:
- understand the existing flow before editing
- make the smallest change that correctly solves the problem
- fix root causes, not only surface symptoms
- preserve working behavior unless change is intentional
- prefer alignment across layers over isolated local fixes
- do not widen scope into a rewrite without strong justification
- keep the solution realistic for a solo founder or very small team

## Homepage and UX Rules
The homepage is a product primitive, not a disposable landing page.

Rules:
- preserve the chat-first / composer-first entry
- preserve progressive disclosure
- keep the primary path obvious
- avoid cluttering the initial experience with admin-style controls
- treat confusion as a bug
- do not move advanced actions earlier unless product logic truly requires it

The intended flow is:
user intent -> clarifications -> draft -> publish -> live challenge -> evidence -> verdict -> settlement

Do not break that mental model casually.

## Challenge State Machine Rules
Challenge state is a core system and must be treated like a state machine, not a flexible label.

The lifecycle currently includes:
- draft
- open
- matched
- live
- judging
- pending_settlement
- settled
- cancelled
- disputed

Do not:
- skip states casually
- reinterpret meanings silently
- add transitions without reasoning through downstream effects
- let frontend state imply a backend state that does not exist
- allow state transitions that can produce duplicate settlement or ambiguous ownership

Any change touching challenge lifecycle must consider:
- creation
- publication
- opponent acceptance
- evidence submission
- verdict generation
- async judge completion
- settlement
- dispute / cancellation / recovery

## Participant Rules
Participants are not cosmetic rows.
They define role, acceptance, and challenge legitimacy.

When changing participant logic:
- preserve creator / opponent / spectator semantics
- preserve uniqueness constraints
- keep acceptance behavior explicit
- do not let UI imply participation that backend has not recorded
- do not let challenge state advance without participant consistency

## Credits and Ledger Rules
Credits are a financial-like system and must be treated conservatively.

Relevant transaction classes include:
- topup
- ai_parse
- ai_judge
- stake
- win
- loss
- refund
- bonus

When touching credits:
- assume correctness matters more than shipping speed
- preserve ledger clarity
- preserve balance-after correctness
- avoid implicit mutations
- avoid hidden side effects
- prefer auditable writes
- prefer idempotent settlement where relevant

Never treat credits as a UI-only counter.
Credits are a ledger-backed product primitive.

## Settlement Rules
Settlement is a high-risk path.

When changing settlement logic:
- ensure stake accounting is coherent for all participants
- ensure win / loss / refund behavior is explicit
- avoid double settlement
- avoid duplicate reward issuance
- avoid silent partial success
- preserve tx hash storage where relevant
- ensure audit logging is not weakened

If a charge, reward, refund, or settlement can occur twice under retry conditions, that is a bug unless explicitly guarded.

## Audit and Traceability Rules
This repository already models `AuditLog`.
Preserve or improve auditability whenever changing sensitive flows.

Sensitive flows include:
- credit mutation
- challenge state transition
- async verdict completion
- settlement
- actor-target actions
- wallet linking
- top-up confirmation

Do not reduce observability in sensitive paths.

## AI Parse Rules
Challenge parsing is part of the product, not just an assistant flourish.

Parsing must produce structured data that is compatible with downstream challenge creation.
When changing parse behavior:
- preserve draft usability
- preserve clarifications quality
- preserve compatibility with challenge creation payloads
- do not create parse outputs that the rest of the system cannot safely consume
- maintain a clear relationship between parse cost and credits usage

Parse failures should degrade clearly and recoverably.

## AI Judgment Rules
AI judgment is a high-risk product decision surface.

When touching judgment logic:
- distinguish sync verdict from async judge jobs
- preserve clear status transitions for pending / processing / completed / failed
- preserve judgment object integrity
- preserve confidence / reasoning / model metadata where applicable
- avoid coupling final settlement to incomplete or ambiguous verdict data

Judgment behavior must remain inspectable, not magical.

## Async Judge Job Rules
`JudgeJob` exists because verdict work is asynchronous and may involve media processing, polling, or webhooks.

When changing async judging:
- preserve job status clarity
- preserve pollability
- preserve result persistence
- preserve failure visibility
- do not let completed jobs re-run settlement unintentionally
- ensure frontend polling assumptions remain correct

A background job system without explicit recovery behavior is incomplete.

## Evidence Rules
Evidence is part of challenge truth, not just attachment storage.

When changing evidence flows:
- preserve challenge linkage
- preserve user attribution
- preserve createdAt ordering
- preserve type semantics
- preserve metadata compatibility
- do not weaken evidence traceability

If direct upload, presign, media processing, or URL handling changes:
- keep storage contract explicit
- keep failure messages actionable
- avoid orphaned evidence records
- avoid UI assuming upload success before backend confirmation

## Auth and Identity Rules
This repo uses authenticated user state as part of credits, challenge ownership, evidence ownership, and verdict permissions.

When touching auth:
- preserve ownership boundaries
- preserve session correctness
- preserve NextAuth integration assumptions
- do not create paths where anonymous users can mutate protected state
- do not let user-facing session data drift from backend assumptions

Identity errors in this repo can become money or settlement bugs.

## Nearby / Discovery / Geo Rules
Discovery is not just sorting; it affects who sees what and how challenges are matched.

When changing nearby logic:
- preserve fallback behavior when coordinates are missing
- preserve distinction between challenge discovery snapshot and creator live coordinates
- preserve null-safe geo handling
- avoid hard failures when location is unavailable
- keep distance logic explainable

Do not turn discovery into a brittle geo-only requirement unless explicitly desired.

## Database and Migration Rules
This repo builds with Prisma generation and migration deployment in the build path.
That means schema changes are operationally significant.

When changing Prisma schema:
- prefer additive changes over disruptive rewrites
- preserve migration safety
- avoid renaming core concepts casually
- think through data backfill implications
- keep relations aligned with actual product flows
- avoid making build or deploy more fragile

Be especially careful around:
- User
- CreditTx
- Challenge
- Participant
- Evidence
- Judgment
- JudgeJob
- AuditLog

## API Contract Rules
`src/lib/api-client.ts` is a practical contract layer.
Treat it as part of product stability.

When changing behavior:
- update route behavior
- update frontend wrappers
- update returned shapes
- update loading and error expectations
- update affected UI surfaces
- confirm that frontend assumptions still match actual responses

A task is not complete if only backend or only UI was changed.

## Error Handling Rules
Do not build happy-path-only features.

Always think through:
- insufficient credits
- parse failure
- async judge failure
- evidence upload failure
- top-up confirmation failure
- duplicate action retries
- stale challenge state
- user not authorized
- missing challenge
- invalid participant state
- settlement failure
- geo unavailable

Failure behavior should be explicit, recoverable, and understandable.

## Performance Rules
Performance matters, but not above correctness.

Optimize:
- unnecessary re-renders in the main conversation flow
- blocking UI during parse / publish / judge actions
- oversized client assumptions
- redundant refetches on critical flows

Do not:
- over-optimize decorative motion at the expense of clarity
- make state logic harder to reason about just to reduce a minor render cost
- sacrifice correctness for perceived speed

## Testing and Verification Rules
For meaningful changes, reason through or validate these paths:

- parse challenge
- create challenge
- accept challenge
- submit evidence
- run sync judge
- run async judge
- poll judge job
- top up credits
- mutate balances safely
- settle once and only once
- reload challenge detail after state change
- open challenge room from URL or publish flow

At minimum, consider:
- happy path
- obvious retries
- stale state
- insufficient credits
- asynchronous failure

## Output Contract for Claude Code
When reporting work in this repo:
- start with the product-level conclusion
- then list exact files, routes, components, or schema touched
- then explain why the state machine and credits logic remain coherent
- then list remaining risks or unverified paths
- explicitly call out any high-risk assumptions

Do not give vague summaries.

## Repo Memory
This project wins when a user can:
1. express a challenge naturally
2. get guided into a clean structured draft
3. publish without confusion
4. bring in an opponent or audience
5. submit evidence clearly
6. get a verdict with understandable reasoning
7. see credits and settlement behave correctly

If a proposed change does not improve or protect one of those, reconsider it.

## Anti-Patterns
Do not:
- turn the product into a generic dashboard
- weaken the conversational entry just to expose more controls
- patch UI while ignoring backend state
- change credit logic casually
- mix parse, verdict, and settlement semantics together without boundaries
- introduce duplicate or competing truth sources
- hide money-moving behavior inside implicit UI assumptions
- expand scope into a rewrite unless absolutely necessary
- add "AI magic" that reduces inspectability
- treat settlement-sensitive code as normal UI code

## Definition of Done
A task is not done unless:
- the intended user flow still works
- challenge state remains coherent
- credits logic remains safe
- affected API contracts still align
- obvious failure states were considered
- the implementation is still maintainable
- the change moves the product toward reliable real-world use
