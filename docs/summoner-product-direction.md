# Summoner.world Product Direction

## One-line Product Thesis

Summoner.world is a bright, playful, Pokemon GO-like world for real-world challenges where users summon quests, invite others, submit proof, and let AI familiars judge the result.

## Product Identity

Summoner.world is not primarily:
- an AI betting agent product
- a sportsbook
- a crypto casino
- a public prediction market
- a dark Diablo gambling cockpit
- a PNL or odds dashboard

Summoner.world is:
- chat-first
- quest-driven
- proof-based
- AI-refereed
- social and shareable
- mobile-first
- internal-credit / non-cash first

## Core User Loop

1. A user types a challenge in natural language.
2. AI compiles the challenge into a structured quest.
3. The user sends an invite link.
4. The opponent accepts.
5. Participants submit proof.
6. An AI familiar judges the proof.
7. The result becomes a shareable receipt.

## Product Metaphor

Users are Summoners.

Challenges are Quests.

AI judges are Familiars.

Groups and communities are Arenas.

Shareable results are Receipts.

The product should feel like a real-world challenge game, not a betting terminal.

## UX Direction

The UI should feel:
- bright
- playful
- map-like
- cute but not childish
- competitive but not aggressive
- trustworthy
- mobile-first
- easy to understand in under five seconds

The UI should not feel:
- dark fantasy gambling
- crypto casino
- trading dashboard
- anonymous betting cockpit
- overly technical
- enterprise SaaS

## Main User-Facing Language

Use:
- Summon
- Quest
- Challenge
- Proof
- Familiar
- AI Referee
- Arena
- Portal
- XP
- Streak
- Result Receipt
- Quest Settled

Avoid:
- Bet
- Wager
- PNL
- Stealth betting
- Hidden owner
- Agent placing bets
- Cash payout
- Odds cockpit
- Market position
- Dark pact
- On-chain first language

## Copy Replacement Guide

Bet -> Quest / Challenge

Wager -> Points / Challenge stake / Pride

Agent -> Familiar / AI Familiar / AI Referee

AI betting agent -> AI familiar that helps judge proof

PNL -> XP / Record / Streak

Odds -> Quest status, unless it is explicitly a prediction quest

Market -> Arena / Quest / World

Hidden owner -> Private summoner

Stealth betting -> Privacy guard

Seal pact -> Accept quest

Offer evidence -> Submit proof

Judgment chamber -> AI judgment / Result

Cash payout -> Do not use

## Design Principles

### 1. The composer is sacred

The primary action is still typing a challenge.

Do not bury the composer behind dashboards, tabs, or complex navigation.

### 2. Show the quest, not the protocol

Normal users should see:
- title
- summary
- players
- proof required
- win condition
- deadline
- AI familiar judge
- CTA

They should not see raw JSON, protocol jargon, settlement mode strings, or backend status names.

### 3. Every invite must be understandable

An invited opponent should understand in five seconds:
- who challenged them
- what the quest is
- what proof is required
- how AI will judge
- what happens if they accept

### 4. Every result should be shareable

The result page should create a screenshot-worthy receipt.

A good result receipt includes:
- quest settled
- winner
- confidence
- proof reasons
- share CTA

### 5. AI should feel helpful, not magical

The AI familiar should:
- explain what it checked
- show confidence
- route unclear cases to review
- avoid pretending uncertain results are certain

### 6. Map-world is a layer, not a dependency

Summoner.world may feel like a Pokemon GO-like world, but the first version should not require AR or heavy map dependencies.

Use:
- quest orbs
- arena cards
- nearby quest feed
- portal pages
- QR-friendly pages

Avoid:
- full AR
- heavy map SDKs
- real-time location tracking
- precise public location exposure

## Safety and Compliance Principles

The first product should stay internal-credit / non-cash first.

Do not add or emphasize:
- real-money wagering
- cash payouts
- crypto payouts
- USDC staking
- sports betting language
- anonymous betting agents

Proof-based social competition is the first wedge.

Any future real-money or regulated settlement path must be handled separately.

## AI Cost Principles

Do not use expensive AI by default.

Prefer:
- templates
- deterministic rules
- cached challenge types
- oracle checks for public data
- GPS checks for location
- text checks for objective answers
- gated vision judgment only when proof is submitted

Do not:
- generate AI images for every challenge
- generate dynamic pets every session
- run expensive video judgment before both sides submit proof
- repeatedly rejudge unclear proof without gating

Familiars should be preset-first, not AI-generated-first.

## Codex Working Rules

Every Codex task should be small and reviewable.

One task should equal one pull request.

Do not rewrite the whole app at once.

Protected files should not be modified unless explicitly requested:
- prisma/schema.prisma
- src/lib/challenge-state-machine.ts
- src/lib/credits.ts
- src/lib/challenge-judgment.ts
- src/lib/payment-policy.ts
- backend settlement/payment/evidence/judge logic

Default allowed changes:
- UI copy
- visual design
- CSS/Tailwind
- presentational components
- static demo cards
- mobile layout
- empty/loading/error states

## First Redesign Phase Goal

Turn the current dark/betting-feeling product into a clear Summoner.world challenge game.

Phase 1 should deliver:
1. De-risked copy
2. Bright Summoner.world design tokens
3. Clear /enter page
4. Summon composer
5. Quest preview card
6. Accept Quest page
7. Result receipt card

Phase 1 should not deliver:
- real-money staking
- avatar economy
- AI image generation
- AR
- full map SDK
- complex inventory system
- database schema changes
- backend settlement changes

## Non-goals

- Do not redesign backend behavior as part of repositioning.
- Do not rename database schema, challenge lifecycle states, API contracts, or ledger concepts just to match product language.
- Do not add sportsbook, casino, odds, PNL, crypto payout, or real-money wagering surfaces.
- Do not make AR, full map SDKs, generated avatars, or inventory systems prerequisites for the first redesign.
- Do not weaken proof traceability, AI judgment explainability, credit safety, settlement integrity, or auditability.
