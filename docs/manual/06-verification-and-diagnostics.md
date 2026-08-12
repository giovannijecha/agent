# 06 - Verification and diagnostics

## Purpose

Use this chapter to prove a change is internally consistent and to diagnose the
earliest failed boundary without exposing personal content.

## Operator workflow

Run the complete release gate from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

On Linux, run the matching owned entry point:

```bash
bash tools/verify.sh
```

Pull requests and pushes to `main` run owned `verify-windows` and `verify-linux`
GitHub jobs. Each checks out the exact event revision without importing a
checkout action, provisions the registered external npm and TypeScript
toolchain, verifies external Clang, and invokes the same command above. Linux
uses an owned CI-only bootstrap to delegate a disposable cgroup, including its
common-parent migration permission, and temporarily open Ubuntu's AppArmor gate
for unprivileged user namespaces; the broker and tests remain unprivileged, and
cleanup restores the gate. Inspect both jobs when a protected merge is blocked.

Use `npm run build` for a focused compiler check and `npm test` only after test
artifacts have been built by the canonical flow. When the CLI stops, start with
its coarse category (`application`, `arbiter`, `frame`, `runtime`, `source`,
`terminal`, or cleanup), then run the focused package tests through the release
gate rather than adding ad hoc logging.

## Guarantees and limits

The gate validates exact toolchain versions, the native compiler floor, the
two-platform remote workflow contract,
required documents, provider, manual, and publication policies, package
manifests, local-only lock topology, source hygiene, module boundaries, minimal
declarations, generated build structure, all tests, and a CLI smoke session. It
cleans and rebuilds derived output from owned inputs. Verification is offline and
never contacts a provider. Remote checkout and approved toolchain provisioning
finish before that offline gate begins.

The brand validator rejects unregistered files, digest or dimension drift,
unsafe SVG content, and identity drift before build or publication.

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
Before removing CI, remove its required GitHub status check so `main` remains
repairable.

## Evidence

- Release entry point: `tools/verify.ps1`
- Linux release entry point: `tools/verify.sh`
- Remote workflow: `.github/workflows/verify.yml`
- CI registry: `tools/ci-policy.json`
- CI validator: `tools/lib/ci-policy.mjs`
- CI validator tests: `tools/test/ci-policy.test.mjs`
- CI decision: `docs/decisions/0012-owned-continuous-verification.md`
- Native proof decision: `docs/decisions/0016-owned-native-process-containment.md`
- Native build driver: `tools/build-native.mjs`
- Native broker entry point: `packages/agent-cli/native/process-broker/main.c`
- Native protocol implementation: `packages/agent-cli/native/process-broker/protocol.c`
- Windows containment backend: `packages/agent-cli/native/process-broker/backend-windows.c`
- Linux containment backend: `packages/agent-cli/native/process-broker/backend-linux.c`
- Native adversarial fixture: `packages/agent-cli/native/process-broker/test-fixture.c`
- Native proof controller: `tools/lib/native-process-broker.mjs`
- Linux containment bootstrap: `tools/prepare-linux-containment.sh`
- Owned verifier: `tools/verify.mjs`
- Workspace ownership registry: `tools/ownership-policy.json`
- Manual registry: `tools/manual-policy.json`
- Canonical brand manifest: `assets/brand/manifest.json`
- Brand validator: `tools/lib/brand-policy.mjs`
- Brand validator tests: `tools/test/brand-policy.test.mjs`
- Manual validator: `tools/lib/manual-policy.mjs`
- Manual validator tests: `tools/test/manual-policy.test.mjs`
- Publication registry: `tools/publication-policy.json`
- Publication validator: `tools/lib/publication-policy.mjs`
- Test discovery: `tools/run-tests.mjs`
