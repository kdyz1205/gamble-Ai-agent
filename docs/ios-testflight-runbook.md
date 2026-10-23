# SUM iOS — complete beta testing and release gates

Updated: 2026-10-23. A successful web preview, an unsigned iOS archive, and a signed TestFlight build are **three different deliverables**.

## Source and web environment

- Working beta source: PR #21, fix/summoner-ios-release-readiness-20261023.
- Browser test URL: https://stubborn-git-fix-summoner-ios-release-6cd2de-kdyz1205s-projects.vercel.app/app
- Production domain https://summoner.world/app still requires a separately reviewed production deployment. Never silently send signed production builds to an HTTP 404 URL.
- The existing Capacitor server.url loads remote Next.js content. Capacitor documents this as intended for development live reload, not as the final production architecture. The UX includes genuine UI routes and server APIs but native packaging needs review under Apple Guideline 4.2.

## Automated release checks

1. Vercel preview must be Ready on the exact source commit, with HTTPS /app and /app/today returning HTTP 200.
2. The GitHub CI job must pass migration validation on a disposable database, lint, TypeScript, unit, integration, production build and independent browser lifecycle tests.
3. scripts/test-vercel-ignore.cjs rejects a source-upload ignore pattern that removes src/components/ios/IOSFullApp.tsx.
4. scripts/test-ios-xcodeproj-integrity.cjs enforces unique .pbxproj object identifiers. It reproduces and detects the earlier PrivacyInfo / XCBuildConfiguration duplicate-id failure.
5. On pull requests, .github/workflows/ios-release.yml runs Capacitor sync, doctor, real macOS xcodebuild for unsigned Release, app bundle checks and uploads a time-limited unsigned xcarchive. Unsigned means **not installable as a normal signed app**.
6. Full browser QA (scripts/qa-ios-full-app.cjs) covers all 16 app routes at 320, 390, 768 and 1440px, onboarding, tab navigation, safe empty states, composer, settings and scroll.

## Signed TestFlight beta — manual workflow dispatch only

- The signed job is disabled for PRs. It can be dispatched only when the workflow is registered from the default GitHub branch and the authorized Apple organization has provided the required credentials.
- Workflow choices: app_target=preview and preview_url=https://stubborn-git-...-kdyz1205s-projects.vercel.app/app; or app_target=production pointing strictly to https://summoner.world/app.
- scripts/ios-verify-target.cjs rejects arbitrary hosts, HTTP, unknown paths and credential-bearing URLs. In preview mode the build automatically adds the exact authorized Vercel hostname to the native app-bound domain list, and Capacitor embeds that target URL. A production build never accepts a Vercel preview host.
- Before signing, CI checks the chosen app URL can be fetched successfully.
- Apple credential secret names: APP_STORE_CONNECT_API_KEY_BASE64, APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID and APPLE_TEAM_ID. The authorized Apple team must control these. Do not store private keys or passwords in source, artifacts, logs or chat.
- Signed distribution requires Xcode 26 or later, a bundle identifier registered in App Store Connect, and suitable signing permissions. Successful archive and IPA export lead to xcrun altool upload to App Store Connect for TestFlight processing, not automatic public App Store release.
- Apple processing and TestFlight tester invitations are separate external steps. Do not claim upload, processing, TestFlight install or approval without actual App Store Connect evidence.

## Actual iPhone acceptance criteria

- Launch and onboarding: first install, three unique onboarding screens, return user session, relaunch, version upgrade, airplane mode / offline view / reconnection.
- Navigation and accessibility: all five tabs, screen reader labels, safe areas, touch scroll, VoiceOver, large text, keyboard resize and dismissal, deep links and back behavior.
- Real functionality: signed-in user sees only authorized Quests, balance and proof; default stake 0; guarded publish and friend consent; photo/video/text evidence permissions and upload failures; server-approved result, refund and credit reconciliation.
- Privacy: report and block user flow, account changes, storage isolation, privacy/terms/support links, unimplemented push notifications honestly marked as unavailable.
- Final audit: build ID, version, signed team, SHA, IPA artifact, exact server build SHA, TestFlight processing/build ID and tester installation. No public release before review.

## Known external dependencies

- GitHub Actions repository secrets for the authorized Apple Developer team are not confirmed; signed builds cannot be treated as available.
- Public site /app is not yet deployed.
- User-facing iOS native app still uses remote WebView content; further native behavior/offline hardening and Apple review are required.
