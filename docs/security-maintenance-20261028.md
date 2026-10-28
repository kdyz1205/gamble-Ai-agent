# Dependency and client ownership maintenance — 2026-10-28

## Baseline

Live source reviewed: `f2294339edcf08ff2b36751751671401ce1b57f3`.
The npm advisory service reported 37 affected package entries (6 critical, 21 high, 8 moderate, 2 low), or 30 with development dependencies omitted. These are dependency findings, not proof of 37 exploitable application vulnerabilities or evidence of compromise.

## Reviewed fixes

- Pin Next.js and eslint-config-next to 16.4.3. Review: https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw (patched 16.4.1). The current package-lock also updates compatible transitive dependencies instead of using audit's proposed forced downgrades.
- Pin sharp to 0.35.5, including the fixed native image library bundle: https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w . Test PNG/WebP/benign SVG handling with the installed binary.
- Pin NextAuth v4 to 4.24.15 and the Prisma adapter to 2.11.3; resolve @auth/core to 0.41.3: https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279 . The v4 package has an optional peer pinned to an older @auth/core; this app uses only Google and credentials, not WebAuthn. The override must pass real credentials, provisioning, identity and provider-handoff regression tests. It does not authorize email-based account merging.
- Align Capacitor core, CLI, iOS and the native Swift dependency to 8.5.3. An npm update alone would leave the native Swift framework unpatched. Review: https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv . Require native compilation and simulator verification, not just browser tests.
- Pin the Anthropic SDK to the minimum fixed 0.91.1 line, not an unnecessary 1.x migration; do not call a paid model as part of the dependency smoke test.
- Align Prisma CLI, client and PostgreSQL adapter at 7.10.1; retain the existing schema and migrations. CI migrates only the disposable local verification database. The production build remains migration-free.
- Remove unused @x402/core, @x402/evm and @x402/next dependencies after verifying no application or script imports. Do not force their zod 3 dependency to incompatible zod 4. Preserve existing viem/internal-credit code and do not enable payment functionality.
- Override only xcode's uuid dependency to CommonJS-compatible 11.1.1. Validate actual project parsing, generation of 64 unique Xcode IDs, and write/reparse preservation of the native target. Do not downgrade Capacitor to make an audit counter disappear.

## Client state boundaries

Private Quest, own-Quest list, credit, evidence-gallery and collection snapshots are rendered only for their current request owner. Account changes invalidate prior authorized data and trigger an appropriately authorized fresh read. A delayed response from a previous owner must not restore the data.

Evidence editing is scoped to the account and Quest. A single synchronous save owner prevents two same-tick clicks from sending two requests. Pending fields are protected against edits that would disappear on success. Success requires an evidence ID matching the current account and Quest; HTTP 2xx alone does not prove persistence. Stale media-upload continuations cannot initiate a later proof submission after their owner is unmounted.

These client protections complement, not replace, server authorization. No API, schema, settlement, ledger or production data changes are made here.

## Verification and limits

Keep the original full CI and isolated-database workflows, plus the new dependency policy/runtime checks and session-proof browser regressions. The client boundary regression identities and responses are explicit synthetic fixtures; they do not represent real production user activity. Actual business regressions run against the isolated verification database.

A zero npm audit report means no findings in the registry response for this exact lockfile at that time. It is not a complete security assessment. Physical-device media/keyboard behavior, final real Google OAuth callback, signed TestFlight export and remaining design/localization work are independent acceptance areas.
