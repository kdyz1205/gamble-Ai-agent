# First three Summon Families — Nine Illustrated Stage Assets

## What exists

This release contains original **2D rendered illustrations that look three-dimensional**.
There is **no** editable 3D mesh, rig, animation, USDZ, glTF/GLB or automatic
real-world career verification. Do not call the pictures finished 3D models.

The existing Pico companion is universal and unchanged. These three species
belong to a speculative career-creature catalog; the renders do not constitute
owned inventory or proof of an earned level. Live summon tickets, fusion and XP
are implemented/reviewed in separate workstreams and are not changed here.

| Family | Stage 1 | Stage 3 | Stage 5 |
|---|---|---|---|
| Software / AI | Circuitling | Logicwhirl | Neuralcrest |
| Athletics | Stridekin | Dashstride | Cometstride |
| Nature | Mossprite | Branchtide | Grovewarden |

Nine optimized web images are committed under
`public/storybook-premium/summons/<species>-<base|evolved|ascended>.webp`.
The file manifests are in `src/lib/summons/creature-render-manifest.ts`.
All images are individually generated, not crops of the previously reused
Pico illustration and not a single recolored sprite.

## Render pipeline & actual source records

Source illustration generations are maintained in the connected asset
workspace. Three 2048px chibi base renders came from task IDs:

- Circuitling: `4947c69a-fa5e-449d-87d3-5a8ece5c575e`
- Stridekin: `cbfc2a7c-fd6d-49c6-9da1-96931021b6e5`
- Mossprite: `d533d64f-e31c-4eca-b9e1-6902ceec462d`

Each evolved and ascended illustration references its matching approved base:

- Logicwhirl `d27fe598-8817-40da-853c-a4337b42766d`
- Neuralcrest `a99bb4eb-eda4-4e3e-a9a1-a52567f851a3`
- Dashstride `d2f72e50-fd9f-4e12-a4b0-7fbe32983cc0`
- Cometstride `0e31be18-97b4-489a-8472-4e3350ad205a`
- Branchtide `c08123d5-e935-4ca0-a31a-10d27bf1ab47`
- Grovewarden `e7426380-33cd-41f7-bbbc-d3fc755d6113`

Source 2048px PNGs remain in the authorized owner's dedicated
`summoner-art-review` working directory, not in production public assets.
The committed WebP derivatives are 768×768, quality 85 and optimized for
mobile. Browser QA and a Sharp decoder test check the actual bytes.

## Art review criteria

**Species continuity:** aqua glass-finned otter with segmented logic-tail,
cream athletic hare with coral tail ribbon, jade deer with dew-leaf antlers.
All stages retain their family silhouette. Stage change adjusts visible
materials, accessories, pose and energy, not ownership or rarity.

**Rendering rules:** full body in frame, legible eyes, centered 3/4 pose,
pastel near-white studio background, no text. The thumbnails are
non-transparent, square 2D raster images and should be displayed with
rounded edges rather than falsely cut out as 3D AR objects.

**UI behavior:** only these three families render original character images;
the other nine families continue using distinct symbolic crests and the
`production-art-pending` label. Every artwork-bearing screen still says
preview only; no new action writes Credits, creature ownership or tickets.
iOS Reduce Motion and Night Mode remain supported.

## Unfinished art production

Next true-modeling tasks: orthographic front/profile/rear turnarounds,
expression sheet, layered original modeling sources, rig and animation,
USDZ/GLB exports, thumbnail reviews at 48px and rights/attribution review.
None of those are certified complete by nine flattened renders.

## Safety & verification

This work is isolated to the iOS **integration** branch. Production `main`,
database migrations, auth, real XP awards, settlement and the free-ticket
PR remain out of scope. Require exact-head lint, tsc, unit, isolated
PostgreSQL regression, browser decode and native iPhone Simulator evidence
before the integration merge.
