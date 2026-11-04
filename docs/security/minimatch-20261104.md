# Tooling audit review — 2026-11-04

## Actual release blocker
The unchanged production lockfile began failing the full npm audit gate after new
advisories were published. No application/backend dependency is being upgraded for
this review. All affected installed nodes are marked development-only in the lock.

## Remediation
Pin development-tooling glob to 14.0.2 and minimatch >=7 consumers to 11.0.1.
These are the upstream fixes for GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249.
Do not force npm's suggested ESLint downgrade or replace the legacy callable API
with a modern major version. Full lint, typecheck, build and integration checks
remain mandatory.

## Narrow source-based non-applicability decision
The advisory database reports minimatch <11.0.1. The publisher describes modern
firstPhasePreProcess/secondPhasePreProcess amplification at optimizationLevel >=2.
The installed npm minimatch 3.1.5 source does not contain these functions or option.
Its minimatch.js SHA256 is
746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d.
The archive integrity in package-lock.json is checked byte-for-byte by the audit
script. A finite source-behavior check also verifies that the optimizer option
has no effect on three small legacy patterns. That sample is not a general proof
that every pattern is denial-of-service safe.

This is a local, source-specific non-applicability assessment, not an upstream
withdrawal: GitHub's applicability discussion remains open. The raw npm findings
must be retained and must never be described as zero raw findings.

The release gate allows only this advisory on this exact hashed 3.1.5 source,
and only development nodes whose audit graph reaches that reviewed leaf. It
rejects changed source/integrity/version, runtime dependencies, a different
advisory, elevated severity, audit/registry errors, and review expiry.
The review expires on 2026-11-18 UTC. No network or audit failure is ignored.
A separate production-only npm audit must report zero findings.

## Sources
- https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249
- https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4
- https://github.com/github/advisory-database/issues/10811
- Original npm archives and the existing production lockfile integrity records.

## Evidence
CI retains dependency-audit.json (unfiltered), production-dependency-audit.json,
and dependency-audit-review.json (decision, source hash, expiry, lock hash).
The audit policy has negative tests. Application schemas, API contracts, auth,
judgment and ledger source are not changed. This review does not grant new roles
or move user credits or funds.
