# SUM account history, personal evidence and local daily goals

## What was reproduced

Against the running production React components using synthetic account/session and endpoint fixtures, the prior app read only the first 50 Quest records despite a 73-row server total. The personal evidence gallery also displayed a second accepted participant's evidence, although the heading implied it displayed only the current user's own submissions. Both tests failed before the patch and retain their browser traces under the coordination folder.

The original local ritual hook used an effect to read the current account's stored goals and React closure state for all add/toggle/remove changes. A transition could render the previous owner's goals before the next effect ran, and simultaneous distinct adds could overwrite one another. The patch uses render-time owner gating and storage-backed synchronous updates.

## Changed behavior

- Reads the existing read-only `GET /api/challenges?mine=true&limit=50&offset=N` contract up to a **bounded 250** records, verifies the server's total across pages and rejects malformed, truncated or duplicate rows. No backend request, auth policy, schema, Prisma migration or DB writes have changed. Counts are explicitly marked lower bounds when a full history is unavailable. Full list `/quests` already paginates.
- My Evidence filters detail rows by `evidence.userId === authenticated account ID`. The current player's own proof can be loaded from older Quest detail pages using an explicit button; partial failed detail reads remain visible as errors with retry.
- Milestone rank requires a complete history before treating a 50+ record sample as verified; existing conservative direct-call behavior is preserved.
- Device goals remain local and explicitly non-financial. Reads are scoped to the currently authenticated account before paint, including unauthenticated/guest and sign-out changes. Atomic same-tick edits use the latest saved value, and native storage events synchronize only the same account's goals between browser tabs. Editor drafts are scoped too, and controls/error recovery are bilingual.

## Verification and release

Required: generated Prisma client, TypeScript, touched-file lint, quest-rank and ritual unit tests, 12 newly added browser checks, existing full CI database/credit/settlement flows, native iOS simulator, production-environment candidate from a frozen clean commit, source tree verification, and full post-promote browser/API/UI checks. No production account data or money-like credits are modified for QA. Screenshots of authenticated pages use synthetic transport and must be labeled as fixtures.

## Known limits

- The 250-row bound is intentional; accounts with more than 250 Quest records show the real server total and an explicitly incomplete history, with `/quests` as the pagination fallback.
- The My Evidence gallery is about the user's own submissions, not the complete shared challenge evidence; opponent evidence remains accessible in authorized shared Quest rooms. The first 20 evidence-bearing Quest details are loaded by default, with manual load-more.
- Local daily rituals do not sync across devices, carry no backend XP and do not prove Quest completion.
- Test fixtures and browser permission simulations cannot replace a real-device account-switch/clipboard/permission test.
