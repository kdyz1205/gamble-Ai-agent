# Summon / Summoners World — Ultra Detailed Visual Implementation Spec

This document is stricter and more detailed than `docs/visual-direction-bible.md`.

Use this file when Codex or another agent keeps producing a generic dark dashboard instead of the desired Summoners World scene.

The goal is not to provide inspiration. The goal is to describe the desired UI in enough detail that an implementation agent has no room to reinterpret it as normal cards, normal dashboards, normal upload forms, or normal admin pages.

---

# 0. One Sentence Product Reality

The underlying product is simple:

```text
A user says one challenge sentence, invites a friend, both provide proof, and AI settles the outcome.
```

The user-facing world is:

```text
A user enters Summoners World, speaks a pact, binds a contract, offers proof, invokes judgment, and reveals a reward.
```

Everything in the UI must preserve the simple product flow while visually translating it into a premium ritual-tech game-like world.

---

# 1. Global Emotional Target

Every page must produce a specific emotional response.

The user should feel:

```text
I entered a private world.
This place has rules.
My challenge has weight.
My proof matters.
The AI judgment feels final.
The reward reveal gives closure.
```

The user must not feel:

```text
I am looking at a SaaS dashboard.
I am looking at a template.
I am using a developer debug page.
This is a pink dark mode app.
This is a loading animation demo.
```

---

# 2. Global Art Direction

## 2.1 Correct style words

Use this language when building or reviewing:

```text
dreamlike
ethereal
silent
premium
ritual-tech
AI oracle
sealed world
glass ritual interface
violet-black space
magenta energy
soft fog
crystalline proof
summoned familiar
final judgment
```

## 2.2 Wrong style words

Reject anything that feels like:

```text
cyberpunk template
SaaS dashboard
admin panel
stats dashboard
old RPG menu
medieval fantasy parchment
PPT sci-fi
radar screen
loading spinner
CSS circle demo
pink bordered cards
```

## 2.3 Visual baseline

The visual baseline is:

```text
black and deep violet atmospheric world
soft magenta light used as energy
thin geometric sigils used as structure
large hero objects used as page centerpieces
sparse UI panels only where information is necessary
modern typography
very controlled motion
```

---

# 3. Global Page Architecture

Every major route is a scene with a dominant object.

| Route | Scene Name | Dominant Object | Primary Emotion | Primary User Action |
|---|---|---|---|---|
| `/enter` | Sealed Gateway | locked portal seal | mystery / entry | Enter Your World |
| `/summons` | Your World | pact command + familiar collection | ownership / agency | Speak a Pact |
| `/contracts/bind` | Contract Binding Ritual | central contract object | commitment / tension | Seal Contract |
| `/duel/[id]` | Proof Altar | central proof crystal | proof / responsibility | Offer Proof |
| `/judgment/[id]` | Judgment Chamber | judgment orb | finality / truth | Invoke / View Judgment |
| `/profile` | Owner Seal | identity seal | privacy / identity | Sign In / Bind Identity |
| `/rituals` | Agent Forge | forge circle | upgrade / preparation | Infuse Module |
| `/agents/live` | Secret Market Cockpit | hidden-owner market stage | secrecy / agency | Deploy / Monitor Agent |

A page fails if its dominant object is missing or visually weaker than its surrounding cards.

---

# 4. Global Viewport Rules

## 4.1 Desktop target

Primary desktop composition must be designed for:

```text
1440px × 900px
```

The first implementation should optimize for this size before attempting responsive polish.

## 4.2 Mobile target

Mobile reference size:

```text
390px × 844px
```

Mobile should preserve the scene feeling, not collapse everything into plain stacked cards.

## 4.3 Scroll rules

Routes that should be single composed scenes on desktop:

```text
/enter
/contracts/bind
/duel/[id]
/judgment/[id]
/profile logged-out
```

These may have minor internal overflow on small devices, but at 1440×900 they should not force the user to scroll to understand the scene.

Routes allowed to scroll on desktop:

```text
/summons
/rituals
/agents/live
/profile logged-in
```

Even when scrolling is allowed, the above-the-fold area must have one clear visual centerpiece.

---

# 5. Global Layer System

Every scene should use a 7-layer model.

```text
Layer 0: black/violet base
Layer 1: low-frequency atmospheric fog
Layer 2: distant world architecture or abstract silhouettes
Layer 3: sparse particle field
Layer 4: main scene object
Layer 5: supporting UI panels
Layer 6: hero text and primary CTA
Layer 7: transition bloom / action feedback
```

Never place normal cards directly onto a flat black background without layers 1–3.

---

# 6. Global Color Rules

## 6.1 Base colors

Use:

```text
#000000 true black only at deepest edges
#050006 near black
#09000d violet black
#120018 deep wine-black
#19001f deep violet-magenta shadow
```

Do not use flat black as the only background.

## 6.2 Energy colors

Primary energy:

```text
#ff4fb8 hot magenta
#ff5bc8 soft hot pink
#e950ff electric violet-pink
#c66cff soft violet
```

These colors should represent energy, seal states, living familiars, and ritual action.

Do not use bright magenta on every label, border, button, icon, and stat simultaneously.

## 6.3 Success colors

Use green only for real verified states:

```text
#3df5a3 verified green
#22c77a stable green
```

Examples:

```text
System Stable
Seal Verified
On-chain Confirmed
Proof Verified
```

Never use green as a decorative accent.

## 6.4 Text colors

```text
primary text: rgba(255,255,255,0.94)
secondary text: rgba(238,225,244,0.66)
muted text: rgba(238,225,244,0.42)
ritual label: rgba(255,155,220,0.78)
```

---

# 7. Typography System

## 7.1 Main product font

Use a modern sans-serif. Recommended:

```text
Geist
Inter
Satoshi
SF Pro style
```

Do not use a heavy medieval or old-fashioned fantasy serif as the main UI font.

## 7.2 Hero title style

For hero titles:

```text
font weight: 520–650
letter spacing: -0.055em to -0.02em
line height: 0.92–1.05
```

Example:

```text
Every pact begins
beyond the veil.
```

Only one phrase should use the magenta accent.

## 7.3 Ritual label style

Small uppercase labels are allowed:

```text
SEALED GATEWAY
CONTRACT TERMS
PROOF OFFERED
JUDGMENT READY
```

Style:

```text
font size: 10–12px
letter spacing: 0.20em–0.32em
font weight: 600–700
color: rgba(255,155,220,0.78)
```

Do not set the entire interface in uppercase.

## 7.4 Typography hard failures

Reject if:

```text
headings look like medieval fantasy book titles
every heading is all caps
every module uses wide letter spacing
serif title is paired with generic SaaS cards
text hierarchy is unclear
```

---

# 8. Motion System

## 8.1 Core rule

The product should be:

```text
still by default -> responsive on hover -> ceremonial on click -> calm after action
```

## 8.2 Banned motion

Delete and do not reintroduce:

```text
horizontal scanning lines
radar sweep lines
full-screen laser lines
large obvious continuously rotating discs
loading-spinner-style seal rings
fast flickering text
random glow streaks
permanent pulse on every button
```

## 8.3 Allowed ambient motion

Use only:

```text
slow breathing glow
sparse dust drift
subtle parallax
rare sparkle near key nodes
very slow brightness variation
```

## 8.4 Timing standards

```text
hover: 160–220ms
small reveal: 300–520ms
scene transition: 500–900ms
major ritual action: 900–2600ms
particle drift: 18–46s
seal breathing: 3.8–4.8s
large aura breathing: 6–8s
```

## 8.5 Reduced motion

If user prefers reduced motion:

```text
turn off particle drift
turn off path travel animations
keep opacity fades
keep no continuous rotation
```

---

# 9. Particle System

## 9.1 Purpose

Particles are atmosphere. They are not decoration. They should imply dust, energy residue, or proof fragments.

## 9.2 Density

```text
desktop: 40–80 tiny particles max
mobile: 15–35 tiny particles max
```

## 9.3 Particle size

```text
dust: 1–2px
rare sparkle: 3–4px
event particle: 2–5px
```

## 9.4 Opacity

```text
background dust: 0.08–0.25
near main object: 0.25–0.45
event-triggered particles: 0.45–0.75
```

## 9.5 Motion

Correct:

```text
slow drift
subtle vertical float
small parallax
rare single sparkle
soft orbit near a seal or orb
```

Wrong:

```text
confetti
snowfall
fireworks
fast flying dots
random streaks
scanner beams
```

## 9.6 Reusable component

Create:

```ts
type ParticleFieldProps = {
  density: 'low' | 'medium'
  focus?: 'center' | 'bottom' | 'none'
  color?: 'magenta' | 'violet' | 'mixed'
  interactive?: boolean
}
```

Default:

```text
/enter: density low, focus center, color mixed
/contracts/bind: density low, focus center
/duel: density medium around altar only
/judgment: density medium during invocation, low after resolved
```

---

# 10. Material System

## 10.1 Glass panel material

Use glass panels only as supporting surfaces.

Material description:

```text
transparent black glass
thin magenta/violet edge light
subtle internal bloom
slight blur behind
not solid purple
not thick neon outline
```

CSS baseline:

```css
background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025));
border: 1px solid rgba(255,105,200,0.18);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 70px rgba(255,45,160,0.08);
backdrop-filter: blur(18px);
```

## 10.2 Glow rule

Use layered glow:

```css
box-shadow:
  0 0 0 1px rgba(255,80,190,0.22),
  0 0 24px rgba(255,60,180,0.18),
  0 0 80px rgba(165,80,255,0.10);
```

Do not make every panel glow equally.

## 10.3 Border rule

Borders should be thin, low-opacity, and almost invisible until hover/action.

Hard fail:

```text
thick pink rectangle around every component
```

---

# 11. Asset System

CSS alone is not enough. The reference concepts look good because they use visual assets.

Required asset categories:

```text
sealed gateway background
central seal SVG
familiar artwork: phoenix, hound, wyrm, specter
contract object / glass scroll
energy thread SVG/path
proof altar crystal
proof fragment shards
judgment orb
reward capsule
owner seal
forge circle
```

Lucide or generic icons may be used only for small metadata. They must not be main hero artwork.

---

# 12. `/enter` Extreme Spec

## 12.1 Purpose

The page must feel like a sealed world entrance.

Emotion:

```text
quiet awe
mystery
threshold
invitation
```

## 12.2 Desktop coordinates

Target: 1440×900.

Top-left:

```text
brand block x=48 y=42 w=240 h=58
logo mark x=48 y=44 size=36
brand text x=96 y=40
```

Top-right:

```text
Lore x=1140 y=44 w=96 h=38
System Stable x=1252 y=44 w=144 h=38
```

Main:

```text
seal center x=720 y=365
seal diameter=520
seal box x=460 y=105 w=520 h=520
hero copy x=360 y=575 w=720 h=150
CTA x=500 y=720 w=440 h=64
trust strip x=505 y=805 w=430 h=44
```

## 12.3 Seal layers

The seal must include:

```text
outer halo 520px
outer ring 430px
rune ring 370px
inner diamond 250px
central plate 92px
lock icon 42px
four anchor nodes 42px each
```

Anchor positions relative to 520×520 seal box:

```text
N: x=260 y=54
E: x=466 y=260
S: x=260 y=466
W: x=54 y=260
```

## 12.4 Text

```text
SEALED GATEWAY
Every pact begins
beyond the veil.
Step through the sealed gateway to enter your world of AI contracts, cryptographic proof, and final judgment.
Enter Your World
Verifiable | On-chain | Fair
```

## 12.5 Interaction

On hover CTA:

```text
lift -2px
glow +15%
arrow shifts 4px right
180ms
```

On click:

```text
0ms CTA glow rises
120ms lock glow rises
300ms inner diamond opens
480ms anchor nodes brighten sequence
700ms bloom expands
950–1300ms route to /summons
```

## 12.6 Hard fails

```text
visible sidebar
small center circle
flat black empty page
horizontal sweep
rotating disc
CTA under 320px width
seal under 420px desktop
```

---

# 13. `/summons` Extreme Spec

## 13.1 Purpose

This is the user's world.

Emotion:

```text
ownership
agency
collection
preparation
```

## 13.2 Layout

Desktop 1440×900:

```text
sidebar x=0 y=0 w=240 h=900
content x=280 y=40 w=1120
header x=280 y=40 h=90
pact composer x=280 y=130 w=1120 h=190
familiar grid x=280 y=350 w=1120 h=440
synergy x=280 y=810 w=1120 h=70
```

Alternative if cards lead:

```text
header top
pact composer left/bottom but visually large
cards occupy main row
```

Pact composer must not be visually smaller than the cards.

## 13.3 Familiar card layout

Card:

```text
w=260–310
h=430–500
art area h=250–320
info area h=160–190
```

Art must occupy at least 55% of card height.

Card info:

```text
rarity chip
name
role
win rate
one key metric
one primary action
```

Do not show too many stats.

## 13.4 Familiar art

Each familiar must feel alive:

```text
OracleX: pink phoenix, wing aura, oracle center spark
EdgeHound: purple hound/wolf, forward motion, momentum lines
StreakWyrm: magenta serpent/dragon, curved streak trail
ClutchSpecter: violet panther/specter, shadow aura
```

## 13.5 Speak Pact composer

Text:

```text
Speak a Pact
What shall you challenge today?
Draft Pact
Add Constraints
Select Proof
Invite Friend
```

Composer visual:

```text
large glass input
central small sigil
soft magenta edge
command-line feeling without looking like a terminal
```

## 13.6 Interactions

Card hover:

```text
raise -4px
scale 1.008
art shimmer slightly
glow +15%
```

Click familiar:

```text
open detail overlay or route
card expands from current position
background dims
familiar art becomes larger
```

Draft Pact click:

```text
input text glows
small glyphs travel toward contract icon
button text changes to Drafting...
route to /contracts/bind
```

---

# 14. `/contracts/bind` Extreme Spec

## 14.1 Purpose

This is the moment where a normal challenge becomes a contract.

Emotion:

```text
commitment
tension
seriousness
irreversibility
```

## 14.2 Layout

Desktop 1440×900:

```text
brand top-left x=48 y=40
status top-right
page title x=0 centered y=44
challenger panel x=140 y=190 w=280 h=500
contract object x=470 y=120 w=500 h=600
opponent panel x=1020 y=190 w=280 h=500
bottom status strip x=250 y=735 w=940 h=70
Seal CTA x=520 y=805 w=400 h=64
```

No tilted cards.

## 14.3 Contract object

Contract object must be large and physical-feeling.

Layers:

```text
outer glass frame
transparent body
inner contract terms
lower seal stamp
faint geometry behind terms
floating dust inside object
```

Contract terms:

```text
Speak Pact
QuixNova challenges EdgeHound
Win condition
Proof requirement
Judgment
Penalty
Time limit
```

If names change, keep structure.

## 14.4 Participant panels

Each panel:

```text
large familiar/avatar circle top
name
role
grade/rank
win rate
staked asset
ready status
```

Panels must be upright, calm, symmetrical.

## 14.5 Energy threads

Two curved threads:

```text
left participant -> contract left edge
right participant -> contract right edge
```

Path shape:

```text
smooth Bezier curve, not straight line
start low opacity
pulse only when ready/sealing
```

## 14.6 Seal status

State machine:

```text
Drafting -> Awaiting Opponent -> Ready to Seal -> Binding -> Contract Bound
```

Do not show 12% when ready.

If ready:

```text
Seal Integrity: 100% / Ready to Seal
```

## 14.7 Seal click motion

```text
0ms button brightens
150ms energy threads brighten
350ms terms illuminate
650ms seal stamp lowers/locks
900ms center pulse
1200ms Contract Bound
1400ms proceed to /duel/demo
```

---

# 15. `/duel/[id]` Extreme Spec

## 15.1 Purpose

This is where proof is offered.

Emotion:

```text
evidence
accountability
ritual offering
anticipation
```

## 15.2 Layout

Desktop:

```text
left panel x=120 y=130 w=300 h=560
center altar x=470 y=130 w=500 h=560
right panel x=1020 y=130 w=300 h=560
bottom timeline x=120 y=720 w=1200 h=130
```

## 15.3 Center altar

Object:

```text
crystal or glass altar
platform below
proof fragments orbiting or waiting
main CTA: Offer Proof
```

Altar dimensions:

```text
crystal height 260–360
platform width 360–480
CTA width 320–420
```

## 15.4 Side panels

Each side:

```text
participant familiar
contract active badge
time remaining
proof offered count
proof slots
view offered proof link
```

## 15.5 Proof offering action

Click Offer Proof:

```text
open file/source selector
selected item becomes proof fragment
fragment travels into altar
altar glows
proof slot locks
timeline updates
```

Do not use a plain upload box as the main visual.

---

# 16. `/judgment/[id]` Extreme Spec

## 16.1 Purpose

This is where truth is revealed.

Emotion:

```text
finality
clarity
judgment
reward
```

## 16.2 Layout

Desktop:

```text
left evidence panel x=120 y=120 w=320 h=520
center orb x=470 y=110 w=500 h=520
right reasoning panel x=1020 y=120 w=320 h=520
bottom reward strip x=120 y=670 w=1220 h=180
```

## 16.3 Judgment orb

Orb:

```text
diameter 360–480
floating above platform
thin rings
verdict text inside
subtle proof fragments during invoking
```

States:

```text
Dormant
Invoking
Verdict Ready
Resolved
```

## 16.4 Evidence panel

Show:

```text
Evidence Quality grade
Integrity percent
Proof summary list
Verification status
View full evidence
```

## 16.5 Reasoning panel

Show:

```text
AI Reasoning summary
Checks passed
Confidence
Inference time
Settlement Gate
```

## 16.6 Reward capsule

Bottom strip:

```text
left: Your Reward Awaits
center: capsule/crystal object
right: rarity / tier / contents
CTA: Open Reward
secondary: Return to Your World
```

Reveal sequence:

```text
capsule wakes
outer ring opens
crystal rises
reward card appears
rarity label lights
```

---

# 17. `/profile` Extreme Spec

## 17.1 Logged out

This page must not show fake stats.

Layout:

```text
center owner seal x=520 y=180 w=400 h=400
headline below y=560
CTA Sign In y=680
secondary Return y=750
```

Text:

```text
Your Owner Seal is Locked
Sign in to bind your identity, summons, contracts, and proof history.
Sign In
Return to World
Your public actions remain hidden behind the seal.
```

Banned in logged-out state:

```text
QX Balance 0
Active Contracts --
Settled Pacts --
Total Staked --
Primary Familiar
World Actions grid
```

## 17.2 Logged in

Layout:

```text
center owner seal
left identity/reputation
right primary familiar/active pacts
bottom private records
```

---

# 18. `/rituals` Extreme Spec

## 18.1 Purpose

This is the agent forge, not a module list.

Layout:

```text
left familiar x=100 y=140 w=300 h=600
center forge x=440 y=100 w=560 h=620
right modules x=1040 y=140 w=320 h=600
bottom CTA x=480 y=780 w=480 h=64
```

Center forge:

```text
large circular forge ring
familiar core/silhouette
3–6 module sockets
selected modules connect via energy threads
```

Infuse motion:

```text
selected modules float into sockets
forge lights
familiar aura changes
result preview appears
```

---

# 19. `/agents/live` Extreme Spec

## 19.1 Purpose

This shows anonymous agents acting in secret.

Layout:

```text
headline top center
left deployed familiars x=80 y=160 w=320 h=600
center market x=430 y=170 w=560 h=520
right encrypted activity x=1040 y=160 w=320 h=600
bottom owner-hidden strip x=360 y=720 w=720 h=90
```

Headline:

```text
Summoned. Anonymous. Acting in Secret.
```

Center market stage:

```text
market name
left/right odds
trend chart
market confidence
pool
central lock/sigil behind chart
```

Left agents must look like deployed familiars, not contact rows.

Right feed must look encrypted/private, not admin logs.

---

# 20. Screenshot QA

For every implementation pass, generate screenshots:

```text
/enter 1440×900 and 390×844
/summons 1440×900
/contracts/bind 1440×900
/duel/demo 1440×900
/judgment/demo 1440×900
/profile 1440×900 logged-out
/rituals 1440×900
/agents/live 1440×900
```

Hard grep checks:

```text
zero App Structure / Tab
zero User Flow
zero stubborn
zero QuixNova AI Gamble Platform in user-facing UI
```

Visual hard gates:

```text
/enter no sidebar
/enter seal >=420px
/enter no scan line
/contracts no tilted cards
/contracts no ready-state 12% integrity
/duel has center altar
/judgment has center orb
/profile logged-out has no fake stats
/rituals has center forge
/agents/live has center market cockpit
```

Do not claim done without screenshots.

---

# 21. Implementation Order

Do not fix all pages at once.

Phase 1:

```text
/enter
/contracts/bind
```

Phase 2:

```text
/summons
/duel/demo
/judgment/demo
```

Phase 3:

```text
/profile
/rituals
/agents/live
```

For each page:

```text
1. build scene composition
2. remove dashboard scaffolding
3. implement only allowed motion
4. screenshot at 1440×900
5. compare to hard gates
6. only then continue
```

---

# 22. Final Rule

Do not patch colors.
Do not add more random glow.
Do not keep old dashboard scaffolds.
Do not rely on generic icons as main visuals.
Do not reinterpret scene pages as dashboards.

Build the world.
