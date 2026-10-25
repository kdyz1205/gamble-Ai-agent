# Summoner.world — verified zero-stake Quiz battle history (v1)

## Delivered to the actual iOS app
- A signed-in player's **completed Quiz duel results** are retrieved at `GET /api/quiz/history` (`private, no-store`). The server selects by the **authenticated** User/Participant relation, not an attacker-supplied userId or username. Unauthenticated GET returns 401; a separately disabled Quiz pilot remains unavailable.
- The newest 20 completed duels are bounded and sorted by verified server finalization. When 20 are present, coverage is deliberately **incomplete** (never labeled all-time). An empty list means zero completed matches in the queried data, not an arbitrary lifetime level.
- Each match's original `getQuizDuelView` verifier replays the sealed question-bank commitment, server-stored answer hashes, choice indexes, objective scores and SHA-256 final resolution. The history-specific verifier additionally rejects missing accepted player seats, modified winner, mismatched result/score, invented tie or timeout, forged financial transfers, missing original user/opponent, and duplicate entries.
- The rendered Battle History panel on the real `/app/quiz` entry page displays the viewer-relative **Victory/Defeat/Draw/Timed out** outcome, scores, timestamp, real opponent username and an **Open verified Quiz receipt** link. This is not a fake local animation or marketing landing page; it follows real match IDs.
- Source data and score totals are checked a second time by a client-safe, **question-answer-free** wire contract. The UI only imports public topic/version names; the sensitive answer-bearing `quiz-bank` is NOT bundled through this new client component.
- The list displays NO answer key, quiz submissions, money balance or third-party private data. It is read-only, with no claim to earned XP, career progress, prize, free Summon tickets or cash. Failed verification or lost network shows UNKNOWN instead of a fabricated victory.
- No table migration, production data modification or credit transaction. All existing Quiz/Quest settlement code is unchanged.

## Why matches cannot give redeemable career XP yet
The current fixed set of 30 questions (3 shown per match) includes the correct answers in app source code, so the bank is **not anti-cheat-grade**. Automatically mapping these verifiable scores to `ProfessionXpEvent` or spendable tickets would be easily farmed and incompatible with the stronger Quest evidence/appeal rules. This PR intentionally keeps `creditedCareerXp:0` and `creditedSummonTickets:0` and does not alter the immutable verified Quest XP ledger. A separate server-protected expandable question bank, cooldown/collusion controls, outcome policy and reviewed appeal/rollback must precede redeemable Quiz rewards.

## Acceptance
- `scripts/test-quiz-history-contract.ts`: 35+ pure adversarial checks for viewer-relative scores, role/consent, credit isolation, tie/expiry, duplicate IDs, history bounds and response tampering.
- Existing `scripts/test-quiz-duel-db.ts`: creates real two-player Quizzes in isolated `summoner_verification`, validates both sides of victory/loss, tie/expired, private outsider isolation, forged winner history refusal, and no fund transfers.
- Existing Playwright `verified-voice-quiz-duel.spec.ts`: real authenticated browser and API history, comparison of both accounts, private guest 401, actual new iOS Battle History card and receipt link.
- Exact-commit lint, typecheck, full PostgreSQL+Quiz/Quest regression, Vercel preview and native iPhone Simulator/archive must all pass before feature branch merge. No main/prod/TestFlight.
