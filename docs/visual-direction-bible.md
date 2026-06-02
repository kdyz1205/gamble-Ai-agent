# Summon / Summoners World — Complete Visual Direction Bible

This document is the canonical visual specification for rebuilding Summon into Summoners World.

Platform name: **Summon**.
World/site name: **Summoners World**.

Core engine stays simple:

```text
say one sentence -> invite friend -> offer proof -> AI judgment -> result / reward
```

User-facing experience becomes:

```text
enter sealed world -> speak pact -> bind contract -> offer proof -> invoke judgment -> reveal reward
```

The current failure is not missing routes or copy. It is visual translation failure: the app copies the nouns but renders them as a generic dashboard. This bible turns the reference art into engineering rules.

---

## Part 001 — Foundation: Scene-Based Product, Not Dashboard

Every major page must be a **scene**.

A page fails if it is primarily:

```text
sidebar + header + metrics + stacked cards + buttons
```

A page passes only if it has:

```text
1. one dominant centerpiece
2. composed background depth
3. sparse supporting panels
4. one primary action
5. quiet atmosphere by default
6. ceremonial motion on user action
```

Page centerpieces:

```text
/enter = sealed gateway
/summons = familiar world + speak pact command
/contracts/bind = contract object + seal ritual
/duel/[id] = proof altar
/judgment/[id] = judgment orb + reward capsule
/profile = owner seal
/rituals = agent forge circle
/agents/live = secret market cockpit
```

Global banned elements:

```text
App Structure / Tab
User Flow
stubborn
QuixNova AI Gamble Platform
horizontal scan line
radar sweep
large obvious rotating disc
loading-spinner-like seal
fake logged-out dashboard stats
```

---

## Part 002 — `/enter` Layout, Coordinates, and Scene Geometry

Target desktop viewport: **1440×900**.

`/enter` must feel like standing before a sealed portal. It is not a landing page and not a dashboard.

### Coordinates

Top-left brand block:

```text
x=48 y=42 width=240 height=58
logo mark size=36
text: Summon / SUMMONERS WORLD
```

Top-right controls:

```text
Lore pill: x=viewport-300 y=44 w=96 h=38
System Stable: x=viewport-188 y=44 w=144 h=38
```

Main gateway group:

```text
centerX=720
seal centerY=365
seal diameter=480–560
hero text y=575
CTA y=720
CTA width=360–460
CTA height=58–68
trust strip y=805
```

### Layer stack

```text
z0 near-black base
z1 violet/magenta fog
z2 distant architecture silhouettes / pillars / stairs
z3 sparse dust particles
z4 large gateway seal
z5 hero copy + CTA
z6 brand + status controls
z7 click-transition bloom
```

### Required background depth

The current empty black page is not enough. Add distant structure:

```text
left shadow pillar around x=190–340
right shadow pillar around x=1100–1250
faint stair/platform centered around y=510–660
floating dark shards near left/right background
```

### Seal construction

GatewaySeal must contain:

```text
outer halo
outer ring
rune ring
four anchor nodes at N/E/S/W
inner diamond geometry
central lock plate
central lock icon
subtle orbit dust
```

Desktop sizes:

```text
container 520×520
outer ring 430
rune ring 370
inner geometry 250
lock plate 92
lock icon 42
```

Hard fails:

```text
seal under 420px desktop
sidebar visible
horizontal scan line visible
obvious spinning circle visible
CTA looks like small normal button
```

---

## Part 003 — `/enter` Motion Spec

`/enter` must be quiet by default. The world opens only when the user acts.

Allowed idle motion:

```text
lock breathing glow: 3.8s–4.8s cycle
seal aura breathing: 6s–8s cycle
particles drift: 18s–46s path duration
rare sparkle near anchor nodes
```

Forbidden:

```text
horizontal sweeps
radar scan
large continuous rotation
fast pulsing rings
full-screen laser lines
button loading spinner
```

Click sequence for `Enter Your World`:

```text
0ms: CTA glow increases
120ms: central lock glow intensifies
300ms: inner diamond expands ~8%
480ms: four anchor nodes brighten sequentially
700ms: soft circular bloom expands outward
950–1300ms: route fade into /summons
```

Button states:

```text
idle: Enter Your World
transition: Opening Seal...
then route: /summons
```

Pass condition: the page feels sealed and still; click produces a single ritual unlock.

---

## Part 004 — `/summons` as Your World

`/summons` is the main world screen, not an inventory dashboard.

Title:

```text
Your World
```

Subtitle:

```text
Speak a pact. Summon your familiars. Bind the proof.
```

Primary hierarchy:

```text
1. Speak Pact command
2. familiar collection
3. synergy / world status
4. secondary navigation
```

Desktop composition:

```text
left nav max width: 220–260
content starts x≈280
header y≈40–100
Speak Pact command should be high and prominent
familiar cards below/around it
synergy/status secondary, not dominant
```

Do not lead with stats like a SaaS dashboard.

Required sections:

```text
minimal world nav
large Speak Pact command module
4 familiar cards
subtle status strip
synergy panel
next path: Draft Pact -> Seal Contract -> Offer Proof -> Invoke Judgment
```

The page should feel like a personal world with living familiars.

---

## Part 005 — Familiar Card Spec

Familiar cards are not profile cards. They are living sealed assets.

Recommended desktop card:

```text
width 290–330
height 430–500
artwork area 55–65% of card height
text area 35–45%
```

Required familiar artwork:

```text
OracleX = phoenix / oracle aura
EdgeHound = hound / wolf energy silhouette
StreakWyrm = serpent / dragon trail
ClutchSpecter = panther / shadow familiar
```

Card layers:

```text
dark glass base
large creature artwork
subtle inner sigil behind creature
rarity chip
name + role
one or two stats max
one primary CTA
```

Button rule:

Do not put `View`, `Launch`, and `Bind` as three equal buttons. Use one primary action and one quiet secondary.

Preferred:

```text
primary: Summon or View
secondary: small icon/menu
```

Hover:

```text
translateY -3 to -5px
scale 1.005–1.012
glow +12–18%
artwork shimmer +10%
180ms easeOut
```

Hard fails:

```text
card mostly text
familiar art smaller than 50% card height
three equal CTAs
flat black card with pink border only
```

---

## Part 006 — Speak Pact Composer

This is the real core product action. It must not be hidden.

User action:

```text
say one sentence
```

World expression:

```text
Speak a Pact
```

Composer layout:

```text
large glass ritual input
left sigil / mic icon
placeholder: What shall you challenge today?
primary CTA: Draft Pact
secondary chips: Add Constraints / Select Proof / Invite Friend
```

Desktop placement:

```text
prefer upper-middle of /summons
width 600–780
height 150–220
```

The input should feel like a command altar, not a normal form.

Draft animation:

```text
input glow rises
small text fragments flow toward contract icon
CTA changes to Drafting Pact...
then route to /contracts/bind or show contract preview
```

Hard fails:

```text
composer below fold
composer visually smaller than familiar cards
plain input field
ordinary Send button
```

---

## Part 007 — `/contracts/bind` Scene Layout

`/contracts/bind` must be the contract ritual stage.

Correct layout:

```text
left: Challenger presence
center: large contract object + seal
right: Opponent presence
bottom: Seal Contract CTA
```

Target desktop:

```text
left panel x=130 y=190 w=280 h=520
center contract x=470 y=110 w=500 h=620
right panel x=1030 y=190 w=280 h=520
bottom CTA center x=520 y=790 w=400 h=64
```

No tilted cards. Tilted cards currently look cheap and accidental.

The center object must dominate. It must not look like a table in a rounded card.

Side panels:

```text
familiar/avatar artwork
name
role
reputation / rank
ready state
one or two key stats
```

Contract object:

```text
large glass scroll or ritual slab
floating
visible seal at lower center
terms in readable rows
faint inner geometry
```

Hard fails:

```text
center contract is small table card
side cards are tilted
Seal Integrity 12% while ready
multiple equal CTAs
no energy connection between sides and contract
```

---

## Part 008 — Contract Object and Energy Threads

The contract is a physical-feeling ritual object.

Contract object size:

```text
width 440–560
height 520–620
```

Object layers:

```text
outer glow frame
transparent glass/parchment body
inner contract terms
lower seal stamp
faint rune geometry behind terms
bottom lock line
```

Visual material:

```text
black glass
soft magenta edge glow
slight violet refraction
fine internal dust
```

Energy threads:

```text
challenger -> contract
opponent -> contract
```

Use SVG curved paths, not straight horizontal scanner lines.

Thread requirements:

```text
curved Bezier path
magenta/violet gradient stroke
blur duplicate underneath
thin bright core stroke
low idle opacity
brighter only when ready or sealing
```

Idle:

```text
opacity 0.20–0.35
no fast movement
```

Ready:

```text
opacity 0.45–0.65
very slow dash movement
```

On seal click:

```text
threads brighten
contract frame lights
seal stamp activates
one pulse travels from both sides into center
```

---

## Part 009 — Seal Contract State and Motion

The current `Seal Integrity 12%` is semantically wrong when both sides are ready.

Use states instead:

```text
Drafting: Terms Forming
Waiting: Awaiting Opponent
Ready: Ready to Seal
Sealing: Binding Contract
Sealed: Contract Bound
```

If numeric integrity is shown:

```text
Drafting: 20–60%
Waiting: 60–85%
Ready: 100%
Sealed: 100%
```

Button copy:

```text
Ready: Seal Contract
Sealing: Binding...
Sealed: Contract Bound
```

Seal click sequence:

```text
0ms button glow rises
150ms energy threads brighten
350ms contract terms illuminate line by line
650ms seal stamp presses in
900ms central glow pulse
1200ms state becomes Contract Bound
1400ms allow route to /duel/demo
```

No spinner. No scanner. No random sweep.

Hard fails:

```text
ready page showing 12%
button uses loading spinner
contract does not visually change after click
route changes instantly without ritual feedback
```

---

## Part 010 — `/duel/[id]` Proof Altar Scene

The duel page is not an upload page. It is a proof offering chamber.

Main title:

```text
Proof Altar
```

Subtitle:

```text
Present undeniable proof. Invoke final judgment.
```

Layout:

```text
left: challenger proof status
center: proof altar crystal
right: opponent proof status
bottom: evidence timeline
```

Center object:

```text
large crystal / altar platform
floating proof fragments around it
main CTA: Offer Proof
```

The upload action must be reframed:

```text
Offer Proof
Submit Witness Fragment
Feed the Core
```

Do not use plain drag-and-drop box as the dominant visual.

Proof states:

```text
Awaiting Proof
Offering Proof
Proof Offered
Proof Locked
Ready for Judgment
```

Hard fails:

```text
plain upload box in center
no altar object
no proof fragments
page feels like form upload
```

---

## Part 011 — Proof Fragment Asset and Animation

Evidence should become proof fragments.

Fragment visuals:

```text
transparent glass shard
magenta/violet edge glow
small media icon inside
slight perspective tilt
soft floating aura
```

Fragment types:

```text
video fragment
image fragment
text fragment
link fragment
document fragment
```

Upload animation:

```text
1. user selects file
2. file appears as glass shard near upload source
3. shard floats toward altar over 800–1200ms
4. altar absorbs it with small glow
5. proof slot locks
6. evidence timeline updates
```

Path should be curved and slow, not a straight laser line.

Fragment opacity:

```text
idle 0.65–0.85
active 1.0
locked 0.45 with check/sigil
```

Hard fails:

```text
file stays as normal upload row
progress shown only as linear bar
no altar absorption
no visual proof transformation
```

---

## Part 012 — `/judgment/[id]` Judgment Orb Scene

Judgment must feel summoned, not printed.

Layout:

```text
left: Evidence Quality
center: Judgment Orb / Verdict
right: AI Reasoning + Settlement Gate
bottom: Reward Capsule
```

Center object:

```text
large luminous orb
thin rings around orb
verdict text inside orb
platform below orb
proof fragments orbiting when invoking
```

Orb size:

```text
desktop diameter 360–480
center x≈720 y≈330
```

States:

```text
Pending: Orb dormant
Invoking: fragments orbit and enter orb
Ready: verdict text appears
Resolved: reward capsule activates
```

Verdict reveal:

```text
proof fragments fade into orb
orb brightness increases
verdict title fades in
confidence and evidence panels activate
reward capsule glows
```

Hard fails:

```text
judgment shown as plain result card
no central orb
confidence panel dominates center
reward is plain button only
```

---

## Part 013 — Reward Capsule / Blind Reveal

Reward reveal is the emotional payoff.

Object:

```text
glass capsule or crystal box
centered bottom or lower-middle
contains glowing shard/card/module
```

Layout:

```text
left: Reward Assembled copy
center: capsule object
right: rarity / tier / contents preview
bottom CTA: Open Reward / Return to Your World
```

Reveal sequence:

```text
0ms capsule wakes
250ms lid/outer ring opens
550ms internal crystal rises
900ms reward card appears
1200ms rarity label lights
```

Do not use confetti or explosive particles. Use controlled light, glass, and crystal.

Rarity colors:

```text
Common: muted silver
Rare: cool blue-violet
Epic: purple/magenta
Legendary: warm gold-magenta
Mythic: hot pink + violet bloom
```

Hard fails:

```text
plain reward modal
confetti explosion
reward shown before reveal
no capsule object
```

---

## Part 014 — `/profile` Owner Seal

Profile is an identity seal chamber.

Logged-out state must be minimal.

Do not show:

```text
QX Balance 0
Active Contracts --
Settled Pacts --
Total Staked --
Primary Familiar
fake world actions
```

Logged-out layout:

```text
center: Owner Seal locked
headline: Your Owner Seal is Locked
subtitle: Sign in to bind your identity, summons, contracts, and proof history.
primary CTA: Sign In
secondary CTA: Return to World
small note: Your public actions remain hidden behind the seal.
```

Logged-in layout:

```text
center: owner seal
left: identity / level / reputation
right: primary familiar / active pacts
bottom: private record history
```

Hard fails:

```text
fake stats for guest
ordinary profile dashboard
avatar card as centerpiece
no owner seal
```

---

## Part 015 — `/rituals` Agent Forge

Rituals page is not a module list. It is an agent forge.

Layout:

```text
left: current familiar
center: forge circle + module slots
right: available modules
bottom: Infuse CTA + cost/status
```

Center forge:

```text
large circular forge ring
familiar silhouette or core at center
3–6 module sockets around ring
selected modules connected by energy threads
```

Module cards:

```text
small glass cards
rarity chip
module name
effect line
cost
```

Infuse motion:

```text
selected modules float into sockets
forge ring lights
familiar aura changes
result preview appears
```

Hard fails:

```text
plain grid of upgrades
no central forge
no sockets
no familiar preview
```

---

## Part 016 — `/agents/live` Secret Market Cockpit

This page shows active familiars acting in secret. It must not feel like a normal market dashboard.

Layout:

```text
left: deployed familiars
center: secret market stage
right: encrypted activity feed
bottom: owner hidden seal / proof strip
```

Headline:

```text
Summoned. Anonymous. Acting in Secret.
```

Center market stage:

```text
market title
two sides / odds
trend chart
confidence / pool
central lock/sigil behind market
```

Left deployed familiars:

```text
sigil avatar
name
status
small win rate or active action
```

Right activity:

```text
action feed should look encrypted/private
not a normal log table
```

Bottom strip:

```text
Owners Remain Hidden
Agents Act in Secret
Verifiable / On-chain / Fair
```

Hard fails:

```text
market card is just normal odds table
agent list looks like contacts
activity feed looks like admin log
hidden owner only appears as text with no visual seal
```

---

## Part 017 — Typography System

Use modern product typography. Avoid old fantasy.

Recommended main fonts:

```text
Geist
Inter
Satoshi
SF Pro style
```

Heading rules:

```text
font weight 500–650
letter spacing -0.055em to -0.02em for large headings
line height 0.94–1.05
```

Small ritual labels:

```text
uppercase allowed
font size 10–12
letter spacing 0.20em–0.32em
weight 600–700
color soft pink with opacity
```

Do not:

```text
use medieval serif as main UI
use all caps for every heading
use huge letter spacing everywhere
mix fantasy serif titles with SaaS cards
```

Correct tone:

```text
modern, quiet, premium, ethereal
```

Wrong tone:

```text
old RPG menu, medieval book, cyberpunk template
```

---

## Part 018 — Particle System

Particles are atmosphere, not decoration.

Density:

```text
desktop 40–80 particles max
mobile 15–35 particles max
```

Sizes:

```text
dust 1–2px
rare sparkle 3–4px
```

Opacity:

```text
background dust 0.08–0.25
near centerpiece 0.25–0.45
event particles 0.45–0.75
```

Motion:

```text
slow drift
very small parallax
rare shimmer
subtle orbit near ritual object
```

Never use:

```text
fast dots
fireworks
confetti
snowfall
random streaks
scanner beams
```

Create one reusable component:

```text
ParticleField({ density, focus, color, interactive })
```

Default for `/enter`:

```text
density low, focus center, mixed magenta/violet, non-interactive
```

---

## Part 019 — Global Motion System

Motion must be state-driven.

Default rule:

```text
still by default -> hover response -> click ritual -> calm again
```

Delete:

```text
scan lines
radar sweeps
always-spinning discs
always-glowing sweeps
random full-screen motion
```

Allowed:

```text
breathing glow
soft hover lift
line illumination when state changes
proof fragment travel
judgment reveal
reward capsule open
```

Global animation durations:

```text
hover: 160–220ms
soft reveal: 300–520ms
page transition: 500–900ms
major ritual action: 900–2600ms
```

Reduced motion:

If user prefers reduced motion:

```text
remove drifting particles
remove route motion
keep simple fades only
no animated path travel
```

Hard fail: if a page moves constantly while user does nothing.

---

## Part 020 — Screenshot QA and Hard Gates

Build passing is not visual acceptance.

Required screenshots:

```text
/enter 1440×900 and 390×844
/summons 1440×900 and 390×844
/contracts/bind 1440×900
/duel/demo 1440×900
/judgment/demo 1440×900
/profile logged out 1440×900
/rituals 1440×900
/agents/live 1440×900
```

Automated text checks:

```text
grep zero: App Structure / Tab
grep zero: User Flow
grep zero: stubborn
grep zero user-facing: QuixNova AI Gamble Platform
```

Visual hard gates:

```text
/enter no sidebar
/enter no scan line
/enter seal at least 420px desktop
/contracts/bind no tilted cards
/contracts/bind no ready-state Seal Integrity 12%
/profile logged out no fake stats
/familiar cards artwork at least 50% card height
/judgment has central orb
/duel has central proof altar
/rituals has central forge
```

Manual acceptance question for every page:

```text
Does this feel like a Summoners World scene, or a themed dashboard?
```

If answer is dashboard, reject the implementation.

---

## Required Build / Verification

After implementing:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Then generate screenshots. Do not claim done without screenshot review.

Final rule:

```text
Do not patch colors. Do not add random glow. Rebuild the scene composition.
```
