# SUM iOS App — Full Screen Implementation Matrix
Date: October 22, 2026
Reference: user-provided 20-part iOS design collage (Splash, 3 Onboardings, Home, Quest Setup/Created, Today, Quest Detail, Add Evidence, Quest Complete, Discover, Picos, Profile, Achievements, Evidence Gallery, Stats, Community, Settings, App Icon).

## Product boundary
This is a **whole-app navigation, UI and existing-API integration** effort, not a landing page. The marketing page remains at `/enter`; the Capacitor shell is configured to open `/app` after the new routes are deployed to the same backend. The existing Quest lifecycle and financial/consent authority are deliberately unchanged. A browser preview is not equivalent to a signed iOS build or App Store approval.

## Screenshot-to-implementation (all images from the same 3D Pico / pastel art set)

| Reference screen | Implementation | Real behavior and status |
|---|---|---|
| 1. Splash | `/app/splash` and native iOS splash | Branded launch scene and working next link; native assets already exist |
| 2. Onboarding 1 | `/app/onboarding`, step 1 | Real Next/Skip controls |
| 3. Onboarding 2 | `/app/onboarding`, step 2 | Distinct art, real Next control |
| 4. Onboarding 3 | `/app/onboarding`, step 3 | Saves first-run completion on-device, opens Today |
| 5. Home | `/app/today` | Real user's active Quest dashboard and Move/Create/Grow entry links |
| 6. Quest Setup | `/app/create` | Embeds **existing guarded PactComposer**, with real AI draft and publish flow, rather than a disconnected dummy form |
| 7. Quest Created | `/app/quest-created?id=REAL_ID` | Loads actual persisted Quest; fail-closed without an ID |
| 8. Today | `/app/today` | Real Quest counts plus an on-device daily ritual creator/checklist with reversible, persisted check-ins; distinct from verified Quest proof |
| 9. Quest Detail | `/app/quest?id=REAL_ID` | Actual persisted rules, status, deadlines, players and guarded invitation |
| 10. Add Evidence | `/app/evidence-add?id=REAL_ID` | Written proof for text/self-report policy uses actual submission API; media policies link the already protected upload flow `/challenge/REAL_ID/versus` |
| 11. Quest Complete | `/app/quest-complete?id=REAL_ID` | Only a backend `settled` Quest receives a finished receipt; pending/disputed/unknown cannot appear complete |
| 12. Discover | `/app/discover` | Real open public Quests from `/api/challenges`, local search/filter, real join links |
| 13. Picos | `/app/picos` | Three interactive Pico roles (Guide, Clarify, Review), actual Quest composer link; no fake unlock inventory |
| 14. Profile | `/app/profile` | Authenticated user and actual Quest/credit counts; real account links |
| 15. Achievements | `/app/achievements` | Real Quest and private evidence milestones; 7-day streak derives only from actual on-device check-ins |
| 16. Evidence Gallery | `/app/evidence` | Private approved proof via detail API, real media/description where returned, no public leaked URLs |
| 17. Stats | `/app/stats` | Week chart and Quest metrics from real records plus a separately identified on-device daily check-in count and streak |
| 18. Community | `/app/community` | Public read-only `/api/feed` timeline, with actual Quest links |
| 19. Settings | `/app/settings` | Device-local theme and reduce-motion preferences, working privacy/terms/support links, sign-out |
| 20. App Icons | `ios/App/App/Assets.xcassets` + web icons | Actual 3D Pico artwork, sized for iOS/PWA |

## Truthfulness and blockers
- On-device daily rituals and streak counting now work without fabricated history, but do **not** sync between devices, consume/award credits or constitute Quest proof. Cloud-backed daily tracking is not implemented.
- Not implemented on the server: push notifications, persistent social comments/likes, arbitrary user-created posts, collectable Pico inventory. UI must say so, never render fake counts/users or nonfunctional interactive controls.
- Private proof is read only through the already authorization-checked challenge detail, never public feed. Submitted proof is restricted by status, deadline, player identity and evidence policy.
- Credit balances only come from `/api/tokens`; an absent or unauthorized balance shows unknown, never a fabricated 0.
- Published Quest links come from real backend state. Neither `quest-created` nor `quest-complete` manufactures a receipt without an existing ID.
- Existing `codex/ai-cost-and-lifecycle-reliability` backend branch still has divergent UI contracts. Integrate those deliberately, **do not force-merge/overwrite**.
- On Windows, Xcode signing, TestFlight WKWebView and App Store Connect upload have not been performed. Native app must be verified from a macOS Apple build after the production `/app` route exists.

## Reproducible actual-screen gallery (October 23, 2026)
- CI runs `scripts/qa-ios-full-app.cjs` against the built server at a 390px mobile viewport and validates both 390px and desktop pages. It verifies three distinct onboarding illustrations and on-screen primary actions at 375x667.
- After all browser checks pass, `scripts/build-ios-visual-gallery.cjs` creates `output/ios-full-app/SUM_iOS_20_Actual_Reference_Panels.jpg`, `SUM_iOS_20_Screen_Gallery.html`, and a SHA256 manifest. These are included in the `browser-flow-evidence` GitHub Actions artifact for the exact commit.
- Panel 08 Today is deliberately a second reference to the **same implemented route** as 05 Home (`/app/today`). Panels 07/09/10/11 show truthful "no Quest ID" states in read-only CI, not fabricated successful creation/proof/settlement. Guest-only pages display their real sign-in/empty states.
- Panel 20 is the actual native Xcode `AppIcon-512@2x.png` asset, **not a rendered in-app screen**. The `iOS Native Verification and Export` workflow separately archives the unsigned iOS app and boots/installs/launches it in an actual iPhone Simulator; it resolves the current PR's Ready preview rather than using a stale hardcoded URL.
- To reproduce the gallery locally after captured screenshots are present: `node scripts/build-ios-visual-gallery.cjs`. To verify fail-closed fixture and manifest behavior: `node scripts/test-ios-visual-gallery.cjs`.
- All screenshots are actual running UI evidence. They do not establish that a signed TestFlight build, App Store approval, user authentication on a physical iPhone, or a fully settled real-money flow has been verified.

## Acceptance
- `node scripts/qa-ios-full-app.cjs`: all route screens HTTP 200, semantic content, app-specific five-tab navigation, no duplicate landing nav, no sideways overflow, no uncaught errors, dynamic onboarding state, real composer, persisted local preferences, fail-closed result and wheel scrolling.
- `npm run lint`, `tsc --noEmit`, `npm run test:production:unit`, `npm run test:production:integration`, `next build` via isolated CI.
- `npx cap copy ios` after changing launch URL and native fallback. Verify actual native bundle and asset hashes before signing.
- Deploy preview under exact commit, run read-only browser QA on preview, and separately reconcile with current reliable backend before any production activation.
