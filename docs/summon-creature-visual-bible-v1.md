# Summoner.world — Career Creature Visual Bible v1

**Status:** art direction and interactive UI blueprint, not final renders, owned inventory, verified lifetime XP, purchasable items or a production gacha system.

## Product identity: Pico is the beginning, not the template

Pico remains the one universal initial companion. Its soft cream / mint 3D storybook styling anchors the universe, but **no profession is a recolor of Pico**. Players may explore multiple unrelated careers. Species identity is primarily communicated through silhouette; color, adornments and glow are secondary.

### Build in this order

1. **12 species silhouettes**: twelve memorable original anatomical foundations that are recognizable as a black shape at 32–48 px.
2. **36 occupational motifs**: the current three sample skills in each family change crest/tool/texture, not account-owned inventory.
3. **Three visual stages per family**: base (Lv 1–2), evolved (Lv 3–4), ascended (Lv 5). These are speculative form designs, not currently earned levels.
4. **Five rarity presentations**: aura, border, particle density and a fixed silhouette remain separate from profession/milestone power. Keep the existing disclosed draft probability model *preview only*.
5. **Cross-family hybrid blueprints**: two original anatomies must merge into a distinct new silhouette and preserve recognizable traits of both parents. Rarity must not inflate just by repeatedly recombining parents.

The planned 360+ profession ontology should map into versioned families and specialties; **do not promise to hand-model 360 distinct creatures immediately**. Create strong reusable anatomical parts, then author distinctive signature species for prominent professions as earned unlocks. O*NET alignment is a separate taxonomy task; current 12/36 lists are examples, not the full official set.

## Rendering specification

- Original soft 3D picture-book creatures: physically coherent toy-like anatomy, matte microtexture, selective translucent edges, warm white light from upper left and restrained colored bounce lighting.
- 3/4 front hero angle, both eyes readable; hero is centered and occupies 74–82% of a square 1024×1024 alpha canvas with safe margins. Also require side/back turnaround and an expressive action pose.
- Silhouette design checkpoint at 48 px: ears / fins / plates / wings / antlers must identify the profession family without labels.
- Produce each **species + stage** as a named source package: editable original model or layered illustration source, stable asset ID, 1024px alpha PNG master, web-optimized WebP derivatives, accessible caption and attribution.
- Use a unique silhouette, face, tail and pose vocabulary for each family. Do not use generic "same round pet + object" or copied third-party monster identities.
- On iOS, show high-quality 3D artwork only when a real approved asset exists. Until then show an unmistakably *symbolic family crest* rather than cropping Pico artwork into another creature's portrait.
- Palette reference: pale mint, sky, coral, lilac and soft gold; saturated color is reserved for creature accents, rarities and major actions, not whole-screen dark UI.
- Motion: idle blink/breath ≤2s, profession-specific gesture ≤3s, with Reduce Motion still images and no constant heavy particles.

## Visual blueprints and emotional range

The canonical 12 family briefs, each with shape, material, motion, personality, 3 named stages and 3 specialty-specific body motifs, live in
`src/lib/summons/creature-visual-bible.ts`.

Several prototype silhouettes to sketch first:

- **Circuitling / Software**: six-sided otter, detached glass logic chips, delicate illuminated antenna fins. Evolves into Neuralcrest with more active orbiting segments rather than bigger spikes.
- **Stridekin / Athletics**: hare spring-legs, motion ribbons wound around ankles, asymmetrical ears. Evolves into Cometstride, with light-trail movement without holding literal sports gear.
- **Forgecub / Engineering**: pangolin cub with interlocking shell plates, swivel tool on the shoulder and one heavy digging forepaw. Evolves into Archforge with a readable modular shell.
- **Pulsepet / Healthcare**: seal-axolotl with layered gill fins, opal skin and quiet healing pulses; avoid medical symbols pasted to the forehead.
- **Prismite / Art**: chameleon-butterfly with hinged stained-glass sails and paint-drop tail. Evolves by opening new wing facets, not through simply adding a palette.
- **Mossprite / Nature**: tiny woodland deer with moss mantle and branching sprout antlers. Evolves by changing leaf geometry and stance.

Every sketch should be approved as (1) a black silhouette, (2) a low-poly blockout, (3) a finished render, and (4) a 48 px game card thumbnail. Never skip the black-silhouette proof for expensive modeling.

## Better mobile UX than the current 4-screen-long studio

The Familiars entry keeps the original Pico hero and honest account-bound XP record. Under it:
- **Career Atlas** — a 12-family browsable collection of symbolic crests, with a family detail and specialty selector.
- **Summon Preview** — client-only probability demonstration; clearly says NO ITEM AWARDED.
- **Fusion Lab** — two career design marks and a preview lineage; no owned parents consumed.
- **XP Guide** — model-only progression economics, separated from actual server-recorded events.

The four focused chapters avoid forcing users past chance and fusion controls to find the career they care about. The native bottom five-tab navigation, quest creation, settlement, credits and authentic XP account records are unchanged.

## Release and economic boundary

No production creature grants, paid chance, cash-equivalent token spending, local chance-state persistence, XP settlement hook, Fusion mutations, migrated data, or ownership claim is authorized by this design PR. Real ticket issuance, CSPRNG draws, anti-farm limits and fusion need separately reviewed server transactions and compliance.

## Sign-off checklist

- 12 distinct family silhouettes / no repeated Pico portrait
- 36 distinct occupation motif descriptions
- 3 stable form concepts per family
- 320px and 390px iPhone screenshots without horizontal overflow
- Accessible focus and selected state; night mode + Reduce Motion supported
- A real artwork source file for each creature before claiming finished production art
- Concept/partial XP clearly distinguished from authenticated server records
- CI + actual iOS Simulator green before integration merge; never merge directly to production
