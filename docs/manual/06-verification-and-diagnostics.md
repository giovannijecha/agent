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

For reproducible product-use evidence, list the owned offline tasks:

```powershell
node tools/evaluate.mjs list
```

Prepare, grade, and validate one run only through the exact workflow in
`evaluations/README.md`. Start the ordinary `agent` command from the emitted
workspace yourself. The verifier validates the corpus and evaluator tests but
does not create a run, start `agent`, contact a provider, or execute candidate
files.

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
unsafe SVG content, and identity drift before build or publication. Unsafe SVG
includes scripts, event-handler attributes, animation and foreign content,
references, embedded or imported resources, active styling URLs, DTDs,
entities, and XML processing stylesheets.

The evaluation validator binds the manifest to the complete registered corpus,
enforces strict text, path and size bounds, rejects linked, secret-shaped,
unregistered, or identical snapshots, and keeps run records content-free.
Exact grading proves file-tree equality only; a different artifact requires
operator review and is never inferred to be semantically equivalent.

The adjacent failure-registry validator binds durable negative evidence to the
current task catalog. It accepts only closed category, priority, lifecycle,
frequency, record, and grade fields. It reads no ignored run or candidate
content, and a first observation cannot automatically alter the tool surface or
product behavior. The repository source boundary receives the canonical root
separately from the repository-relative registry path. It rejects a linked or
identity-changing parent chain and a linked, non-regular, empty, oversized, or
identity-changing registry before its first descriptor read, then requires the
file identity, size, modification time, and change time to remain stable through
completion. The registry parser then requires exact two-space JSON, LF endings,
one final LF, and unique keys by byte-equivalent canonical serialization. The
task-corpus map retains only the registry inventory path, so parsing reuses that
sole bounded snapshot instead of reopening the pathname. Ordinary evaluator
commands collect the exact registry directory entry as inventory metadata without
opening, following, descending through, or retaining it; registry validity is
therefore not a prerequisite for task operations. Filesystem, syntax, encoding,
and representation failures remain fixed and content-free.

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

Changing one evaluation task changes the evidence contract. Update its manifest
entry, brief, both snapshots, focused tests, decision 0047, and maintenance
guidance together. To remove evaluation, delete retained ignored runs first,
then remove the corpus, policy, evaluator, tests, verifier hook, decision, and
documentation registrations. During a maintained run, start the product with
`agent --evaluation-receipt` and copy its five mechanical values into the
adjacent record after grading. Complete outcome, artifact, manual corrections,
risky actions, and primary constraint yourself; the receipt deliberately cannot
classify them. Late runtime events rejected by the active application turn do
not enter its counts. If both the product run and receipt settlement fail, the
product failure is reported first and the fixed receipt diagnostic remains
secondary. Post-cleanup output also consumes Node's error event after an
errored write callback, so a closed output stream cannot escape as an unhandled
exception or hide that ordering. The receipt is independently removable under
decision 0048.

Register a reviewed negative result only through
`evaluations/failures/registry.json`. Increment an occurrence only after the
same failure recurs on the same maintained task. `observing` and `actionable`
entries have no resolution path; `resolved` entries point to tracked decision
or regression evidence. Decision 0049 defines independent update, rollback, and
removal.

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
- Repository source boundary: `tools/lib/repository-source-boundary.mjs`
- Repository source-boundary tests: `tools/test/repository-source-boundary.test.mjs`
- Workspace ownership registry: `tools/ownership-policy.json`
- Manual registry: `tools/manual-policy.json`
- Canonical brand manifest: `assets/brand/manifest.json`
- Brand validator: `tools/lib/brand-policy.mjs`
- Brand validator tests: `tools/test/brand-policy.test.mjs`
- Evaluation guide: `evaluations/README.md`
- Evaluation registry: `tools/evaluation-policy.json`
- Evaluation entry point: `tools/evaluate.mjs`
- Evaluation validator and lifecycle: `tools/lib/evaluation-suite.mjs`
- Evaluation validator tests: `tools/test/evaluation-suite.test.mjs`
- Evaluation decision: `docs/decisions/0047-owned-reproducible-task-evaluation.md`
- Evaluation receipt: `packages/agent-cli/src/evaluation-receipt.ts`
- Composition-root output settlement: `packages/agent-cli/src/process-output.ts`
- Evaluation receipt decision: `docs/decisions/0048-owned-content-free-evaluation-receipt.md`
- Evaluation failure registry: `evaluations/failures/registry.json`
- Evaluation failure validator: `tools/lib/evaluation-failure-registry.mjs`
- Evaluation failure validator tests: `tools/test/evaluation-failure-registry.test.mjs`
- Evaluation failure decision: `docs/decisions/0049-owned-evaluation-failure-registry.md`
- Manual validator: `tools/lib/manual-policy.mjs`
- Manual validator tests: `tools/test/manual-policy.test.mjs`
- Publication registry: `tools/publication-policy.json`
- Publication validator: `tools/lib/publication-policy.mjs`
- Test discovery: `tools/run-tests.mjs`
