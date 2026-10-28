# SUM journey and proof UX review — 2026-10-28

## Method and scope

Baseline live source: `25fc9ff49b1106446382c03081f870ae872672d5`.
Use fresh, anonymous browser contexts to actually operate public peer-product routes. Do not claim native-app use, paid access, challenge enrollment or a completed signed-in experience. Keep captured URLs/actions/screenshots separate from official documentation and engineering inference. Reference evidence is retained on the authorized machine in `research-os-coordination/SUM_UX_BENCHMARK_20261028_1148`.

## Observed reference flows

| Product | Actually operated | Evidence and boundary | Implication for SUM, not a copied implementation |
|---|---|---|---|
| Duolingo | Get started → Spanish → Continue → attribution question → learning reason; selected an anonymous exploratory choice. | Public welcome pages show a single question, progress indicator, visible back affordance and a disabled Continue until selection. The initial broad back selector hit a backdrop and was not counted. A later verified click of the visible back arrow returned to the earlier attribution step with Continue enabled; both attempts remain in the evidence. No account was created. | Make progress and reversible steps legible. SUM's three-step introduction lacked a Previous control. |
| Habitica | Features → registration → existing-account login → browser Back to registration. | Persistent form labels and distinct sign-up/log-in routes are visible. A cookie overlay partially crowds the 390px screen; this is not a perfect-design endorsement. No form submitted. | Preserve orientation and use persistent field labels. Do not copy dense overlays or assume a placeholder is an accessible label. |
| Strava | Public challenge gallery → Run filter → a challenge link → browser Back. | The selected filter is visibly removable and list cards expose goal/date information. The detail URL returned 403; its signed-in detail/eligibility flow was not exercised or bypassed. | Treat list context as part of the journey and distinguish no matches from an empty service. Official details/eligibility instructions are documentation, not a claim of testing them. |

Primary references:
- https://blog.duolingo.com/add-new-course/
- https://habitica.com/static/features
- https://support.strava.com/en-us/articles/15401916-strava-challenges
- https://nextjs.org/docs/app/getting-started/linking-and-navigating
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html

## Reproduced SUM gaps

Four selected journey regressions failed on the existing deployed components: returning from a filtered discovery result, restoring filters on refresh, recovering from no matches and returning to an earlier introduction step. Two selected proof checks also failed: persistent accessible field labels and a Chinese proof interface that preserves original data. The existing basic header-bounds check passed; visual refinement must not be misreported as a failed assertion.

## Changes and acceptance boundaries

- Store only bounded presentation filters in the discovery URL. This remains filtering of the currently loaded public list, not a claim of full-database search.
- Carry an allowlisted list destination through Quest detail, invitation, evidence and result routes. Highlight the originating navigation section. Returning restores filters and can locate the original public list card; do not persist private records as a navigation cache.
- Normalize return destinations; reject external, protocol-relative, auth/API and nested-loop routes. Drop arbitrary nested callback parameters. These values never authorize a user or affect credits.
- Show no matches with Clear filters, a genuine empty-list state with Create, and read failure with explicit retry. Re-fetch server-authorized data rather than fabricate success.
- Give the introduction Previous and explicit step position, without marking onboarding complete just for going backward.
- Translate known proof interface labels/help/errors at render time. Keep evidence descriptions, original rules, filenames, media selections, unknown server diagnostics and payload values unchanged.
- Provide persistent URL/description labels, format/size guidance before selection, clear not-yet-submitted preview wording, readable focus and night surfaces, and scoped header spacing. Existing upload/capture/session lifecycle guards remain in place.

## Do not overclaim

No changes to API authorization, schema, dependencies, accepted rules, judgment, ledger or settlement. No production account creation, evidence submission or real-money actions. Browser test identities and failure responses are explicitly synthetic. Original isolated-database full business regressions remain required alongside new focused tests.

This review does not prove every peer-app state or every SUM screen is polished. Remaining investigations include unsaved creation drafts when deliberately switching sections, physical-device keyboards and media, weak-network upload recovery, all signed-in journey roles, remaining marketing/legal translations, collection information architecture and consistent 2D/3D art. A passing screenshot is not proof of those workflows.
