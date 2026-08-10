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

Provider eligibility is a separate canonical input in
`tools/provider-policy.json`. Version 4 keeps the four subscription OAuth
providers blocked and admits exactly one direct API-key provider, OpenCode Go.
It pins that provider's origin, model, transport, environment variable,
memory-only persistence, evidence date, and exact workspace. It additionally
pins each authorization request's lifecycle state, official route, visibility,
research date, submission date, and public or content-free private reference.
That metadata cannot change blocked eligibility. The verifier pins the exact
six-workspace graph, including the provider, runtime, and tool engine. It denies
ambient network and provider escape paths while admitting only reviewed direct
provider literals in their exact files. Filesystem and HTTPS APIs remain
explicitly allowlisted only at the CLI edge. Process execution is not active.

Public identity is registered independently in
`tools/publication-policy.json`. It pins the project name, namespace,
maintainer, license, privacy posture, initial contribution boundary, public
documents, and exact license digest. Product package metadata does not silently
override that registry.

Continuous verification is registered in `tools/ci-policy.json`. Its validator
binds the only workflow to the protected branch, read-only permissions, bounded
Windows 2025 and Ubuntu 24.04 jobs, the registered TypeScript and native C
toolchain, the canonical local command, and zero imported actions or secrets.
The workflow and local release gate are one contract, not separate verification
implementations.

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
after the private decision-0016 broker passes its complete matching-platform
adversarial matrix and a later decision accepts the model-facing schema,
adapter, approval, privacy, checkpoint, and removal contract. The private
broker alone grants no production authority.

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

Update structured rows, fragments, semantic tones, text normalization, component
measurement, allocation, scroll reconciliation, synchronized redraw, caret
rules, or public limits only with focused boundary tests and decisions 0006,
0019, 0020, and 0021. Preserve normalized bounded spans, exact-row fragments,
content-free errors, hostile accessor containment, deterministic
priority/preference/flex allocation, and `Frame` as the final terminal-safety
boundary. Product concepts remain in CLI.

To remove the framework, first replace `chat-view` with direct validated frame
composition. Then delete component, fragment, display-text, input-line,
inline-text, rich-row, text-block, vertical-layout, and limit exports together
with their focused tests and decisions 0006, 0019, and 0021. If only semantic
emphasis is removed, retain the vertical framework and replace structured rows
with one validated plain-row contract before removing tone metadata, renderer
mappings, CLI tone choices, focused tests, and decisions 0019 and 0021 as one
change. Remove scrolling only after all callers return to their contained
components; then remove scroll state, scroll view, their tests, manual
references, and decision 0020. Remove synchronized
output by deleting both markers and recovery state together. Decoder, editor,
runtime, and core must stay green.

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

## Update or remove OpenCode Go

The admitted provider has two owners. `@agent/provider-opencode-go` owns the
Node-free request, UTF-8, SSE, response, and tool-call contract. CLI owns the
exact environment variable, HTTPS origin, response backpressure, timeout,
composition, and provider presentation. Do not move process or socket access
into the provider package and do not leak provider vocabulary into runtime,
tools, core, or TUI.

An endpoint, model, header, privacy, limit, or wire change requires current
official evidence, an update to decision 0017, exact provider-policy changes,
provider and CLI contract tests, manual/privacy/security updates, and the full
offline release gate. Never add discovery, redirects, aliases, retries,
fallbacks, arbitrary base URLs, or persistent key storage as a compatibility
shortcut.

To roll back or remove the provider, first remove its composition from
`main.ts` and restore the providerless command result. Then remove the CLI
transport, configuration and instructions modules; the provider workspace and
all npm/TypeScript/ownership edges; the `node:https` declaration and allowlist
if unused; the exact direct-provider policy entry and source-literal exceptions;
decision 0017; and provider-specific documentation. Regenerate the lockfile
through the offline npm command. Preserve the four blocked OAuth request records
and prove the remaining five workspaces through the canonical verifier.

## Update or remove executable startup

The root `bin` metadata, exact root scripts, CLI shebang, argument parser,
hidden prompt, manual chapters, decision 0018, lockfile, and manifest verifier
form one executable contract. Preserve no-argument startup, exact `--help` and
`--version`, secret-free arguments, non-TTY silence, bounded hidden input, and
terminal restoration. The npm link is explicit operator state and must never be
created by install lifecycle scripts.

OpenCode Go removal deletes only its prompt and composition. The `agent` binary,
providerless startup, and npm link remain. To remove the command from one
machine, run `npm unlink --global agent-workspace`. To remove the feature from
source, delete the root `bin` and installation script, argument parser, prompt,
tests, decision, documentation, and verifier expectations together; retain
`npm start` as the rollback entry point.

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
6. Enable subscription OAuth only through a replacing decision that records
   independent authorization and this project's client registration. Enable a
   direct API-key service only when its official independent-client contract,
   exact origin, credential boundary, protocol, threat model, tests, update path,
   and removal path are accepted.
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
remote removal, no secret context, no `pull_request_target`, no `uses:`, both
bounded platform jobs, and the canonical release command. Toolchain bootstrap
may contact the npm registry only for the approved npm and TypeScript versions;
the project verification itself remains offline. Linux `sudo` is confined to
the owned disposable-cgroup bootstrap and cleanup. Product, broker, and tests
must run unprivileged.

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
6. Preserve decisions 0019 and 0021 when semantic emphasis changes: tones stay
   closed, application-neutral, structured-row, and renderer-owned, with
   normalization, bounded span count, and reset after emphasized spans and on
   cleanup.

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
node tools/build-native.mjs
```

This may change only `package-lock.json`, `node_modules` local links, `dist`,
`.test-dist`, and the ignored matching-platform `.native-build` directory.
Review those outputs through `tools/verify.ps1` on Windows or `tools/verify.sh`
on Linux, not manual edits or committed binaries.

## Update the toolchain

1. Record the reason, compatibility facts, rollback, and provenance in a
   replacing decision record.
2. Update `tools/toolchain.json`, root engine constraints, setup documentation,
   and any runtime declarations affected by the documented contract.
3. Install the compiler outside this repository. Never add it to a manifest.
4. Regenerate all derived artifacts and run the complete verifier offline.
5. Roll back by restoring the previous pins, declarations, lock metadata, and
   generated output from the last known-good project snapshot.

## Update or remove native process containment

Keep the common frame decoder and entry point independent from the two platform
backends. A protocol change replaces version 1 everywhere; never retain a
dormant decoder. Compile and test Windows source on Windows x64 and Linux source
on Linux x64. Cross-compilation is diagnostic only, not release evidence. Keep
generated binaries ignored and rebuild them from owned source.

The Linux backend requires an exclusive delegated cgroup v2 layout with the
controller in `control`, an empty user-owned sibling named `runs`, and delegatee
write access to the common parent's `cgroup.procs`. Production never invokes
`sudo`. The CI bootstrap may elevate only to create, delegate, leave, and remove
its disposable subtree. Missing `pids`, `cgroup.kill`, `clone3`, pidfd,
namespace, read-only cgroup mount, or cleanup support is a hard failure. Do not
add a process-group fallback. Keep every cleanup wait bounded. If the cgroup
control path fails after guard creation, retain the direct namespace-guard kill,
bounded reap, and repeated empty-container observation before reporting failure.

The registered Ubuntu 24.04 proof also requires the runner's default AppArmor
unprivileged-user-namespace restriction. The CI bootstrap temporarily changes
that single policy value from `1` to `0` so the owned namespace sandbox can be
exercised, then restores `1` before removing the delegated cgroup. A missing or
unexpected initial policy value fails the proof closed.

Update Job Object flags, namespace flags, cgroup files, inherited handles,
descriptor policy, limits, or cleanup ordering only with the full Windows and
Linux conformance matrix and decision 0016. Roll back by removing the native
verification wiring and restoring the previous CI/toolchain registries while
leaving `run_process` blocked.

On Linux, preserve the admitted namespace order: the broker creates the guard
inside the run leaf with user, mount, and PID namespaces; only the mapped guard
creates the cgroup namespace rooted at that leaf. Do not merge those operations
without replacing the ownership proof. The inherited host mounts form a locked
unit in the less-privileged mount namespace and cannot be detached individually.
After mount propagation is private, the guard must create a detached, read-only
namespaced cgroup v2 view through the file-descriptor mount API and attach it
over the inherited cgroup mount. Do not replace this with a global temporary
mount point.

To remove the private proof, delete `packages/agent-cli/native/process-broker`,
`tools/build-native.mjs`, `tools/lib/native-process-broker.mjs`, its focused
test, the Linux bootstrap, native verifier and cleaner rules, compiler registry,
decision 0016, and the Linux CI job. Restore manual and architecture text to
decision 0015 only. No TypeScript production module should require changes.

## Release gate

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

```bash
bash tools/verify.sh
```

Each platform entry point validates ownership before installation, recreates only local
workspace links, rebuilds from clean inputs, validates derived output, runs all
tests, and executes the exact CLI smoke test.
