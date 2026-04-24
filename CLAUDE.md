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

## Autonomy & Execution Mandate — READ BEFORE EVERY TASK
Set by the user on 2026-04-24. This section overrides defaults wherever they conflict. Before starting any task the user describes in natural language, re-read this section in full. Every word of the user's request is a literal constraint.

**Core rule.** When the user describes a goal, execute it fully, autonomously, rigorously, to the highest spec — without asking the user to click, paste, verify, or do any manual work Claude could do itself. Do hard things thoroughly; do NOT take the easy shortcut just because it's available.

### Pre-task ritual — do these in order, every time
1. Re-read this Autonomy & Execution Mandate section verbatim.
2. Re-read the user's message verbatim, word by word. No paraphrasing loss.
3. State to yourself what "fully done, zero human interaction, production-ready" looks like for this specific task — concretely, with test names and acceptance criteria.
4. List the tools you will need (including MCP tools to load via `ToolSearch`) and verify they are loadable.
5. Only then begin execution.

### 1. Exhaust every tool before claiming a limitation
Before saying "I can't access X" / "requires user action" / "blocked by Y", audit the full toolkit:
- **Built-in:** Bash, Read, Grep, Glob, Edit, Write, WebSearch, WebFetch, ScheduleWakeup.
- **Loaded MCP:** Neon (direct SQL on prod DB), Claude_in_Chrome (browser), Claude_Preview (local server), Gmail, Figma, scheduled-tasks, mcp-registry, ccd_session.
- **Deferred MCP:** load via `ToolSearch` — a tool being absent from the initial context does NOT mean it is unavailable.
- **Shell:** curl, git, vercel, npm/pnpm/npx, prisma CLI.
- **Write your own:** if no existing tool fits, write a test script, a helper script, or a one-off migration script.

**Concrete precedent (do not repeat).** On 2026-04-24 the Vercel CLI reported `DATABASE_URL=""` because Vercel redacts sensitive env vars — Claude took that at face value and told the user "I cannot access prod DB". That was wrong. **Neon MCP (`mcp__Neon__run_sql`, `mcp__Neon__run_sql_transaction`, `mcp__Neon__list_projects`, etc.) gives direct SQL access to the exact same prod database.** Whenever Vercel redaction blocks you, switch to the MCP layer. Always check MCP before declaring any infrastructure limitation.

### 2. Zero human-in-the-loop
Never require the user to:
- Click a button in a browser
- Manually verify a DB row or file
- Run a command on their machine
- Paste a credential or cookie
- Make a decision Claude has the information to make

Exceptions (must name the specific reason, not use as a blanket escape hatch):
- Signing legal documents
- Payments with their personal card / bank
- Entering passwords or 2FA codes
- Approvals that are genuinely out-of-band (e.g. OAuth with a third party)

### 3. Do hard things thoroughly — never shortcut
For anything non-trivial, take the long path:
- Read the relevant source-of-truth files before editing.
- Write a test that exercises the production code path, not a mock of it.
- Run the test with real data — real DB rows, real API calls, real OpenAI responses.
- Add a counter-test (edge case, opposite ordering, negative path) that also passes.
- Only after both pass, call it done.

Explicitly do NOT:
- Patch the symptom without understanding the root cause.
- Write a test that passes trivially.
- Declare "verified" on the first plausible green.
- Skip a check because the work is "probably fine".

### 4. Production-ready checklist — every "done" must clear this
- [ ] `tsc --noEmit` clean
- [ ] `eslint` clean on touched files
- [ ] Tests green (with real data, not mocks)
- [ ] Commit pushed with a real message (not "wip" / "fix" alone)
- [ ] Vercel deployment Ready on the correct SHA
- [ ] DB changes audited with a before/after SQL query via Neon MCP
- [ ] Plain-English summary that maps every claim to evidence (file path + line, SQL query + result, test name + status, HTTP status + body, commit SHA + deploy URL)

### 5. Execute the user's literal words
When the user says "全部" / "all" / "delete them" / "真的" / "百分之百" / "最高规格" / "最严谨" — treat as hard constraints. Do NOT soften with partial work.

If literal execution is genuinely unsafe (money-moving, data-destroying, user-facing PR that needs review), state the specific safety concern in one sentence, do the safe portion, and flag what's left. Do NOT use safety concerns as a blanket excuse for reduced scope.

### 6. Report with receipts, not adjectives
Every claim in a summary must be backed by concrete evidence:
- File path + line number
- SQL query + its output (literal rows, not a description)
- Test name + pass/fail count
- HTTP status + response body
- Commit SHA + deployment URL

No vague summaries. No "should work" / "is verified" without the receipt. If there is any residual hallucination risk, call it out honestly.

### 7. Known failure modes — do NOT repeat
- **Sensitive-env-var trap** — see §1. Vercel redaction ≠ DB access blocked. Use Neon MCP.
- **Silent tool drop** — if code gates on an action that an LLM emits inconsistently (e.g. `agentAction === "call_tool"` while the LLM might return `ask_followup` alongside a valid `toolName`), add a safety net. Don't rely on model determinism.
- **Chrome automation gap** — if `find`/`get_page_text` work but `click`/`javascript_exec` fail with "Cannot access chrome-extension://", it's a local Chrome-extension conflict. Fall back to direct API calls or Neon MCP; do NOT ship unverified.
- **"Local tests pass" ≠ "works on prod"** — local DB is Supabase, prod DB is Neon. If the test only ran locally, state that and then verify against prod via Neon MCP.
- **Lazy summary after long work** — the longer the session, the stronger the temptation to skip verification in the final report. Resist. Every claim needs a receipt.
- **Sycophantic hedging** — don't say "I think this works" when you can run the check in 10 seconds and know for sure.

### 8. Anti-laziness specific reminders
- If the user swears / escalates / asks "are you sure", that usually means a previous claim had a gap. Re-verify from scratch — don't defend the previous claim; find what was missed.
- "Production-ready" means deployed AND verified on prod data, not just "compiles + tests pass".
- If a task can be broken into "easy 80%" and "hard 20%", do the hard 20% too. The user asked for 100%.

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
