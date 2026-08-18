# Maintenance

## Scope

This document is the maintainer runbook. It explains where an owned subsystem
is registered, how to change it, how to diagnose failure, and how to roll it
back or remove it.

Use [architecture](ARCHITECTURE.md) for the current system shape,
[engineering](ENGINEERING.md) for evidence requirements, and the
[operator manual](manual/README.md) for visible behavior.

## Canonical registries

Start maintenance from the owning registry rather than from generated output.

| Domain | Canonical source |
| --- | --- |
| workspace packages, dependencies, built-ins, and declarations | `package.json`, package manifests, TypeScript configs, `tools/ownership-policy.json` |
| accepted architecture and protocol rationale | `docs/decisions/README.md` |
| documentation routes and required structure | `tools/documentation-policy.json` |
| operator-manual chapters and coverage | `tools/manual-policy.json` |
| provider admission and direct origins | `tools/provider-policy.json` |
| publication metadata | `tools/publication-policy.json` |
| task corpus and metrics | `tools/evaluation-policy.json` |
| maintained evaluation failures | `evaluations/failures/registry.json` |
| clean-room inspection evidence | `tools/ownership-policy.json`, [docs/OWNERSHIP.md](OWNERSHIP.md) |
| brand assets and digests | `assets/brand/manifest.json` |
| native source and build registration | `packages/agent-cli/native/`, `tools/build-native.mjs` |

Policy JSON is executable source. Change its validator and acceptance/rejection
tests in the same commit.

## Standard runbook

Use this sequence for every maintained subsystem:

1. **Identify the owner.** Locate the package, registry, living document, and
   accepted decision.
2. **Capture the baseline.** Run the narrowest relevant test and record the
   first failing boundary.
3. **Record durable change.** Add a decision first when authority, protocol,
   provider, tool, toolchain, or lifecycle changes.
4. **Change owned source.** Keep the patch inside one authority domain and
   remove any superseded path.
5. **Update evidence.** Add the regression or contract test and update the
   relevant policy registry.
6. **Update documentation.** Change the operator manual, architecture,
   engineering standard, or this runbook only where each is authoritative.
7. **Run focused checks.** Prove the changed contract before running the full
   gate.
8. **Run the canonical verifier.** Use the platform command from
   [engineering](ENGINEERING.md#verification).
9. **Inspect removal and rollback.** Confirm the old route is gone and the new
   route can be reverted without hand-editing derived output.

Never diagnose from `dist/` or `.test-dist/`. Rebuild from source.

## Diagnosis and rollback

Diagnose the first boundary that rejected the operation:

| Symptom | First checks |
| --- | --- |
| ownership or import failure | workspace manifest, public `src/index.ts`, ownership policy |
| documentation failure | documentation/manual policy, exact path, heading, route, or decision metadata |
| model turn failure | selected process-memory provider/model, request construction, transport settlement, closed failure family |
| invalid tool call | advertised schema, full batch validation, identity, planner result |
| permission wait | exact tool policy, turn-and-call identity, selection settlement |
| stale mutation | observed identity/content, planned effect, native committer result |
| process cleanup failure | fixed shell policy, native containment broker, operation and post-kill deadlines |
| terminal frame failure | serialized arbiter, renderer obligation, cleanup path, stale event |
| native-platform failure | compiler output, broker contract, unsupported primitive, platform-focused tests |

Rollback means restoring the previous owned source, policy, documentation, and
tests together. Do not:

- edit generated JavaScript or native binaries;
- keep two authorities behind a compatibility branch;
- add a silent fallback to conceal the failure;
- reconstruct credentials, transcripts, or lost evaluation receipts;
- weaken a fail-closed boundary to make a test green.

If a published change must be reversed, use a normal reviewed revert or forward
fix. Re-run the full release gate before republishing.

## Subsystem runbooks

### Packages and toolchain

**Owners:** root and package `package.json` files, project-reference
`tsconfig.json` files, `types/`, `tools/ownership-policy.json`, and the
build scripts.

To change a package:

1. update its manifest, public barrel, and exact local edges;
2. update project references and the ownership policy;
3. keep all non-CLI packages Node-free;
4. add boundary tests and run build, tests, and ownership verification.

To add a package, establish a distinct current responsibility and decision
first. To remove one, move or delete its authority, remove every manifest edge,
project reference, policy registration, test, and document route in one change.

Toolchain upgrades update the root engine/version contract, external compiler
expectations, declarations, both platform verifiers, and accepted decision.
Do not use a loader or downloaded package as a temporary bridge.

### Streaming runtime

**Owners:** `packages/agent-runtime`, its public port contracts, runtime tests,
and the accepted runtime decisions.

For a runtime change:

1. define event, bound, cancellation, checkpoint, and settlement behavior in a
   pure runtime contract;
2. preserve one active decision loop, serial effects, and only the registered
   two-to-four-call independent read cohort;
3. add tests for overflow, cancellation, late events, failed continuation, and
   retained tool truth;
4. update the provider adapter only through the model port;
5. update CLI composition after the library contract passes.

Rollback by reverting the port and CLI composition together. Removal requires a
replacement owner for bounded turns and acknowledged conversation checkpoints;
the CLI must not absorb a second private runtime.

### Conversation tree

**Owners:** `packages/agent-core/src/conversation-tree.ts`, runtime settlement
and selection, CLI `ChatState`, `/timeline`, its generic selection projection,
and decision 0075.

For a conversation-tree change:

1. change node shape, parent rules, settlement class, bounds, and path
   materialization first in core;
2. keep the runtime tree authoritative and allow selection only while idle;
3. preserve completed and checkpointed node truth without replaying tools;
4. update the CLI mirror only after a runtime selection or commit succeeds;
5. prove siblings remain retained, only the selected path reaches the model,
   rejected selection is inert, and cleanup releases all process-memory state.
6. prove append snapshots use bounded indexed access, the full retained
   timeline remains reachable through its moving window, and display-only
   markers cannot reject an authoritative commit.

Rollback removes `/timeline` and its projection first, restores a linear CLI
transcript, then replaces the runtime tree with the selected linear path.
Removal deletes the command, session route, display projection, runtime port,
core type, tests, manual text, and decision registration together. Never add
persistence, compaction, replay, branch deletion, or import/export as part of a
tree maintenance change; each requires a separate accepted design.

### Tool engine

**Owners:** `packages/agent-tools`, CLI planners and handlers, the six-tool
registry, native committers, and decisions 0074, 0073, 0050, and 0054.

For a tool change:

1. change one capability domain at a time;
2. update schema, risk, batch validation, planner, permission, handler, and
   presentation contracts as applicable;
3. prove invalid input fails before planning or permission;
4. prove stale state fails before mutation;
5. keep effects sequential and one permission decision per planned call; only
   an explicitly registered independent read may enter the bounded cohort;
6. remove any replaced name and alias immediately.

The exact inventory is `read_file`, `list_directory`, `search_text`,
`apply_patch`, `manage_path`, and `shell`. A new tool or shell-policy change
requires an accepted decision and current evaluation evidence.

To change read overlap, update registration validation, the four-call runtime
bound, ordered permission and lifecycle events, complete-settlement
cancellation, deterministic checkpoint reduction, instructions, privacy and
security text, and tool/runtime/CLI contract tests together. Roll back by
restoring the one-call instruction, removing all `independentRead`
registrations, and deleting the cohort scheduler only after every batch uses
the serial path.

To change shell execution, update its fixed platform executable and arguments,
controlled environment projection, descriptor, approval fields, broker
protocol, native environment construction, manual, privacy and security text,
and Windows/Linux contract tests together. Never inherit the complete parent
environment, expose a provider credential, load a profile, or retain a target
after settlement.

Removal deletes advertisement, schema, planner, handler, permission entry,
presentation mapping, tests, declarations, manual text, and decision status in
one change.

To roll back patch convergence, restore both previous descriptors and their
planners before removing `apply_patch`, then switch the advertised registry in
the same change. Never advertise either old tool beside `apply_patch`. To remove
all mutation authority instead, remove `apply_patch` from the registry and
manual inventory before deleting its committer and native protocol.

To remove namespace mutation, remove `manage_path` advertisement and manual
inventory before deleting its planner, preview, committer, protocol, native
sources, focused tests, decision, and policy entries.

If the complete inventory is retired, replace manual-policy schema 10 with a
schema that removes the advertised tool inventory; do not leave an empty or
stale registry behind.

To roll back shell execution, atomically restore the superseded `run_process`
descriptor and closed Node registry together with protocol v1 and its tests.
Never advertise both execute tools.

### Session tool permissions

**Owners:** CLI session state, `/permissions`, runtime request identity, and
the generic TUI `SelectionList`.

The policy is process-only and closed to `Allow`, `Ask`, or `Deny` for
each exact advertised tool. Reads begin at `Allow`; writes and execution begin
at `Ask`.

When changing permissions, prove:

- no state survives process exit;
- one pending `Ask` maps to one turn-and-call identity;
- `Allow once`, `Allow for session`, and `Deny` settle exactly once;
- denial and cancellation perform no effect;
- a decision cannot widen any tool contract.

Rollback by restoring the prior session reducer and command catalog together.
Do not reintroduce `/approve`, `/deny`, ambient grants, or persisted policy.

### Interactive terminal

**Owners:** CLI session/application reducers and `@agent/tui` generic input,
layout, frame, and rendering primitives.

For terminal behavior:

1. change the generic decoder/editor/layout primitive first;
2. add pure tests for input, viewport geometry, selection, and frame output;
3. route product meaning through the CLI reducer;
4. prove Ctrl+C, EOF, resize, paste, pointer, renderer recovery, and cleanup;
5. run the CLI smoke test on Windows and Linux.

The renderer owns alternate screen, raw-mode presentation obligations, ANSI,
paste, mouse, caret, and cleanup. The CLI owns event ordering and platform
effects.

Rollback must restore renderer and CLI event assumptions together. Removal of
an interaction deletes its decoder event, reducer route, layout projection,
manual entry, and tests; never leave a private alternate path.

### Vertical TUI framework

**Owners:** `@agent/tui` components, structured rows, surfaces, Markdown,
wrapping, width measurement, scroll geometry, layout, and rendering tests.

New visual behavior must reuse generic surfaces, split lines, selection lists,
spacers, activity, scrolling, and layout. Add a new primitive only when three or
more product regions need the same relationship and the existing primitive
cannot express it.

Prove narrow and wide viewports, retained priorities, transparent/surfaced
runs, Unicode width, wrapping continuations, and deterministic frames. Unknown
semantic roles fail closed.

Remove a primitive only after all consumers migrate to another generic owner.
Delete its export, tests, documentation, and renderer branches together.

### Ollama Cloud

**Owners:** `@agent/provider-ollama-cloud`, CLI HTTPS transport and catalog
transport, `tools/provider-policy.json`, decision 0072,
[providers](PROVIDERS.md), and [privacy](../PRIVACY.md).

For an adapter or transport change:

1. verify the provider-published endpoint and exact admitted origin;
2. update request, catalog, stream, bounds, inactivity, wall-clock deadline,
   cancellation, and cleanup contracts;
3. keep credentials and catalog state process-only;
4. add offline request/response and adversarial transport tests;
5. run the canonical verifier without a credential;
6. perform any live smoke manually and never record its secret or body.

Catalog and chat transports each need independent wall-clock deadlines in
addition to inactivity timeouts. Timers become inert after settlement and
destroy the active request/stream on expiry.

To remove Ollama Cloud, delete the adapter, CLI transport, commands/session
registration, provider policy entry, declarations, tests, public contract, and
decision status together. The product returns to no admitted provider; do not
select a replacement implicitly.

### Workspace trust boundary

**Owners:** CLI startup resolution, native protected-root resolver, read policy,
`.agentignore` parser, built-in tools, and their native/path tests.

Change startup or path handling only with tests for roots, home, shared
temporary directories, links, Windows aliases, traversal, identity races, and
post-resolution policy checks. The exact startup directory remains immutable
for the process.

Rollback must restore startup resolution and every tool consumer together.
Never infer a broader repository root or trust inherited home/temp variables.

### Continuous verification

**Owners:** `tools/verify.mjs`, `tools/verify.ps1`, `tools/verify.sh`,
policy libraries, and their tests.

When adding a gate:

1. identify the owned invariant and canonical input;
2. implement equivalent Windows and Linux orchestration;
3. add one passing fixture and one fail-closed regression;
4. keep the gate offline and deterministic;
5. document the exact failure and removal route.

Remove a gate only when its invariant disappears or another canonical gate
fully owns it. Remove both platform routes and all policy/test registration in
the same change.

### Task evaluation

**Owners:** the [evaluation guide](../evaluations/README.md) for operation;
`tools/evaluate.mjs`, `tools/lib/evaluation-suite.mjs`, and
`tools/lib/evaluation-failure-registry.mjs` plus
`tools/test/evaluation-suite.test.mjs` and
`tools/test/evaluation-failure-registry.test.mjs` for evaluator implementation;
`packages/agent-cli/src/evaluation-receipt.ts`,
`packages/agent-cli/src/launch-command.ts`, `packages/agent-cli/src/main.ts`,
`packages/agent-cli/src/run.ts`, and `packages/agent-cli/src/builtin-tools.ts`
for receipt launch and instrumentation; their focused coverage in
`packages/agent-cli/test/evaluation-receipt.test.ts`,
`packages/agent-cli/test/launch-command.test.ts`,
`packages/agent-cli/test/runtime-integration.test.ts`,
`packages/agent-cli/test/builtin-tools.test.ts`, and `tools/smoke-cli.mjs`; and
`evaluations/tasks/`, `tools/evaluation-policy.json`, and
`evaluations/failures/registry.json` for canonical inputs.
[Decision 0047](decisions/0047-owned-reproducible-task-evaluation.md) owns
framework rationale and task design without a dedicated decision;
[0048](decisions/0048-owned-content-free-evaluation-receipt.md) and
[0049](decisions/0049-owned-evaluation-failure-registry.md) retain receipt and
registry rationale.
[0064](decisions/0064-owned-self-verifying-typescript-evaluation.md),
[0065](decisions/0065-owned-red-green-tool-recovery-evaluation.md), and
[0066](decisions/0066-owned-namespace-directory-evaluation.md) own task design.

`evaluations/README.md` is corpus input: keep canonical UTF-8, LF-only text with
a final LF, no trailing whitespace, and at most 4,096 bytes
(`EVALUATION_LIMITS.taskBytes`).

Follow the guide's atomic task-change, evidence-invalidation, rollback, and
removal sequence. Run the focused corpus and failure-registry tests before the
canonical verifier. Ignored run state and manual receipts are not canonical
repository evidence; never recreate a lost receipt or carry one across a task
revision.

### Documentation and publication

**Owners:** living documents, manual chapters, decision index, migration
ledger, documentation/manual/publication policies, and repository metadata.

For documentation:

1. edit the single canonical owner;
2. replace duplicated prose with links;
3. update incoming anchors and policy structure;
4. mark only fully migrated ledger rows complete;
5. run focused policy tests before the canonical verifier.

For publication, keep repository identity, package metadata, license, security,
privacy, contributing guidance, brand manifest, and public descriptions
consistent. The [security policy](../SECURITY.md) owns supported versions,
vulnerability intake, safe report contents, and disclosure. The
[contributing guide](../CONTRIBUTING.md) owns participation, issue intake,
authorship, licensing, and the current external-code boundary.

Rollback restores prose, routes, policy, and ledger status together. A removed
document must leave no registered route or dangling link.

## Derived artifacts

Build and test output is disposable:

- `dist/`, `.test-dist/`, native binaries, evaluation runs, logs, and
  temporary snapshots are not source;
- `npm run clean` removes repository-derived build output;
- `npm run build` recreates JavaScript and native binaries from owned source;
- `npm run install:command` rebuilds and relinks the local `agent` command;
- no release or review should contain hand-edited derived files.

When output appears stale, clean and rebuild. Do not patch the output.

## Release gate

Before merging or publishing:

1. confirm the intended source diff and clean generated-artifact state;
2. run focused regressions for every changed authority;
3. run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
   ```

   or the canonical Linux equivalent;
4. run `git diff --check`;
5. confirm public metadata, manual behavior, architecture, maintenance, and
   accepted decisions agree;
6. wait for required CI and review threads to settle;
7. merge only with no unresolved required conversation or failed gate;
8. remove the merged branch when no longer needed.

Do not publish from a dirty worktree, from generated output, or with a live
credential in the environment, transcript, logs, fixtures, or documentation.
