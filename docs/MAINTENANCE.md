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
and decisions 0075 and 0076.

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
compaction, replay, branch deletion, or import/export as part of a tree
maintenance change; each requires a separate accepted design.

### Durable session journal

**Owners:** the core journal codec, runtime settled-history projection, CLI
`SessionJournal`, launch grammar, serialized settlement and selection wiring,
restored `ChatState`, privacy and security policies, and decisions 0076, 0085,
and 0087.

For a journal change:

1. when the record shape changes, change the versioned core codec and its exact
   rejection tests first;
2. keep filesystem, native-home user-state resolution, legacy-root lookup,
   locking, retention, migration, and recovery in
   the CLI; never move Node I/O into core, runtime, or TUI;
3. migrate only the exact accessed workspace while holding its legacy
   cross-version admission; require an inactive bounded inventory and an absent
   current destination, use one same-filesystem rename, synchronize both
   namespaces, and never copy, merge, overwrite, delete, or fall back between
   roots;
4. append only after authoritative runtime and display settlement, update the
   head only after runtime selection, record its exact journal turn count, and
   keep both in the sole controller; recover only one synchronized final turn
   whose parent is the immediately preceding head; if stop settles a
   checkpointed turn, append its immutable handoff before journal close and
   never retry a node whose append was already attempted;
5. synchronize every file before publication; on POSIX synchronize the staged
   session directory before its rename and the containing directory after head
   replacement, publication, retirement, and lock transitions;
6. serialize scan, retention, resume selection, and publication with one
   unique never-reused admission token per launcher; proceed only when no
   other live token exists, fail overlapping contenders busy without waiting,
   remove only an operating-system-proven stale token's unique pathname, and
   derive each publication value as the greater of wall time and the newest
   retained value plus one;
7. decode version one and version two through separate exact shapes, write only
   version two, and create a separate version-two continuation after a valid
   version-one resume; never rewrite or append to the source journal;
8. retain native reasoning only with its settled assistant message or tool
   exchange; exclude credentials, provider/model state, thinking settings,
   permissions, drafts, provisional output, activity, notices, foreign causes,
   and receipts;
9. prove exact-workspace isolation, native-home root selection, exact legacy
   relocation, unrelated-workspace isolation, active and dual-root rejection,
   failed-move preservation, active and stale locks, concurrent
   admission at the retention boundary, successor-safe stale reclamation,
   tied and regressed publication clocks, POSIX directory-sync failure,
   truncated final lines, interrupted head replacement, deliberate
   current-revision selection, unreconciled gap rejection, interior corruption,
   independent structured-payload bounds, cleanup settlement, no duplicate
   append, and one composition round trip;
10. update the public retention and exact deletion instructions in the same
   change.

Rollback first removes `agent resume --latest` and disables new journal
creation. Existing versioned directories remain untouched until the operator
uses the privacy-policy deletion route. Then remove controller wiring, the CLI
storage owner, runtime projection, core codec, display restoration, tests, and
registries, including head-revision reconciliation. If only thinking is rolled
back, keep both journal decoders so already settled version-two data remains
readable. Removal must never reinterpret an unknown schema, append to an old
journal, rewrite retained reasoning, or delete an active session.

To roll back only the user-state relocation, first disable creation and resume.
After every `agent` process is closed, move an exact workspace digest directory
back to its former platform-state root only when that destination is absent.
Never run old and new storage authorities concurrently, merge directories, or
guess which copy is newer. Do not start an older executable after migration and
before this explicit rollback: it can recreate the legacy workspace authority,
which the current executable then rejects as a dual-root conflict. During the
migration era, complete removal checks both the current and former roots
documented by the privacy policy.

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

`manage_path` accepts only the flat `{ operation, path, destination? }` shape.
Its bounded schema discriminant admits `destination` exactly for `move` and
rejects every inexact variant during complete batch preflight; the provider
projection contains neither a `request` envelope nor `oneOf`. Change the flat
descriptor, discriminant, planner extraction, provider request fixture, CLI
regressions, manual, and decision 0084 together. Rollback restores the nested
union everywhere in one change. Never accept both forms, rewrite arguments in
an adapter, or migrate and replay settled historical calls.

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
sources, focused tests, decisions 0054 and 0084, and policy entries.

If the complete inventory is retired, replace manual-policy schema 12 with a
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

Cursor shape is one renderer-owned initialization choice. Preserve one logical
frame caret, terminal-controlled blinking, exact positioning, and
default-style restoration; do not add an application timer, simulated cursor
glyph, or component-private ANSI path. Shape changes require exact
initialization and cleanup byte regressions and the terminal decision, manual,
architecture, and policy to change together.

A frame with no viewport-visible caret must leave the terminal cursor hidden.
If a selector appears to move the block cursor onto footer text, diagnose the
renderer for a synthesized fallback coordinate rather than special-casing the
dock or footer. Regress visible-to-absent-to-visible ownership and clipped
carets at the renderer boundary.

The ruled interaction dock owns one body, one focus kind, and an absolute six
content-row maximum. Keep editor focus for the draft and concealed credential
entry; keep provider, model, permission, pending-tool, and timeline lists in
selection focus. Selection focus has no caret, consumes a closing editor event,
and blocks composer pointer effects without resetting or blocking transcript
pointer selection and scrolling. Change focus routing in the CLI reducer only
after generic dock tests cover header allocation, selected-row visibility,
caret admission, narrow viewports, hostile children, and accessor-backed
options.
Snapshot focus, header, and height exactly once before validation and construct
the frozen dock contract from that same snapshot; never reread caller-owned
options after validation. Carry the focus and separate
composer-pointer authority rendered with each pointer projection; never infer
either from application state that may have changed earlier in the same decoded
input chunk. A concealed credential editor keeps editor focus for keyboard and
caret ownership but must publish no composer-pointer target. Its regression must
prove credential drags cannot queue clipboard content while transcript pointer
selection remains available.

Provider, model, session-permission, and timeline selection must close only
through its existing Enter acceptance or explicit Escape/Ctrl+C cancellation.
Treat printable text, paste, Tab, Home, End, deletion, and word editing as inert
while selection focus remains active; never forward them to the retained editor,
replay them after close, or emit a notice for them. Preserve Page Up, Page Down,
and EOF as global routes. If Escape cannot close a selector, trace the Node host's
single trailing-byte timer, its 30-millisecond settled marker, the generic
decoder event, and the shared CLI selector reducer in that order. Do not decode
raw Escape in a component or make arrow-key correctness depend on stream chunking.
Manual-policy schema 12 pins the normalized terminal-interface chapter, the
fixed eight-section inventory and every corresponding body in heading order,
and three exact selector-dismissal
clauses in their owning sections: input remains inert, Escape or Ctrl+C
cancels, and other typing and editing keys remain ignored. The verifier checks
structure, identity, clause placement, and clause cardinality. It deliberately
does not parse CommonMark or infer semantic equivalence from free-form English.

A chapter edit requires the chapter digest and each affected section digest to
change explicitly. A protected-clause rewrite also requires an explicit clause
contract update. Digest updates identify the reviewed artifact; they never
constitute semantic approval by themselves. Change behavior, decision, manual,
focused regression, policy, and removal guidance together. Rollback restores
the prior schema, contract, validator, and tests as one unit; never introduce a
parallel prose classifier or partial Markdown parser.

When selection focus replaces the composer, project any active composer-placed
transient notice through the selector header's trailing edge. The notice
temporarily replaces ordinary header context and may add the optional header to
a headerless pending-tool decision. Give the notice side retention priority over
the title only while status is present. During concealed credential entry, let
the same notice temporarily replace the non-secret entry guidance. Neither path
may expose retained draft or credential text, admit an additional caret, or
create another notice authority. Regress an existing selector header at narrow
width, the headerless pending-tool path, and concealed credential entry.

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

The interaction dock is the generic owner for mutually exclusive editor and
selection bodies. Remove it only after every selector returns to an explicitly
documented placement and the ruled composer again owns the sole caret; delete
its export, focused tests, CLI composition, decision, and policy registration
together.

Prove narrow and wide viewports, retained priorities, transparent/surfaced
runs, Unicode width, wrapping continuations, and deterministic frames. Unknown
semantic roles fail closed.

Remove a primitive only after all consumers migrate to another generic owner.
Delete its export, tests, documentation, and renderer branches together.

### Ollama Cloud

**Owners:** `@agent/provider-ollama-cloud`, CLI HTTPS transport and catalog
transport, `tools/provider-policy.json`, decisions 0072, 0080, and 0082,
[providers](PROVIDERS.md), and [privacy](../PRIVACY.md).

For an adapter or transport change:

1. verify the provider-published endpoint and exact admitted origin;
2. update request, catalog, stream framing, native message and tool-call
   normalization, canonical history, bounds, inactivity, wall-clock deadline,
   cancellation, and cleanup contracts;
3. keep credentials and catalog state process-only;
4. add offline request/response and adversarial transport tests;
5. run the canonical verifier without a credential;
6. perform any live smoke manually and never record its secret or body.

Catalog and chat transports each need independent wall-clock deadlines in
addition to inactivity timeouts. Timers become inert after settlement and
destroy the active request/stream on expiry.

For `model/open/<family>`, diagnose the classified boundary before changing the
wire request: `request` means a 4xx request contract failure, `rejected` covers
authentication, payment, authorization, or missing-model rejection, `limit`
covers entity or rate limits, `timeout` covers HTTP timeouts, `connectivity`
covers server failures, and `protocol` covers a rejected pre-stream contract,
including an unexpected non-success class, invalid content type, or malformed
transport opening. Every open-time protocol outcome has no stream phase because
no response stream was admitted. Do not label it `transport` or present it as a
read failure.
The selected identifier must still be present in the fresh authenticated
catalog, but catalog membership alone does not prove entitlement, credit,
quota, or capacity. Never inspect or persist an error body, hard-code a model,
retry, alias, or fall back to conceal one of these outcomes.

For `model/read/protocol/<phase>`, inspect only the named owned boundary:
`transport` snapshots or content type, `framing` UTF-8 or NDJSON structure,
`envelope` top-level identity, `message` assistant fields, `tool-call` native
call normalization, `finish` completion metadata, or `terminal` clean-end
admission. Reproduce with a bounded offline fixture and keep its contents out
of the public code. Do not relax the native contract, parse serialized
arguments a second time, or add a model-specific branch. Missing, null, and
empty `tool_calls` members are already the admitted no-contribution forms.

Test catalog admission, ordinary text completion, and native tool-call
interoperability as three independent contracts. A successful text-only smoke
does not qualify tool interoperability. When a bounded live observation ends
at `terminal` after tools were advertised, preserve only the content-free
failure code and reproduce the boundary with owned offline fixtures. Do not
persist model output, infer executable calls from assistant content, edit the
catalog, or introduce identifier- or family-specific compatibility. Reconsider
the shared adapter only when the provider publishes a model-neutral native
contract change and the owned fixtures establish its complete boundary.

For completion failures, preserve the transport distinction. A clean HTTP end
may settle only after the native decoder accepted non-empty thinking, content,
or a complete tool call. A clean empty stream is `terminal`; incomplete UTF-8
or NDJSON remains framing or encoding failure; an aborted or errored connection
remains transport failure. Never infer success from partial bytes or add a
model-specific terminal rule.
Validate any non-null finish reason before accepting the record's contribution:
only `stop` paired with `done: true` is terminal success. A reason on
`done: false` and a truncation reason fail at `finish` rather than becoming
partial assistant output. Thinking, content, call counts, arguments, and call
identities from any rejected record must remain unchanged.
The first rejected record also terminalizes the decoder. Later records and
clean EOF must return the closed terminal failure rather than restore earlier
completion evidence or admit new contributions.
Apply the same one-way transition to every admitted read failure. After a
transport, UTF-8, NDJSON, or native-record failure is returned, later reads must
not call the transport, framer, or decoder and must return the closed terminal
failure. Diagnose the first content-free failure; never replay the stream or
infer completion from an EOF observed after it.

To remove Ollama Cloud, delete the adapter, CLI transport, commands/session
registration, provider policy entry, normalizer and phase mapping,
declarations, tests, public contract, and decisions 0072, 0080, and 0082 status
together. The product returns to no admitted provider; do not select a
replacement implicitly.

### Dormant durable credential boundary

**Owners:** CLI native platform boundary, decision 0088,
[providers](PROVIDERS.md), [OAuth registration](OAUTH-REGISTRATION.md),
[privacy](../PRIVACY.md), and [security](../SECURITY.md).

While every subscription OAuth provider is blocked, verify that no
`~/.agent/credentials` namespace, credential reader, `agent auth` command,
token field, or API-key persistence enters the product. Do not implement an
opaque generic store in anticipation of a provider.

Keep the verifier's closed sensitive-state identifier inventory, exact dormant
CLI product tree, and exact production CLI effect-authority registries
synchronized with reviewed source.
Any new auth, credential, secret, session-state, or token identifier and any new
or expanded CLI filesystem, child-process, network, activation, or native
authority must fail until its owning contract and mutation evidence are updated
in the same change.

Sensitive spelling alone never authorizes a use. Each admitted spelling is
bound to one reviewed path and exact occurrence count; update only the affected
path record when its owning evidence changes. Prove both an added known spelling
and a removed occurrence fail before repinning that record.

Treat every closed inventory as an exact current-path requirement. Renaming or
deleting an inventoried file must fail, as must changing its reviewed filesystem
or child-process import, network import, or any other source content. Each direct
Node effect-authority record owns only its exact module specifier and imported
bindings. The complete dormant CLI product tree recursively includes every
TypeScript module under `packages/agent-cli/src/`; a module added or moved into
any child directory must fail until the ordered path set and aggregate digest
are reviewed. The native platform authority likewise owns its complete tree.
Both use an aggregate SHA-256 digest over normalized UTF-8 path/source records
after only CRLF-to-LF normalization. Update or remove stale records together
with the owning decision and mutation evidence; never retain a dormant pathname
or digest allowance for possible later reuse.

Do not weaken source integrity into a partial export or alias scanner. Keep
representative escape recurrences in the source-policy corpus, including direct
and aliased exports, variable declarations, assertions, destructuring, Unicode
bindings, assignment to an exported binding after declaration, and an
unreviewed child-process launch with split path fragments. They all must fail
through the same exact source-integrity boundary, independent of surface syntax.
Keep direct, split, and method-composed dormant command and namespace
recurrences in the mutation corpus. They must fail through the exact dormant CLI
product-tree boundary without teaching the verifier each new string syntax. Any
legitimate CLI or native source edit requires review of the complete owning tree
and an explicit digest repin in the same change; effect-edge changes also update
the exact Node registry. The gate does not execute product code or infer partial
strings, exports, commands, or general data flow.

To activate the boundary, first admit one independently registered provider and
define its exact durable record, bounds, native access proof, cross-process
admission, refresh rotation, revocation, failure recovery, rollback, and removal
contract in the same change. Test Windows ACL and Linux owner/mode enforcement,
linked-object rejection, atomic publication, concurrent refresh, lost-response
failure, and secret non-projection offline on both platforms. Never repair an
unsafe record silently, retry a refresh, restore superseded material, or borrow
another client's credential store.

### Thinking-stream lifecycle

**Owners:** decisions 0086 and 0085, core message and journal codecs, runtime
model/event/session contracts, Ollama wire translation, CLI `/thinking` state,
`ChatState`, the shared transcript renderer, and privacy and provider policy.

Change thinking one boundary at a time in that order. Preserve the exact
session-only Effort values `Off`, `Low`, `Medium`, and `High`, Stream values
`Off` and `On`, both defaults, provider and model prerequisites,
model-selection preservation of both values, one immutable per-turn effort,
display-only transcript filtering, separate reasoning and assistant buffers,
complete-record atomicity, independent bounds, checkpoint semantics, and exact
version-selected journal decode. Prove ordinary response, tool continuation,
unsupported retained effort, failure, cancellation, resume, staged focus,
dismissal, resize, hidden/revealed transcript, and footer behavior without
model-name branches or implicit retry.

Rollback first forces native requests to `think: false` and stops accepting new
reasoning events. Then remove `/thinking`, its footer and transcript projection,
the runtime field, and the core optional value. Retain version-two decoding and
ignore already settled reasoning until all supported sessions no longer need
it; never rewrite or silently reinterpret a journal. Full removal may delete
the version-two decoder only through a later accepted migration decision, then
updates decisions 0086 and 0085, living documents, registries, ownership row,
and regressions together.

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
