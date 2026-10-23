# SUM Storybook — iOS + responsive-web screen acceptance

## Source of truth
- The Capacitor app in `capacitor.config.ts` loads `https://summoner.world` at runtime. The source of each in-app view is the corresponding Next.js route.
- The native `ios-shell/index.html` is the branded loading/network fallback, **not** an independent application workflow.
- This effort is a **presentational redesign**. It does not change authentication, proof attribution, credits, verdict, settlement or database contracts.
- All real records remain data-driven. Illustration cards are explicitly creative quest seeds; no fabricated participants, location, approved evidence or performance metrics.

## Shared visual system
- `src/components/familiar/PicoFamiliar.tsx`: one recognizable Pico silhouette in listening, thinking, reviewing, waiting and celebrating states.
- `src/components/universe/StorybookWorldArt.tsx`: original fantasy illustration for the main portal and the three quest seed realms.
- `src/app/sum-storybook.css`: web/iOS design tokens, layout, tap targets, mobile safe-area handling, and reduced-motion fallbacks.
- `src/components/QuestAppNav.tsx`: consistent mobile destination bar (World, Explore, Create, Familiars, Me); existing scene navigation entrypoint retained for older route contracts.
- `ios-shell/index.html`: offline/launch fallback with matching Pico, reconnect link, and nondeceptive status copy; `cap copy ios` copies it into the native iOS public folder.
- `scripts/generate-sum-storybook-icons.cjs`: deterministic Web/PWA 192/512, iOS 1024, Apple touch 180 icons.
- `scripts/generate-sum-storybook-splash.cjs`: three deterministic opaque 2732px Apple launch-screen assets (all idiom scales), replacing the old generic white-and-blue splash.

## Page inventory and coverage
| Route / view | User-facing job | Visual scope | Dynamic-contract limitations |
|---|---|---|---|
| `/enter` | Enter the SUM world | Storybook portal, big Pico, illustrated realm cards, iOS dock | Quest actions stay real navigation |
| `/summons` | Compose and publish | Familiar, softer form panels, task prompts, live-draft visual | Publish, parse, credits untouched |
| `/contracts/bind` | Review a pact | Shared cards, pastel theme, bottom navigation | Consent/state unchanged |
| `/duel/demo` | See proof example | Illustrated evidence chapter, cohesive typography | Illustrative only |
| `/judgment/demo` | See example result | Chronicle skin, expressive Familiar | Illustrative only |
| `/rituals` | Meet Pico | Single coherent character and pastel sanctuary | Role controls unchanged |
| `/markets` | Discover quests | New guest treatment, list card palette, bottom navigation | Real queries / matching unchanged |
| `/me` | Account + my quests | Guest treatment, credit/list palette, bottom navigation | Actual balances unchanged |
| `/market/[id]` | Live quest detail | Shared route tint, status cards, safe-area nav | Real records only |
| `/join/[id]` | Accept a shared quest | Reused quest-world styling / nav | Acceptance guarded by API |
| `/challenge/[id]` | Challenge room | Shared quest-world styling / nav | Requires existing challenge record |
| `/challenge/[id]/versus` | Challenge opponent | Global tokens and app dock | Requires real challenge ID |
| `/reviews` | Review proof | Calm, legible reviewer cards | Reviewer permissions unchanged |
| `/calculator` | Financial scenario tool | Global app background / dock | Internal scenario values are not real product records |
| `/profile` | Legacy profile redirect | Route behavior retained | Redirects to /me |
| `/privacy`, `/terms`, `/support` | Policy / help | Global brand tokens / safe-area dock | Content unchanged |
| `/` | Default entry | Redirects to /enter | Redirect retained |
| Capacitor offline view | No connectivity/launch fallback | Custom branded Pico and retry CTA | No claim of working offline |

## Release gates

### Automatic checks
1. `node scripts/qa-sum-storybook.cjs`: page loads and no horizontal overflow at 320, 390, 768, 1440 widths; exactly one bottom nav on applicable routes; editor selection/seed prefill; icon and splash sizes; native iOS shell byte-equality after `npx cap copy ios`.
2. `node scripts/qa-sum-award-v4.cjs`: read-only cross-flow visual regression, critical accessible controls, keyboard path, evidence/receipt illustration truthfulness.
3. `npm run lint`, `tsc --noEmit`, `npm run test:production:unit`, `npm run test:production:integration`, `next build` in GitHub CI.

### Still requires Apple-side verification
- Actual WKWebView/safe-area and touch/keyboard on iOS devices, signed Xcode archive and App Store Connect screenshot/binary upload. A Windows/browser screenshot or Vercel preview is **not** native iOS acceptance.
- Apple App Review may evaluate the remotely hosted Capacitor architecture under its minimum functionality and content rules.
- Sign-in, public/user-specific quests, UGC reporting, blocking, and accessibility should be exercised with authorized test accounts in TestFlight before publishing.

## Rollout safety
- This branch is a preview-only artifact; never directly promote to production without merging and testing the separate functional reliability branch.
- No Demo or real orders, money transfer, credit mutation, proof submission, or settlement performed during visual QA.
