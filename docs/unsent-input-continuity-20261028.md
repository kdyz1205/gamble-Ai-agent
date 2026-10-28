# Unsent input continuity — 2026-10-28

## Reproduced issue

Baseline `366df0a9acb04f7c0572a08c96c44633e36b0ad9`: opening `/app/create`, entering a first challenge message and selecting manual terms, then navigating Discover → Create resets both. Two browser cases reproduced this before the patch. The baseline is the recording-validation release; this change does not edit its media pipeline.

## Narrow implementation and privacy boundary

A root-provider-owned memory stores only the not-yet-reviewed first message, selected stake text, opponent mode, proof window and selected starter. It survives client-side section navigation in the same document. It is not a module-global singleton, localStorage/sessionStorage entry, server draft, account balance, accepted rule or publication receipt. Full reload/closing discards it and the restoration notice says so.

The existing composer owner generation policy applies: a known account leaving clears its input, including A → B → A while the editor is not mounted. Guest → intentional login and same-owner refresh preserve local work. A stale editor lease cannot repopulate another owner's memory. Separate tabs/root instances are independent.

The one-use OAuth return checkpoint remains separate and takes precedence, unless the user already typed or changed terms while authentication was pending. User input is not translated. Storage denial does not disable memory recovery. A blank/default editor removes the remembered input.

At explicit submission the remembered input is cleared synchronously, before any transport. An in-flight or already-reviewed turn must not reappear as a new unsent challenge or be automatically replayed. A failed first request can be restored for an explicit retry after the existing handler returns, not automatically resent. Reviewed conversations, publish retry keys, media, credentials, completed results and active requests are deliberately not cached here.

## Verification gates

- `scripts/test-composer-input-memory.ts`: 36 pure checks for exact text, ownership changes, rejected stale leases, bounded records, extra-field exclusion and independent instances.
- `tests/e2e-gambles/composer-input-continuity.spec.ts`: 16 deployed-component browser scenarios: section return, browser Back, deletion, identity changes away from editor, logout, guest login, tabs, blocked Web Storage, reload boundary, Chinese UI, failed/successful/pending requests, terms-only input, OAuth priority and late-auth typing.
- All existing full CI, real isolated PostgreSQL business regressions, media/session tests and iPhone simulator gates remain. Browser synthetic identities/routes are explicit; no real production user or business write is used to demonstrate recovery.
- Release uses a clean frozen commit, exact CI tree comparison, candidate gates and post-activation browser/HTTP checks. No pass is claimed merely because code compiles.

## Reference rationale

React state is tied to the mounted component position; keeping ephemeral input above the route avoids treating remounting as a save mechanism. This does not enable Next.js cache components globally or retain hidden media streams.

Primary documentation consulted:
- https://react.dev/learn/preserving-and-resetting-state
- https://nextjs.org/docs/app/guides/preserving-ui-state
- https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage

## Remaining scope

This patch fixes first-message input/terms across client navigation, not a complete persisted AI conversation. Returning to a reviewed conversation, restoring after reload/closing, cross-device drafts, and in-flight business reconciliation need their own state/consent design. The UI must not describe this as a cloud-saved draft. No API, database schema, dependencies, identity/auth backend, credit ledger, referee or settlement behavior changes.
