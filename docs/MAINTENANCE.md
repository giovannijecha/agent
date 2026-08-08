# Maintenance

This runbook keeps package changes local, reversible, and visible to the
ownership verifier. Derived artifacts are never edited by hand.

## Canonical registries

Package topology has four explicit inputs:

1. `tools/ownership-policy.json` defines package paths, names, dependency edges,
   required documents, and approved Node imports.
2. `package.json` lists npm workspaces and canonical commands.
3. `tsconfig.json` and `tsconfig.tests.json` list build and test references.
4. Each package manifest and TypeScript configuration defines its public entry
   point and build boundary.

`tools/clean.mjs` and `tools/run-tests.mjs` derive their package lists from the
ownership policy. The verifier rejects missing, extra, or inconsistent files,
manifests, links, declarations, generated formats, and registry entries.

Subscription-provider eligibility is a separate canonical input in
`tools/provider-policy.json`. Version 3 permits no provider or auth package and
contains no endpoint, scope, credential, or client registration. It additionally
pins each authorization request's lifecycle state, official route, visibility,
research date, submission date, and public or content-free private reference.
That metadata cannot change blocked eligibility. The verifier pins the exact
five-workspace provider-neutral
foundation, including runtime and the tool engine. It denies ambient network and
provider escape paths; filesystem APIs remain explicitly allowlisted only for
CLI-owned tools. Process execution is not active.

Public identity is registered independently in
`tools/publication-policy.json`. It pins the project name, namespace,
maintainer, license, privacy posture, initial contribution boundary, public
documents, and exact license digest. Product package metadata does not silently
override that registry.

Continuous verification is registered in `tools/ci-policy.json`. Its validator
binds the only workflow to the protected branch, read-only permissions, one
bounded Windows job, the pinned toolchain, the canonical local command, and zero
imported actions or secrets. The workflow and local release gate are one
contract, not separate verification implementations.

## Update or remove the streaming runtime

Update model-stream events, limits, cancellation, or cleanup only with focused
runtime regressions and decision 0005. Future adapters must prove pending-open
cancellation, close-during-read behavior, idempotent cleanup, immutable
content-free failures, total decoding of hostile boundary values, explicit
prepared-turn acknowledgement, cancellation-before-commit ordering, and
terminal-receipt acknowledgement across shutdown races. They must also prove
non-retention of candidate conversations. Runtime tool-loop changes must preserve
one call per model step, exact approval identity, handler cancellation,
structured checkpoints, and the rule that only state newer than the last
checkpoint may be discarded.

To remove runtime, first remove any CLI runtime composition and restore exact
no-model submission behavior. Then delete `packages/agent-runtime`, its root npm
and TypeScript registrations, its ownership and provider-policy entries, its
TypeScript path, and decision 0005. Regenerate derived artifacts and verify that
core, TUI, and CLI remain independently buildable.

## Update or remove the tool engine

Add a tool only after decision 0014 proves a distinct capability, current
necessity, one canonical name, and independent removal. Update its descriptor,
handler, focused tests, `tools/manual-policy.json`, operator-manual inventory,
and evidence together. Never retain the previous name as an alias during a
rename. Translate provider-specific vocabulary outside the model-facing
registry.

Change a schema, risk class, limit, handler contract, or built-in tool only with
core structured-value tests, schema/registry tests, runtime loop/checkpoint tests,
Node adapter success/failure/security tests, reducer approval tests, TUI privacy
tests, and decision 0008. Preserve exact `/approve` and `/deny`, one pending call,
read-only automatic execution, root containment, symlink denial, incremental
directory bounds, post-invocation checkpoints, content-free failures, and only
descriptor-declared approval summaries in UI. Reintroduce process execution only
by replacing decision 0015 with kernel-backed Windows and Linux containment,
the complete adversarial platform matrix, environment and output bounds,
cancellation, owner-loss behavior, and cleanup tests.

Approval-summary changes must test directional, zero-width, control, surrogate,
private-use, and line-separator input. Preserve two independent defenses: the
tool engine emits an escaped printable representation, and the CLI rejects raw
unsafe scalars before any TUI component receives the summary.

To remove one tool, stop advertising its descriptor, then delete its handler,
focused tests, policy record, manual entry, and unused private helpers. Update
decision 0008 if the execution contract or its registry reference changes.
Verify that the remaining tool registry and text-only path build without
unrelated changes. Shared engine primitives remain only when another admitted
tool uses them.

To remove tools, stop descriptor advertisement and restore the runtime text-only
path. In that same change, replace manual-policy schema 3 with a schema that
removes both the advertised tool inventory and the `blockedTools` registry,
including the `run_process` record. Remove decisions 0008, 0014, and
`docs/decisions/0015-process-tree-containment.md`, together with their ownership
and required-path entries and manual evidence citations. Do not land an empty
advertised or blocked inventory under schema 3. Remove CLI approval commands,
tool status, built-in Node handlers, imports, declarations, and allowlist
entries. Then remove the runtime dependency on `@agent/tools` and delete its
workspace from npm, TypeScript, provider-policy, and lock registries. Remove core
structured tool entries only if no remaining adapter consumes them. Build core,
TUI, runtime, and the providerless CLI after each stage.

## Update or remove the vertical TUI framework

Update fragments, text normalization, component measurement, allocation, caret
rules, or public limits only with focused boundary tests and decision 0006.
Preserve exact-row fragments, content-free errors, callback containment,
deterministic priority/preference/flex allocation, and `Frame` as the final
terminal-safety boundary. Product concepts remain in CLI.

To remove the framework, first replace `chat-view` with direct validated frame
composition. Then delete component, fragment, display-text, input-line,
text-block, vertical-layout, and limit exports together with their focused tests
and decision 0006. Decoder, editor, renderer, runtime, and core must stay green.

## Update or remove the CLI application loop

Event or control changes affect `SessionController`, `ApplicationController`,
`EventArbiter`, `ChatState`, `chat-view`, and `run` as one documented contract.
Preserve one read and one ready slot per source, one state writer, ordered action
feedback, turn-id filtering, one active turn, no-provider discard, active Ctrl+C
cancellation, prepared-turn commit feedback, terminal acknowledgement, idle
Ctrl+C exit, unconditional `/exit`/Ctrl+D/EOF exit even when controls share one
input chunk, and preservation of cleanup failures from buffered runtime events.

Shutdown must close the arbiter, release display-only content references, start
runtime cancellation before its first await, restore terminal input, finish the
renderer, then await runtime cleanup. Test primary plus terminal, renderer, and
runtime cleanup failures independently. Update decision 0007 whenever ordering,
retention, controls, or cleanup changes.

To remove application/runtime composition, restore a terminal-only serialized
loop and unconditional no-model handling first. Remove the CLI runtime dependency
and TypeScript reference, then delete arbiter and display-chat modules and
decision 0007. Keep the generic TUI and providerless CLI buildable.

## Research or enable a provider

1. Check current official provider documentation. If it lags observed behavior,
   inspect current public reference source at a pinned commit.
2. Record inspected material and allowed influence in `docs/OWNERSHIP.md`; do not
   reuse source, identifiers, prompts, fixtures, user agents, or product identity.
3. Update `docs/PROVIDERS.md` with dated evidence. Research alone does not change
   machine eligibility.
4. Update the matching packet in `docs/PROVIDER-APPLICATIONS.md`, its research
   date, and provider-policy routing metadata. Before submission, verify that
   the route remains official and that a public request contains no account data.
5. After submission, record only the public URL or a content-free private case
   reference. Never commit private correspondence. Submitted, unanswered, and
   rejected requests leave eligibility blocked.
6. Enable a provider only through a replacing decision that records independent
   authorization, this project's client registration, protocol contracts,
   threat model, storage boundary, tests, update path, and removal path.
7. Replace the provider policy schema and verifier in the same change as the
   first concrete adapter. Keep canonical tests offline.

Provider-scanner changes must retain escape and literal-concatenation coverage
for endpoints, credentials, and foreign identity while proving short unrelated
tokens remain usable. High-entropy markers may use compact substring checks;
low-entropy markers require a syntactic identity or credential context.

If authorization or protocol support is withdrawn, remove composition and the
adapter first, destroy local credentials through the owned vault contract,
restore the blocked registry, then run the release gate. Never leave dormant
provider code or compatibility paths.

The selected direct-integration policy does not admit vendor SDKs, CLIs, app
servers, ACP executables, or other foreign bridges as a substitute for client
eligibility. Reconsidering that boundary requires an explicit replacing
ownership decision; it is not a provider-adapter implementation detail.

To remove the request workflow while providers remain blocked, delete the
provider packet document and links, restore provider policy schema version 1,
remove its application checks and regressions, remove decision 0011 and its
registrations, and run the release gate. Product workspaces remain unchanged.

## Update or remove the operator manual

`tools/manual-policy.json` is the single manual registry. It lists the index,
ordered chapters, current slash commands, current built-in tools, and evidence
paths. `tools/lib/manual-policy.mjs` verifies the exact Markdown set, common
section order, README entry point, source capability inventory, local links,
and evidence existence before the build begins.

When a command, tool, or operator workflow changes, update product source, its
focused tests, the affected chapter, the manual policy when its inventory
changes, and decision 0009 together. Add a chapter only for a distinct operator
task and keep the fixed contract sections. Do not add a generator or rendered
copy until distribution requires one accepted source-of-truth design.

To remove the manual, first restore direct README navigation to architecture and
runbooks. Remove the verifier call, policy, tests, manual directory, decision
0009, and its ownership registration. Runtime workspaces must build unchanged.

## Update or remove public distribution

Change the project name, repository namespace, maintainer, license, telemetry,
backend, persistence, contribution, or attribution posture only through a
replacing decision. Update `tools/publication-policy.json`, public documents,
manual evidence, focused validator tests, and the license digest atomically.
Never weaken the validator to conceal a real identity change.

Before the first public release, create `giovannijecha/agent` only on explicit
request, enable GitHub private vulnerability reporting, confirm the default
branch and configured Git identity, scan the complete history for secrets, run
the release gate, and review the rendered README and license. Preserve the
repository-wide LF policy in `.gitattributes` so checkout cannot change the
verified license digest. Do not add an automated tool signature, generated-by
banner, or tool co-author trailer.

To remove the unpublished public layer, delete the license and public policies,
publication validator, tests, decision 0010, manual chapter, and registrations;
runtime workspaces remain unchanged. After a release, archive rather than erase
history, retain license obligations for distributed versions, revoke provider
registrations, and document credential deletion.

## Update or remove continuous verification

Change `.github/workflows/verify.yml`, `tools/ci-policy.json`, its pure validator
and tests, decision 0012, manual evidence, and affected toolchain facts together.
Run the full local gate before pushing. Prove the new job on a pull request
before changing the required status check, because GitHub recognizes a workflow
check by job name only after it has run.

Preserve `contents: read`, exact event-revision checkout, ref and SHA validation,
remote removal, no secret context, no `pull_request_target`, no `uses:`, one
bounded job, and the canonical release command. Toolchain bootstrap may contact
the npm registry only for the approved npm and TypeScript versions; the project
verification itself remains offline.

To remove CI, first remove the required `verify` check from the GitHub ruleset so
the default branch is not deadlocked. Then remove the workflow, CI registry,
validator, tests, decision 0012, and manual references. Keep the local release
gate unchanged and passing throughout removal.

## Change a package

Keep implementation, public exports, tests, and contract documentation inside
the owning package. Change another package only when its declared public
contract or composition must change. Prefer `.at()` and other explicit methods
over computed runtime member access in shipped code; the trust gate rejects
unknown member names. Run the complete verifier before treating the change as
complete.

## Update or remove the interactive terminal

Terminal protocol changes affect two independent owners:

1. Update decoder, editor, viewport, frame, renderer, and focused tests inside
   `packages/agent-tui` for generic mechanics.
2. Update commands, chat view, reducer, event arbitration, Node lifecycle, and
   focused tests inside `packages/agent-cli` for product or platform behavior.
3. Keep the event queue, input chunks, editor, frames, and notices bounded.
4. Preserve exact tests for fragmented escape sequences, output completion,
   alternate-screen cleanup, raw-mode restoration, resize, one-cell viewports,
   non-TTY output, active and idle Ctrl+C, pending runtime reads, and `/exit`.
   Include emitted stream errors before startup and after input teardown, Escape
   followed by shutdown controls, SS3 fragmentation, and cumulative queue size.
5. Update decision 0004 when lifecycle, ownership, width rules, or supported keys
   change materially.

To remove interactivity, first remove runtime event composition, then delete the
TUI decoder/editor/viewport modules and CLI session/chat-view/host modules.
Restore a plain CLI and the previous renderer contract, remove decisions 0004
and 0007 as applicable, regenerate derived artifacts, and run the release gate.
Core and provider policy remain unchanged.

## Add a package

1. Define its single responsibility and dependency direction in the
   architecture document or a decision record.
2. Add its source, test, manifest, `tsconfig.json`, and `tsconfig.test.json`.
3. Register it in the ownership policy, root npm workspaces, and both root
   TypeScript reference files.
4. Declare exact local dependency edges in both the consumer manifest and the
   ownership policy. Add a root TypeScript path only for a consumed library.
5. Regenerate local links and lock metadata with the offline npm command below.
6. Add success, failure, boundary, removal, and composition tests as applicable.

## Remove or replace a package

1. Remove composition and public imports first; keep unrelated packages green.
2. Remove its entries from the ownership policy, root npm workspaces, root
   TypeScript references, and root TypeScript paths.
3. Delete the package directory and obsolete documentation completely.
4. Regenerate local links and lock metadata offline.
5. Verify that no source, generated artifact, declaration, or workspace link
   remains. Replacement follows the add procedure behind the same contract.

## Regenerate derived artifacts

With the pinned external toolchain on `PATH`:

```powershell
npm install --offline --ignore-scripts --no-audit --no-fund
node tools/clean.mjs
tsc --build tsconfig.json --pretty false
tsc --build tsconfig.tests.json --pretty false
```

This may change only `package-lock.json`, `node_modules` local links, `dist`, and
`.test-dist`. Review those outputs through `tools/verify.ps1`, not manual edits.

## Update the toolchain

1. Record the reason, compatibility facts, rollback, and provenance in a
   replacing decision record.
2. Update `tools/toolchain.json`, root engine constraints, setup documentation,
   and any runtime declarations affected by the documented contract.
3. Install the compiler outside this repository. Never add it to a manifest.
4. Regenerate all derived artifacts and run the complete verifier offline.
5. Roll back by restoring the previous pins, declarations, lock metadata, and
   generated output from the last known-good project snapshot.

## Release gate

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

This command validates ownership before installation, recreates only local
workspace links, rebuilds from clean inputs, validates derived output, runs all
tests, and executes the exact CLI smoke test.
