# Summoner.world — Profession / Battle / XP / Summon / Fusion

Status: **v1 conceptual policy and interactive sandbox only. No live Summon inventory, XP, tickets, real-money gaming or creature grants have been implemented.**

## Product correction

**Every new player gets the same free Pico**, their universal first Summon. Pico is not an occupational class. As players compete in evidence-backed real-world Quests, profession-specific verified achievements gradually unlock multiple creatures, increasingly specialized forms and hybrid bloodlines. Players are not permanently restricted to one occupation.

The existing four fixed Familiar characters from PR #25 were not the target system. Career affinity—not a list of four collectible mascots—is the organizing principle.

## Core gameplay loop

Pico (all players) → choose occupational interests (self-report, not verified skill) → real Quest in one or more professions → mutually agreed evidence and AI referee → authoritative, auditable result → skill XP + small fixed win bonus → earn free tickets at XP milestones → choose profession-specific eligible Summon pool → transparent server RNG / pity → unique collectible monster → later two-parent fusion → new profession hybrid → deeper Quests.

No clicks, local streak checkboxes, wallet balances or unverified bets can issue authenticated XP or owned creatures.

## Occupations scale

The first demo contains 12 **game affinity families**: Athletics; Software and AI; Engineering; Health; Science; Visual Art; Music; Teaching; Culinary; Nature; Business; and Skilled Trades. These are not claimed to be exact O*NET major groups. Each family initially exposes three sample occupations/skills (36 labels total), with occupation-coded creature blueprints, not just one species per class. These 36 labels are design seeds, not an imported official occupation dataset.

Eventually map player occupations and skills to the versioned O*NET-SOC occupation taxonomy (currently 1,016 occupational titles, 23 major groups, plus work-task/skill metadata), rather than hand-coding a monster for every job:
https://www.onetcenter.org/taxonomy.html
https://www.onetonline.org/find/family?f=0

A player can hold a vector of skill proficiencies, e.g. software=4, medicine=2, music=1, not a single class. AI classification may suggest profession tags, but they must be frozen before opponent acceptance and validated by server rules. Titles selected in the profile do not count as verified skills. Private evidence and credential information must not leak in public monster profiles.

## Proposed XP and ticket economics (NOT live)

Only an eligible, proof-accepted, *settled* Quest would yield skill XP under the proposal: 40 accepted-proof XP + 40 settled participation XP, plus 20 fixed win bonus, 10 draw bonus or zero loss bonus. Thus **win 100 / draw 90 / documented loss 80**, independent of stake amount. Incomplete, appealed/disputed or unverified events get no provisional reward until an authoritative decision. Mastery tiers 1–5 unlock cosmetic base/evolved/ascended forms at XP thresholds 0 / 100 / 350 / 800 / 1600.

Hypothetical **free** summon ticket #n is earned at 100n + 25n(n−1) audited XP, giving thresholds 100, 250, 450, 700, 1000. Existing UI shows examples only and does not grant tickets.

Winners progress somewhat faster; losses with real accepted proof still teach you something. Farming the same opponent or duplicating proof must never mint repeated XP. Incentivize trying hard goals, not easy-win exploitation.

## Proposed summon randomness, no paid lottery

A single free verified ticket enters an eligible profession pool. **Fixed base odds**: Common 60%, Uncommon 27%, Rare 10%, Epic 2.6%, Legendary 0.4% (exactly 10,000 basis points).

Guaranteed Rare+ after 19 consecutive non-Rare draws (20th attempt); guaranteed Epic+ after 79 consecutive non-Epic draws (80th attempt). At pity, only qualifying rarity weights are re-normalized; show the actual odds. Mastery unlocks more advanced species/forms and more free opportunities, **not hidden multipliers based on wager size or purchased stake**.

The browser prototype calls Math.random solely to display a sample. It never creates real items. The future production service needs secure server RNG, versioned weighted tables, atomic pity/ticket updates, append-only draw receipts, request idempotency, and public odds disclosure. The interactive preview now advances Rare/Epic miss counters after each sample draw, enforces its 20/80 guarantees deterministically, shows the next-attempt counters and conditional rarity odds, and permits a full local reset. The browser-only counters are neither persistent, account-bound nor a real summon pity history; switching professions does not reset them during the session.

## Fusion / genetics

Breed or fuse two distinct owned Summons whose professions are different. Preserve both skill traits and create a stable composite lineage. Recipe order must be commutative; exact ingredients and rarity cap disclosed before confirming; own both creatures and consent to any irreversible consumption.

Starter preview examples: Athletics+Engineering = Velocity Golem (Momentum+Precision), Software+Health = Carebyte (Logic+Care), Art+Music = Prism Echo, Culinary+Nature = Basil Bun.

The current engine only computes a **preview blueprint** and caps the preview hybrid rarity at the weaker parent. It neither consumes monsters nor awards children. Production needs distinct instance IDs, locked ownership, versioned recipes, signed consent, atomic consume/create and replay safety. No unlimited self-fusion to increase rarity.

## Server ledger and anti-abuse work still required

- Authoritative profession and occupation code registry, fixed before live Quest acceptance
- Immutable VerifiedProgressEvent keyed by player + verified settlement + skill family + ruleVersion, with compensating revocations
- Career XP aggregate recomputable from ledger, season limits and multi-discipline skill tags
- SummonTicketGrant/Use ledger, account-bound nonce, cryptographic RNG receipt and pity state committed atomically
- SummonInventory with species ID, unique instance ID, owner, parent lineage, rarity, visual stage and original earn event
- FusionRecipe, FusionReceipt and transaction-locked parent item transfer/destruction
- Rate limits for repeated opponent, identical Quest templates, cloned proof, collusive accounts, bot spam, fake credentials and wallet gaming
- Fairness/audit observability, season simulation and appeal-safe corrections

**Do not alter existing challenge adjudication, funding, token ledger, real-money settlement, identity or protected database schema in this preview PR.**

## Apple and paid-randomized-items constraints

Apple App Review guidelines 3.1.1 require probability disclosures for randomized virtual items purchased in an app. Section 5.3 places further requirements on regulated real-money gaming, licenses and location restrictions:
https://developer.apple.com/app-store/review/guidelines/

For v1, interpret the user's "betting wins" as wins in legitimate **non-cash skill challenges** and use fixed XP bonuses. Never let a USD/USDT/credit deposit increase summon odds or serve as a gacha purchase. Any future cash-equivalent staking and item-trading model needs separate legal/platform review. Monetize optional fixed-price cosmetic appearances rather than chances in the initial build.

## Implemented UX scope

- Replace the four fixed Familiar preview cards on the existing iOS Familiars route with a 12-family Profession Summon Studio.
- Show one example occupation group and art mood image, simulated mastery levels, full rarity probabilities, a one-click *preview-only* random draw, and a two-family hybrid recipe.
- Show proposed verified win/loss XP/ticket progression, always labeled not-awarded. Pico remains the universal initial companion; its Guide / Clarify / Review capabilities remain.
- Browser QA must verify 12 profession selectors, five disclosed tiers, actual interaction, no false inventory, signed-in level honesty, decoded artwork and narrow-phone no-overflow.
- Production rollback and deployment are out of scope; this is an isolated product design integration PR.

## Next phases

1. Approve rules and run economic simulations of level speeds, payout loops, drop distributions, pity, sunk-cost behavior, multi-profession fairness and adversarial collusion.
2. Build database and secure server XP/grant/roll/fusion contracts with replay and crash recovery.
3. Create a unique 3D species art catalog and hybrid renders; do not misrepresent reused Pico scenery as final new species art.
4. Non-cash gated beta, economy monitoring and eventual phased App Store submission.
