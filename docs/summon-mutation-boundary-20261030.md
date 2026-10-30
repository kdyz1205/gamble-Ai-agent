# Summon browser mutation boundary, 2026-10-30

Base: independently checked production `5a6461c555b1a5b7dd996bdd541879739ec7d728`. Scoped changes are client-side only.

## Reproduced risks and repair

- Two same-tick clicks can bypass a React `busy` state before rendering. A synchronous ref now serializes free-ticket draw and evolution requests.
- Account replacement must unmount the previous mutation component. `PicosAccountScreen` is keyed by the authenticated account ID; old promises cannot update the new UI. A remount does not claim to cancel a server request already accepted.
- A draw response missing a matching profession/specialization is no longer presented as a successful receipt. On ambiguous failure the original request ID is kept for retries, not silently rotated.
- Cleanup marks each old component as unmounted; late responses cannot set local success, mutate visible state, or invoke refresh after it changes owner.

## Isolated browser verification

`node scripts/test-summon-boundary.cjs` builds and mounts the actual React free-draw and evolution components with a small separate React harness. It serves only a loopback fixture and replaces fetch in that isolated page with deferred synthetic responses. It neither hits the production API nor spends tickets or grants creatures.

The assertions cover synchronous duplicated draw clicks, account replacement and stale draw responses, owner-specific request keys, synchronous duplicated evolution clicks, stale evolution results, mismatched profession/occupation receipt rejection, original-key retry, and a correctly scoped successful receipt. This test must pass alongside TypeScript, lint, existing unit/integration tests and the existing application browser suites before deployment.

## Limits

A component test does not replace server authorization, ledger uniqueness, settlement tests, actual native phone testing, or a production end-to-end test with a permitted test account. No database or API route is edited in this patch. Production stays on the preexisting SHA until all gates are green.
