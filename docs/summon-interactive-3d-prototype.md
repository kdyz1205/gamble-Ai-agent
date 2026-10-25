# Summoner.world 3D blockouts — interactive iOS prototype

This release integrates nine **actual triangulated GLB scene files** for the
three already-illustrated families. These meshes are procedural **blockouts**,
not rigged or texture-baked game-ready characters. The beautiful 2D
illustrations remain the default app UI.

## User-visible behavior

On /app/picos -> Career Atlas, select Software & AI, Sports & Performance
or Nature & Agriculture. When the three-stage model exists, an optional
**Inspect 3D prototype** button appears below the normal evolution strip.
It lazy-loads a scene into a local WebGL canvas and provides:

- Drag-to-orbit with horizontal and vertical limits
- Pinch/scroll-to-zoom with safe distance limits
- Rotate left, rotate right and Reset accessible buttons
- Exact model updates when Lv1/Lv3/Lv5 preview slider changes
- Explicit unavailable status if WebGL fails or the requested static GLB is missing
- Real static illustration always visible above the optional model
- No autoplay or perpetual GPU render loop; closes and disposes scene memory

Other careers (nine families) do NOT receive a fake 3D viewer or ownership.

## Source/provenance

The deterministic source is scripts/generate_summon_3d_blockouts.py.
Its coordinate convention is X left-right, -Y forward, Z up; the Three.js
viewer rotates that original Z-up scene into Y-up for presentation.

The nine source assets are committed under:
public/storybook-premium/summons/models/

Each binary is a valid glTF 2.0 GLB with real named triangle meshes,
vertex colors, exactly four named creature limbs, and stage-specific
anatomical elements. The manifest in
src/lib/summons/creature-model-manifest.ts records node and triangle
counts for independent checks. The automated test
scripts/test-creature-3d-model-assets.ts reads each real file and
checks its GLB header, scene primitives, vertex colors, limb nodes,
triangle count and uniqueness. Falsified headers fail.

This is intentionally distinct from the separate original 2D concept art
in creature-render-manifest.ts. Source script regeneration with a
different trimesh version may produce different binary SHA-256 bytes
while preserving verified mesh/node/triangle geometry.

## Non-goals and safety

No production database, authentication, XP accrual, credits, Quest
settlement, real random creature draws, tickets, fusion transactions,
ownership or native iOS signing changed. There is no claim of finished
UVs, PBR textures, animation, skinned skeletal rigging, physics,
collision, watertight single body, 3D printing quality or final art
approval. CPU/GPU work begins only when the user opts into the preview.

Production deployment remains separate: this work goes only to the
iOS integration branch after exact-head CI, Vercel staging, browser
interactive/negative regression and real iPhone Simulator smoke tests.
