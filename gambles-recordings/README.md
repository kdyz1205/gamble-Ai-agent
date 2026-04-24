# 10-Gamble End-to-End Recordings

Each `gamble-NN/` folder contains two WebM videos — one for each player — of a complete, real end-to-end gamble from chat composer to credit settlement. Drive and verification code lives in `tests/e2e-gambles/`.

## What each recording shows

Per gamble, both videos start recording in parallel when the two browser contexts open and end when the tests close their contexts. You see:

| Step | Player A (`player_a.webm`) | Player B (`player_b.webm`) |
|---|---|---|
| 1. Compose bet | Types the bet into the chat composer at `/` | (browser idle on blank page) |
| 2. Agent exchange | Agent reply renders; A confirms "create it" | (idle) |
| 3. Share link surfaced | Homepage shows share link + market card | (idle) |
| 4. Opponent joins | (idle on post-create screen) | Navigates to `/join/<id>`, taps `🎲 Accept the bet` |
| 5. Market live | Both sides transition — `status: live` | Same |
| 6. Evidence | Submitted via API against the signed-in session | Same |
| 7. AI judgment | OpenAI `gpt-4o-mini` runs the real judge on both text submissions | Same |
| 8. Confirm verdict | A lands on `/market/<id>`, sees the AI recommendation card, taps `Confirm AI recommendation and settle` | B lands on `/market/<id>` showing the final settled state |

Each recording is **one gamble, end to end**. No cuts, no stitching. The two browser contexts are fully isolated (separate cookie jars = genuinely two different signed-in users).

## The 10 bets

See `tests/e2e-gambles/bets.ts` for the exact prompts. Summary:

1. More pushups in 60 seconds
2. Longer plank hold
3. Finish a 500ml water bottle first
4. 5 three-pointers first
5. More burpees in 90 seconds
6. Cook an omelette faster
7. Longest handstand hold
8. Solve a 4x4 Rubik's cube first
9. 20 squats fastest
10. 30 jumping jacks fastest

For every gamble, Player A's evidence describes a successful completion and Player B's describes a failure. That asymmetry guarantees the AI judge produces a clean Player-A-wins verdict — which the verification script asserts.

## Verification receipts

`verification.json` (written by `tests/e2e-gambles/verify-results.ts`) contains:

- Final credit balance for both players
- The 10 resolved `Challenge` row IDs
- Each gamble's `Judgment`: winner, confidence, model, reasoning snippet
- Six all-must-be-true boolean checks:
  - `tenSettled`
  - `allHaveJudgment`
  - `allWinnersPlayerA`
  - `allOpenAIModel`
  - `allHighConfidence`
  - `everyoneHasTwoEvidence`

If any of those is `false`, the commit should not be declared done.

## How to re-run locally

```bash
# 1. Start dev server (uses local Supabase)
npm run dev

# 2. Seed the two players
npx tsx tests/e2e-gambles/seed-users.ts

# 3. Run all 10 gambles (records to gambles-recordings/)
npx playwright test tests/e2e-gambles/gambles.spec.ts

# 4. Rename recordings to player_a.webm / player_b.webm
npx tsx tests/e2e-gambles/rename-recordings.ts

# 5. Verify DB
npx tsx tests/e2e-gambles/verify-results.ts
```
