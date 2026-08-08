# 06 - Verification and diagnostics

## Purpose

Use this chapter to prove a change is internally consistent and to diagnose the
earliest failed boundary without exposing personal content.

## Operator workflow

Run the complete release gate from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

Use `npm run build` for a focused compiler check and `npm test` only after test
artifacts have been built by the canonical flow. When the CLI stops, start with
its coarse category (`application`, `arbiter`, `frame`, `runtime`, `source`,
`terminal`, or cleanup), then run the focused package tests through the release
gate rather than adding ad hoc logging.

## Guarantees and limits

The gate validates exact toolchain versions, required documents, provider,
manual, and publication policies, package manifests, local-only lock topology,
source hygiene, module boundaries, minimal declarations, generated build
structure, all tests, and a CLI smoke session. It cleans and rebuilds derived
output from owned inputs. Verification is offline and never contacts a provider.

## Failure behavior

The gate stops at the first structural error and returns nonzero. Build and test
failures remain visible through their owning tool. Product errors deliberately
retain stable kinds rather than raw foreign causes, submitted text, file
contents, credentials, or tool output. Do not weaken a verifier rule merely to
make a failing change pass; either satisfy the contract or replace the contract
through an accepted decision.

## Maintenance and removal

Every lasting toolchain or trust-gate change needs a decision, regression tests,
documentation, and rollback path. Keep validators pure where practical and
their operational wiring in `tools/verify.mjs`. Remove a policy only after all
product and documentation surfaces it protects have been removed or replaced.

## Evidence

- Release entry point: `tools/verify.ps1`
- Owned verifier: `tools/verify.mjs`
- Workspace ownership registry: `tools/ownership-policy.json`
- Manual registry: `tools/manual-policy.json`
- Publication registry: `tools/publication-policy.json`
- Publication validator: `tools/lib/publication-policy.mjs`
- Test discovery: `tools/run-tests.mjs`
