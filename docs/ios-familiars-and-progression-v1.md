# Summoner.world — Familiar & Progression System (v1)

**Product principle:** real-world action creates progress. Pico is the starter guide, not the whole product. This is a Quest platform with companion characters, visible personal milestones, shared adventures and trustworthy proof—not a lootbox/cash product.

## What is implemented now vs planned

- **Implemented in this PR (read-only):** a four-character concept roster (Pico, Kiko, Nova, Moss), distinct Move/Create/Grow destination links, accessible selection, and a *Quest Milestone Level* based solely on authenticated Quest records reported as `settled`. Characters other than Pico are **preview art**, not owned/collected characters.
- **Not implemented yet:** wallet/inventory, unlocking, familiar levels, transformations, unlockable regions, server-side XP, cross-device streak sync, and real social/arena rankings. No fake owned items, level rewards, or AI judge advantage.
- Quest history source: existing `useOwnQuests()` calls `listChallenges({mine:true,limit:50})`. The milestone level is **unknown** if 50 rows were returned (the full history is not proven complete), auth is missing, or the API errors. No fabricated zeros. It also reflects this list scope, not every possible lifetime participation record.

## Companion lineup — draft visual direction

| Familiar | Quest path | Identity | UI action now | Later direction |
| --- | --- | --- | --- | --- |
| **Pico** | All quests | Helpful curious white guide | Existing Quest composer; Guide/Clarify/Review are Pico's modes | Starter Familiar, introductory bond and storytelling |
| **Kiko** | Move | Gentle forest adventurer | Opens existing Move Quest composer | Movement-oriented encouragement and earned cosmetics |
| **Nova** | Create | Soft-blue dream creature | Opens existing Create Quest composer | Creative artifacts, imagination and proof journaling |
| **Moss** | Grow | Leaf-crowned garden friend | Opens existing Grow Quest composer | Learning, consistency and reflection rewards |

Characters are **preset artwork first**: no paid random drops, AI pet generation per visit, precise-location tracking, or misleading fake ownership. Later expansion can add quest category-specific Familiars, seasonal world areas, group Arenas, collection albums and reversible preferences.

## Three separate progression layers

1. **Summoner Level (future canonical XP):** real verified Quest participation across Move / Create / Grow. Identity, not money, is the core.
2. **Familiar Bond (future):** grows with **verified activity on that path**, granting visual expressions, stories and customization only—never scoring, credit payouts, stronger AI adjudication, or ranking shortcuts.
3. **World Journey (future):** quests and milestones unlock storybook regions; maps are visual navigation, not a requirement for background GPS/AR.

### Current interim rule: Quest Milestone Level (not XP)

Derived entirely from distinct settled Quests in the **complete loaded list**. A user who has not yet settled a Quest begins at Level 1; no completion means no earned badge. Caps at the current Level 5 design milestone.

| Level | Name | Settled Quests |
| --- | --- | ---: |
| 1 | Seed | 0 |
| 2 | Explorer | 1 |
| 3 | Maker | 3 |
| 4 | Pathfinder | 8 |
| 5 | Beacon | 20 |

Progress to the next milestone is a fraction of completed distinct settled Quests, **not earned XP**. No higher level or rewards are fabricated; if the list may be truncated, refuse to display a level. Unknown/error/auth/loading are different states.

### XP and leveling — proposal only (needs authoritative backend)

A server-owned, audited `ProgressEvent` with unique `(userId,questId,awardType,ruleVersion)` prevents duplicates. Award only on accepted/settled authoritative Quest lifecycle events, never on client clicks, draft creation, money or credits. Require trusted event provenance and participant eligibility. Design fair participation credit that does not depend on winning, because challenging goals and honesty matter more than win farming. Apply repeat-opponent and identical-template rate limits, review corrections/revocations and a maximum per day to deter collusion. A ledger migration and legal/abuse review are prerequisites; **none** is part of this UI PR.

## UX contract

- **My Familiars** page: prominent Pico entry + existing Guide/Clarify/Review modes; below, Quest Milestone Level (authenticated status states), and a preview gallery of 4 distinct creature concepts.
- All four preview cards are tappable, keyboard reachable, and show the selected path description. Actions navigate to **existing** Quest composer routes, not an unimplemented inventory or owned companions endpoint.
- Preview cards label other Familiars as *Concept · not collectible yet*. Do not imply the user owns an AI judge or changes proof outcomes.
- Show an informative **Pico-only available** vs *future* note.
- Keep Home's prompt-to-Quest composer as the primary product action; never bury it behind leveling.
- On narrow devices 320/375/390 px, no horizontal overflow; reduce-motion and device-local preferences remain respected.
- The AI Referee remains independent from companionship, levels, wins, in-app credits and visual items.

## Later canonical service contract (not implemented)

- `GET /api/progression/me`: authenticated, paginated/aggregate authoritative summaries for `totalXP`, `level`, `nextThreshold`, `verifiedQuestCounts`, `bondByFamiliar`, and `lastProgressEventId`. Do not derive global lifetime progress from a limited list.
- `GET /api/familiars/catalog`: static versioned curated Familiar metadata and staged art assets.
- `GET /api/familiars/me`: authenticated owned species and cosmetic state; `null` means missing, not starter ownership fabricated.
- Earned milestones/event decisions must survive partial failures and replay without double award. All history and correction auditable, private proof never surfaced publicly.
- Only after backend exists can the UI show owned/locked Familiars, real earned XP, bond levels, evolution animation or unlock notifications.

## Acceptance for this scoped design PR

- Rank level thresholds and next-step math correct, duplicate Quest IDs deduped, incomplete 50-row data/error/guest/loading fail closed, other status values never award milestones.
- Four interactive cards with appropriate imagery/path links and visible preview limitations. Pico remains the only actual guide.
- Existing Quest creation/review/credit/settlement unchanged. Read-only browser QA and real iPhone Simulator visual evidence are required before merge.
