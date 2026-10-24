# Summoner.world — Voice → Friend Quiz → Verified Judgment (Pilot v1)

**Scope:** Actual persisted, two-person, ZERO-stake Quiz gameplay integrated
with the existing Quest identity/state/audit system. This does not authorize
financial, cash-equivalent, purchased-credit or blockchain wagering.

## User-facing flow (no mock results)

```mermaid
flowchart TD
  A[Open Voice Quiz on iOS] --> B{Microphone available?}
  B -->|Yes| C[Record real audio after permission]
  B -->|No| D[Type editable message]
  C --> E[/api/transcribe with server API when configured]
  E --> F[Edit transcript and select reviewed category]
  D --> F
  F --> G[Explicitly confirm zero-credit Quiz]
  G --> H[One DB transaction creates Challenge + QuizDuel + audit]
  H --> I[Share invite URL or reserve an exact username]
  I --> J[Other authenticated person accepts]
  J --> K[Both get identical sealed 3-question set]
  K --> L[Each independently submits once within 15 minutes]
  L --> M{Both submitted?}
  M -->|Yes| N[Server exact answer check]
  M -->|Expired| O[Explicit timeout finalization with no winner]
  N --> P[One score receipt, Judgment, final Challenge status, audit]
  O --> P
  P --> Q[Reveal correct answers and precommitted answer hash]
```

## State ownership

- `Challenge`: stores the existing Quest identity, open/live/settled
  lifecycle, strict stake=0, two participants, 15-minute response deadline.
- `QuizDuel`: stores the **shared ordered question IDs**, version,
  upfront answer commitment, invite ownership and final receipt.
- `QuizAttempt`: immutable one-response-per-(challenge,user) answers,
  hashes, score and timestamp, protected by unique index.
- `Judgment`: one `method="rules"` verified final score and winner
  (null for tie/timeout). No inference is required for known-answer grading.
- `AuditLog`: explicit creation, accepted seat, sealed answer and
  finalization events. No purchase/escrow rows are made by this Quiz flow.

All creation, acceptance, answer and finalization operations use
PostgreSQL transactions. Accepted player IDs and challenge state are checked
under the same advisory lock. Simultaneous requests can neither claim
duplicate seats nor submit revised answers or create two final decisions.
A stable client request key protects creation retries.

### Adjudication and disputes

- Before play, players see a SHA-256 commitment of the selected question
  IDs and ordered correct answers, without the key itself.
- Both contestants see the same questions and answer ordering.
- Answers never enter an AI judgment prompt. The server uses a versioned,
  curated, deterministic answer key to compute scores.
- No result or correct answer is revealed while only one player has submitted.
- A second sealed submission produces a single rules-based judgment.
- If deadline passes without both submissions, a player may explicitly
  finalize a **void/no-winner** result; do not silently award the no-show
  opponent's wager or claim an AI verified win.
- After finalization the correct answer indices are shown. The original
  commitment can be independently recomputed from the published bank version
  and fixed question order, along with the immutable per-player score receipt.

**Known anti-cheat limitation:** the manually reviewed question bank is kept
in server source (which may be visible to repository readers). This is a
free-play functional verification system, not an approved money-gaming
answer vault. Human dispute handling, private randomized per-run challenge
content, anti-collusion rules, jurisdiction checks, age gates, and audited
credit escrow are prerequisites for any paid wager feature.

## Voice and model routing

| Action | Call destination | Current authorization | Consequence |
|---|---|---|---|
| Microphone recording | Browser `MediaRecorder` | User grants microphone permission | User reviews transcript before submission |
| Speech transcription | Existing `POST /api/transcribe` | Authenticated app session, server-held `OPENAI_API_KEY` where configured | Reuses existing metered OpenAI speech endpoint; browser speech preview fallback labeled clearly |
| Other chat/Quest parsing | Existing `POST /api/agent/respond` | Authenticated app session, `ORACLE_DEFAULT_PROVIDER` and provider key | Switches among registered Anthropic / OpenAI / Google / compatible APIs |
| Quiz question set | Local curated bank | Server-side only | 0 model requests |
| Quiz winner adjudication | Local immutable answer key | Accepted two-player server state | 0 model requests, exact deterministic result |
| Provider status display | `GET /api/ai/runtime` | Authenticated app session | Identifies provider/fallback, not credentials |

ChatGPT consumer subscriptions and standard API billing are separate. There
is a *Sign in with ChatGPT* plan-sharing capability for participating apps
that support it with each eligible user's own explicit authorization; we
have **not** built or verified a qualifying integration for Summoner.world.
Never automate consumer ChatGPT web sessions as an undocumented shared
production inference backend or share personal ChatGPT cookies/passwords.

The current server router is already provider-agnostic for text/vision with
`ORACLE_DEFAULT_PROVIDER`; speech has a distinct OpenAI transcription
implementation. Future speech providers can be introduced behind the same
`/api/transcribe` contract, not by modifying Quiz verdict logic.

## End-to-end acceptance gate

1. Prisma fresh-install and old-data migration replay both retain every
   existing credit, evidence, Quest and judgment row.
2. Two real local PostgreSQL users create a free Quiz and reserve invite,
   while outsiders and duplicate creator attempts are refused.
3. Multiple concurrent acceptances yield exactly one opponent seat.
4. Before both answer, correct keys and scores are unavailable.
5. Concurrent/repeated answers are idempotent; different answer retries
   fail 409 with no rewrite.
6. Exact grading produces real Judgment, final Challenge record and audited
   receipt; tie and expired-nonresponse variants yield no fabricated winner.
7. Credits and lifetime purchased/won/lost totals are bit-for-bit unchanged.
8. Real browser checks the invite, login requirement, editable voice field,
   no paid controls, focus and mobile width.
9. Native iOS archive/simulator verifies the same code without signing
   or production deployment.
10. HTTP routes require authentication and disallow paid inputs.

`main` and production databases are explicitly excluded from this PR.
Never equate a passing demo with legal clearance for financial wagering.
