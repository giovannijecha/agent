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

Task evaluation is registered independently in
`tools/evaluation-policy.json`. The manifest orders the exact bounded task set;
`tools/lib/evaluation-suite.mjs` validates its complete corpus inventory and
owns preparation, content-free grading, and closed record validation. It is
offline maintainer tooling and never expands the product workspace graph or
model-facing tool surface.

## Update or remove the streaming runtime

Update model-stream events, limits, cancellation, or cleanup only with focused
runtime regressions and decision 0005. Future adapters must prove pending-open
cancellation, close-during-read behavior, idempotent cleanup, immutable
content-free failures, total decoding of hostile boundary values, explicit
prepared-turn acknowledgement, cancellation-before-commit ordering, and
terminal-receipt acknowledgement across shutdown races. They must also prove
non-retention of candidate conversations. Runtime tool-loop changes must preserve
complete pure batch preflight, unique ordered call identities, just-in-time
planning, sequential invocation, exact per-call approval identity, planner and
handler cancellation, complete structured exchange checkpoints, and the rule
that only state newer than the last checkpoint may be discarded. Update
decision 0029 with any batch order, planning, limit, output-budget, cancellation,
or checkpoint change.

To remove runtime, first remove any CLI runtime composition and restore exact
no-model submission behavior. Then delete `packages/agent-runtime`, its root npm
and TypeScript registrations, its ownership and provider-policy entries, its
TypeScript path, and decision 0005. Regenerate derived artifacts and verify that
core, TUI, and CLI remain independently buildable.

## Update or remove the tool engine

Add a tool only after decision 0014 proves a distinct capability, current
necessity, one canonical name, and independent removal. Update its descriptor,
planner or handler, focused tests, `tools/manual-policy.json`, operator-manual
inventory, and evidence together. Never retain the previous name as an alias
during a rename. Translate provider-specific vocabulary outside the
model-facing registry.

Change a schema, risk class, limit, planner/handler contract, or built-in tool
only with core structured-value tests, schema/registry tests, runtime
loop/checkpoint tests, Node adapter success/failure/security tests, reducer
approval tests, TUI privacy tests, and decision 0008. Preserve exact `/approve`
and `/deny`, one pending call, read-only automatic execution, pure complete-batch
preflight, just-in-time effect planning, root containment, symlink denial,
incremental directory bounds, post-invocation checkpoints, content-free
failures, and only owned bounded projections or effect previews in UI.
Reintroduce process execution only
after the private decision-0016 broker passes its complete matching-platform
adversarial matrix and a later decision accepts the model-facing schema,
adapter, approval, privacy, checkpoint, and removal contract. The private
broker alone grants no production authority.

Approval-summary changes must test directional, zero-width, control, surrogate,
private-use, and line-separator input. Preserve two independent defenses: the
tool engine emits an escaped printable representation, and the CLI rejects raw
unsafe scalars before any TUI component receives the summary. Mutation effect
preview changes additionally require exact and excerpted content, digest,
omitted-count, mixed CRLF/CR/LF line metadata, strict-UTF-8, stale-identity, and
cancellation regressions.

To remove one tool, stop advertising its descriptor, then delete its handler,
focused tests, policy record, manual entry, and unused private helpers. Update
decision 0008 if the execution contract or its registry reference changes.
Verify that the remaining tool registry and text-only path build without
unrelated changes. Shared engine primitives remain only when another admitted
tool uses them.

To remove tools, stop descriptor advertisement and restore the runtime text-only
path. In that same change, replace manual-policy schema 4 with a schema that
removes the advertised tool inventory. Remove decisions 0008, 0014, 0015, 0016,
and 0036 only after their admitted surfaces and proof infrastructure are gone,
together with their ownership, required-path, and manual-evidence entries.
Remove CLI approval commands, tool activity, built-in Node handlers, imports,
declarations, and allowlist entries. Then remove the runtime dependency on
`@agent/tools` and delete its workspace from npm, TypeScript, provider-policy,
and lock registries. Remove core structured tool entries only if no remaining
adapter consumes them. Build core, TUI, runtime, and the providerless CLI after
each stage.

## Update or remove the vertical TUI framework

Update structured rows, fragments, semantic tones, text normalization, component
measurement, stack windowing, allocation, scroll reconciliation, synchronized
redraw, panel composition, split retention, horizontal insetting, side rails,
surfaces, text styles, spacers, responsive shell priority, caret
rules, or public limits only with focused boundary tests and decisions 0006,
0019, 0020, 0021, 0022, 0023, 0024, 0025, 0026, 0027, 0028, 0030, 0031, 0032,
0035, and 0044. Preserve normalized bounded spans,
exact-row fragments, content-free errors, hostile accessor containment,
deterministic priority/preference/flex allocation, and `Frame` as the final
terminal-safety boundary. Product concepts remain in CLI.

To remove the framework, first replace `chat-view` with direct validated frame
composition. Then delete component, fragment, display-text, input-line, input-area,
inline-text, panel, surface, text-style, split-line, horizontal-inset, side-rail,
component-stack, rich-row, text-block,
vertical-layout, and limit exports together
with their focused tests and decisions 0006, 0019, and 0021. If only semantic
emphasis is removed, retain the vertical framework and replace structured rows
with one validated plain-row contract before removing tone metadata, renderer
mappings, CLI tone choices, focused tests, and decisions 0019, 0021, and 0023 as
one change. Remove scrolling only after all callers return to their contained
components; then remove scroll state, scroll view, their tests, manual
references, and decision 0020. Remove synchronized
output by deleting both markers and recovery state together. Decoder, editor,
runtime, and core must stay green.

Conversation-shell changes require panel, surface, text-style, split-line,
three-column-line, horizontal-inset, side-rail, spacer, footer, composer,
transcript-role, activity, notice, empty-state, tiny-viewport, semantic-state,
and manual regressions under decisions 0026, 0027, 0028, 0039, 0040, 0041, and
0043. Keep the transcript
dominant, omit absent contextual blocks, and render only status facts already
held by the composition root or application reducer. Preserve the footer's
left/physical-center/right anchors and right-center-left narrow-width retention.
Keep stable context at left and center; reserve the right edge for the active-work
pulse, place its final cell on the composer's final surface cell, and render no
lifecycle or navigation words there. Do not recreate a static
header or lifecycle notice. Keep the draft and ordinary
conversation foreground neutral. Keep one neutral subtle background on user
turns and the composer, and keep other non-operational regions transparent. Use
italic slant for user turn grouping and the transparent content-fit surface
path for registered structured Markdown. Keep
complete one- and two-row fences compact with zero horizontal padding, larger
fences and tables at one cell, and exact `---` on the shared responsive muted
separator path. Reserve restrained steel blue for parser-recognized inline code
and language labels and lighter blues for fenced syntax only,
and reserve green, yellow, and red for authoritative success, active, and
negative state. Complete recognized fences may use only the five closed syntax
roles; unknown or unlabeled fences remain plain.
Conversation-density changes go through the one frozen CLI-owned record and
decision 0043. Keep user and composer vertical padding at one, activity
vertical padding at zero, and external rhythm at one optional row unless all
three wide, medium, and short geometry matrices change together. On clipping,
retain the activity head with tool identity and written state before optional
detail. Do not duplicate these values in presenters or generic TUI components.
A contextual notice remains one latest transparent region below activity and
above completion or the composer. Preserve the independent muted-information
and attention-warning levels, one-cell content alignment, replacement semantics,
immediate editor dismissal, exact 5,000-millisecond expiry, and identity-based
stale-event rejection. Update its command, application, view, scheduler,
arbiter, integration, and manual tests together. Do not turn notices into
transcript entries, persistent status, tool surfaces, or per-command timers.
When expiry redraws during active motion, discard and re-arm cached cosmetic
work through that successful frame without resetting the visible phase. An
input fragment or stale event that produces no redraw must leave pending motion
intact.
A future tool or integration must reuse the generic activity document rather
than add its own card. Every state uses the same borderless semantic `Surface`
with a closed success, attention, or failure background, neutral italic tool
identity, and explicit written state. Approval adds no private panel or rail.
Its view projection must continue to derive only the latest activity from the
same bounded log while a turn is active; a new tool replaces it, turn settlement
removes it, and the transcript never archives it.
Do not introduce a second archive or lifecycle model. The empty session must
remain free of welcome, suggestion, and embedded help content. To remove the
visual grammar without removing the framework, replace the CLI document
builders with one plain transcript and input row, remove approval decoration,
and then delete any
unused marker, spacer, panel, split-line, three-column-line, inset, and rail
exports, tests, decision 0028, and its policy and manual evidence.
Scrolling, Markdown, tool lifecycle, runtime, and providers remain unchanged.

Responsive-stage changes require the pure stage projection, shared wrapper,
wide, narrow, tiny-viewport, lower-shell rhythm, resize, manual, and policy
evidence to change together. Keep the minimum technical margin in one CLI
module and the one-row lower-shell rhythm in the chat composition; transcript,
activity, completion, composer, and footer must not carry private copies. To
remove the shared stage, first replace the five inset CLI wrappers with their
direct components and restore an explicit footer-left policy, then delete the
projector, its tests, decision 0039, and its ownership-policy registration.
Generic TUI components, application state, renderer, motion, and terminal
lifecycle remain unchanged.

Cursor-style changes require exact renderer initialization, partial-write,
cleanup, retry, and idempotence tests. To remove the steady vertical bar caret, delete
both the style-selection and default-style restoration sequences together;
leave caret geometry, visibility restoration, alternate-screen cleanup, and
editor behavior unchanged.

Transcript navigation changes only through decision 0024. Update decoder,
session actions, layout-plan geometry, reducer state, resize behavior, focused
tests, and manual evidence together. Navigation state must not be duplicated as
footer telemetry. To remove it, first
unwrap the transcript `ScrollView`, then remove navigation actions and history
status state.
Remove `VerticalLayoutPlan` only after no remaining caller consumes planned
geometry; direct layout rendering must continue through one allocation path.

Terminal pointer interaction changes only through decision 0045. Update SGR
decoding, renderer mode lifecycle, planned geometry, logical span references,
selection marking, editor ranges, CLI routing, monotonic timestamps, scroll,
clipboard encoding, link emission, privacy, manual evidence, Windows visual
review, and Linux visual review together. Preserve the 500-millisecond word
gesture, Shift native-selection escape hatch, exact visible HTTPS destination,
65,536-code-unit copy bound, release settlement, word-wise double-click drag,
truthful `copied`/`requested`/`failed` notices, typed failures, and cleanup retry.
Preserve exact within-chunk decoder order by applying pointer actions before
later editor mutations through the one synchronous application reducer. Route
interrupt, EOF, command, and exit through the same emission function; retain
cancellation before shutdown and deduplicate only a repeated terminal exit
effect within that chunk.
Clipboard notice presentation must retain one generation and timer, one closed
composer placement, constrained collapse, and identical transcript, composer,
and caret geometry before and after settlement. Composer pointer interaction
dismisses that generation; transcript pointer interaction does not.
Keep the Windows x64 clipboard port, UTF-16LE protocol, native C17 broker, exact
path, empty environment, two-second operation deadline, 250-millisecond cleanup
deadline, late-event guards, hidden-window ownership, bounded retry, and fixture
tests together. A partial OSC 8 or OSC 52 write must retain renderer recovery
until ST and one complete link close succeed before any later renderer output.
To remove native copy, delete that CLI boundary and
native build target together while retaining the truthful OSC 52 request path.
To remove all clipboard copy, delete both paths and application settlement while
retaining selection. To remove links, delete both the HTTPS interaction metadata
and OSC 8 emission. To remove pointer ownership, disable modes 1002 and 1006
first, then remove decoder events, logical ranges, editor pointer routing,
tests, evidence, and decision registration. Keyboard editing, transcript
navigation, rendering, Ctrl+C interrupt, and native Shift selection must remain
operational throughout removal.

Markdown syntax, delimiter completion, precedence, roles, structured surfaces,
lexical aliases, separator behavior, compact-fence density, fallback, or bounds
change only through decisions 0023, 0030, 0031, and 0032 with parser, internal highlighter, component, shared-layout, surface painter,
renderer, transcript, streaming, privacy, manual, and policy regressions. Keep
the grammar closed and line-oriented. Markdown and `TextBlock` must continue to
share normalization, wrapping, anchoring, and padding; do not introduce an AST,
extension hook, rendered HTML path, active link, image protocol, dynamic
language registry, or alternate renderer.
Preserve the 512-document and total-text checks before member iteration and
restart parser state at every document boundary.
Strict table alignment changes must continue to measure every retained header
and body cell before painting and use one shared visible width per column. The
single muted header rule must use the resulting total row extent and remain in
the same structured surface. Change its geometry, tone, tests, and decision
evidence together; do not introduce an outer border or parallel table painter.

Cell-width changes require decision 0044, focused `RichRow`, `Surface`, editor,
composer, transcript, wrapping, caret, wide-scalar, and renderer regressions,
plus visual review on supported terminals. Keep one-cell Latin ranges and exact
punctuation explicit in `cell-width.ts`; all unregistered non-ASCII scalars use
the two-cell fallback. Do not add per-component exceptions, normalize retained
text, import Unicode tables, or assign combining marks zero width without a
complete owned grapheme contract. To roll back the Latin prose profile, remove
its ranges and focused tests together and restore the documented conservative
fallback. Removing the shared width module requires a stronger accepted single
authority for every current consumer.

Shared wrapping changes only through decision 0025. Preserve one layout for
`TextBlock` and `MarkdownBlock`, explicit word and literal-cell modes, protected
structural prefixes, bounded continuation prefixes, long-token fallback, and
content-free failures. To remove word-aware wrapping, restore the single cell
policy, remove the logical-line prefix and continuation fields and regressions,
then remove decision 0025 and its manual and policy registrations. Markdown,
structured rows, scrolling, and the renderer remain independently buildable.

To remove Markdown, replace the transcript `MarkdownBlock` with `TextBlock`,
then delete `markdown-block`, `markdown-parser`, `syntax-highlighter`, their
exports and tests, decisions 0023, 0030, 0031, and 0032, and their policy and manual
evidence. First remove table recognition and its derived header rule,
structured-region identities, the
shared row-paint integration and the five syntax tones if unused; the generic
`Surface` remains for user turns and other callers. If no remaining
component uses the `emphasis` tone, remove only that renderer mapping in the same change. Decision
0027's lifecycle success and failure tones remain independent. The remaining components, structured
rows, scrolling, tool activity, input, runtime, and providers stay buildable.

Tool activity has one CLI-owned state and presentation path under decisions
0022 and 0033.
Changing its states, retention, safe fields, ordering, tones, or bounds requires
activity-log, reducer, view, narrow-viewport, privacy, cleanup, manual, and policy
updates together. Do not add a tool-specific presenter, rail, or panel; the CLI
may decorate the complete generic stack only through the shared semantic
surface. Its optional leading rhythm slot must reuse the shared CLI-owned
one-row `Spacer`, retain zero minimum height, and disappear when activity is
absent. The same rhythm path separates completion, composer, and footer. To remove the
semantic activity colors while retaining activity, map that surface to `none`,
then remove the unused surface roles and renderer mappings. To remove the
surface, first remove its single CLI slot, both rhythm slots, and lifecycle log,
then remove the generic component stack only if it has no other consumer.
The runtime tool protocol,
approval commands, tool engine, structured rows, scroll view, and renderer must
remain buildable.

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

## Update or remove multiline composition, paste, or word editing

Decision 0035, renderer lifecycle, input decoder, bounded editor, `InputArea`,
CLI composer projection, manual, and focused tests form one contract. Preserve
the one-through-six-row composer, 4,096-code-point draft bound, atomic
bracketed paste, carriage-return normalization, and Enter-only submission.
Spaces, tabs, and line feeds remain the only word delimiters. Terminal escape
encodings belong to the decoder; movement and deletion belong to `LineEditor`.
Do not reproduce either rule in session or application state.

To remove multiline composition, replace the CLI `InputArea` with `InputLine`,
then remove the area projection, component, and multiline editor cases. To
remove paste, first remove renderer paste-mode startup and cleanup, then remove
the decoder event and editor insertion path. To remove word editing, remove its
semantic events and admitted decoder mappings before deleting the matching
editor branches and tests. Remove decision 0035 and its policy/manual evidence
only after the remaining one-row input path passes the canonical verifier.
Conversation, Markdown, activity, scrolling, runtime, tools, and providers stay
independently buildable.

## Update or remove slash completion

The immutable command catalog, exact dispatcher, session selection state,
completion presenter, generic `SelectionList`, input decoder, line-editor draft
replacement, view ordering, tests, decision 0034, manual, and policy registries
form one contract. Preserve exact prefix matching, absence of aliases and
arguments, bounded non-wrapping selection, contextual Up/Down interception, Tab
completion without execution, selected-command dispatch through the canonical
path on Enter, selected-row visibility on short viewports, compact inline
descriptions, transparent rows, and absence of a passive keyboard hint.

To remove presentation only, delete the CLI completion slot and presenter while
retaining the catalog and exact dispatcher. To remove the capability entirely,
also remove session selection state, Tab handling, the generic selection list
and its export/tests, decision 0034, and its policy/manual evidence. Transcript
navigation, line editing, composer, commands, activity, and renderer must remain
independently buildable.

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

## Update or remove the workspace trust boundary

Decision 0042, `workspace-boundary.ts`, `workspace-ignore.ts`,
`workspace-read-policy.ts`, `workspace-path.ts`,
`workspace-mutation-plans.ts`, `workspace-mutation-preview.ts`, the CLI
composition root, built-in tool registration, `workspace-mutation-committer.ts`,
`platform-workspace-mutation-protocol.ts`,
`platform-workspace-mutation.ts`, the native mutation broker,
`platform-workspace-roots.ts`, its bounded protocol and native backends, exact
footer projection, focused regressions, manuals, and policy registries form one
contract. Resolve protected roots, the startup working directory, and the
immutable read policy before credentials, providers, runtime, tools, or terminal
ownership.
Keep the accepted workspace immutable, canonical, absolute, and shared; no
handler or UI path may derive a different authority root.

The native resolver accepts no argument or input and inherits no environment.
Linux must continue to query the account database for `geteuid()` and protect
`/tmp`. Windows must initialize COM, query `FOLDERID_Profile` and
`FOLDERID_LocalAppData` for the current user, derive `Temp`, and release every
operating-system allocation. The Node adapter must use the exact package-local
binary, one 8,212-byte maximum frame, 4,096-byte roots, strict scalar UTF-8, and
a five-second operation deadline followed by a 250-millisecond cleanup deadline.
It must settle even without `close` and ignore late events. Do not add an
environment fallback.

A root-selection change must prove invalid and inaccessible input, non-directory
input, symbolic-link aliases, filesystem volume roots, the exact user home, the
exact shared temporary directory, hostile protection values, content-free
failures, hostile inherited home and temporary variables, native protocol
limits, tool consumption, and exact footer display. Never add implicit Git root
discovery because it can widen the operator's selected authority.

A read-policy change must preserve mandatory built-in denial, deny-only
workspace rules, exact file/rule/line/segment bounds, strict scalar UTF-8,
non-symlink loading, immutable session snapshots, Linux exact case, and Windows
ASCII-only folding. Update grammar, loader, startup, built-in tool, privacy,
security, manual, and removal evidence together. Keep policy construction
separate from tool mechanics: inject one root-bound value and enforce it before
read observation and again after canonical resolution. Windows DOS short-name
components must fail closed rather than bypass long-name rules. Listing and
search must prune denied children while counting raw entries against existing
traversal limits. Do not let `.agentignore`, an approval, a tool call, or
process output weaken a built-in rule.

Process containment remains a separate contract. Changing the workspace root
does not prove that approved Node code is filesystem- or network-sandboxed. Any
such isolation requires its own Windows and Linux decision and adversarial
proof. The read-privacy tranche, stale-safe effect plans, and decision 0046
native mutation committer are current behavior. Plans reject changes before
approval; the committer then binds creation to the approved parent and
replacement to the approved opened file without a pathname-write fallback.
Preserve guarded `openat2`, unnamed-file publication, and write leases on Linux;
preserve handle-relative opens, exclusive sharing, and delete-pending creation
on Windows. Unsupported primitives fail closed. Do not broaden this into claims
of multi-file atomicity, crash rollback, storage durability, or a filesystem
sandbox.

A mutation-commit change must keep the request frame, strict UTF-8, 16,384-byte
path fields, 1,048,576-byte content fields, five-second operation deadline,
250-millisecond post-kill deadline, empty environment, fixed response, and late-
event suppression aligned across TypeScript and C. Prove absent creation,
no-overwrite, complete large writes, identity/content/parent drift, symlink or
reparse swaps, conflicting handles, forced termination, malformed input, and
extra arguments on both canonical platform gates. Rollback removes both write
tools before removing the committer; it never restores direct Node writes.

To remove the current root boundary, first remove every filesystem and process
capability that consumes it or replace it with a stronger accepted authority.
The platform resolver is independently removable only after another accepted
environment-independent source replaces both roots; delete its C sources,
protocol, Node adapter, tests, build output registration, and documentation
together. Never roll back to environment-derived protection.
Then remove its composition, footer claim, source, tests, policy entries, and
current-behavior documentation together. Do not leave a raw working-directory
string feeding any surviving tool.

To remove the read policy independently, first disable automatic content-bearing
read tools or replace it with a stronger accepted disclosure boundary. Then
remove policy injection, grammar and loader modules, focused and startup tests,
built-in and `.agentignore` documentation, and policy registrations together.
Never leave one read handler bypassing the common policy or silently remove only
the workspace rules while claiming that the complete disclosure contract
remains active.

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

## Update or remove task evaluation

Add or change one task only by updating its single manifest entry, `TASK.md`,
input snapshot, expected snapshot, evaluator regression coverage, and any
affected evaluation guidance together. Keep identifiers ordered and unique,
fixtures strict UTF-8 with LF endings, trees within the registered file and byte
bounds, and input distinct from expected. Corpus history is part of result
interpretation; do not compare records across a changed task revision as if the
task were identical.

Keep snapshot path bounds relative to `input/`, `expected/`, or the run
workspace rather than charging the fixed corpus prefix against a task. Preserve
cross-platform rejection of Windows device names for identifiers. Canonical
snapshots remain non-empty; an empty candidate workspace must remain gradeable
as a failed artifact with all expected paths missing.

Use `node tools/evaluate.mjs list` to inspect the catalog and `prepare`, `grade`,
and `validate-record` only as documented in `evaluations/README.md`. Preparation
must remain create-only and expose no expected files. The evaluator must never
run candidate code, inject a prompt, capture terminal output, contact a
provider, or add free-form record fields. Delete unwanted local runs manually
only after resolving their exact ignored `state/evaluations/` path; the tool
deliberately has no reset or delete command.

To remove evaluation, first delete any retained ignored runs. Then remove
`evaluations/`, `tools/evaluation-policy.json`, `tools/evaluate.mjs`,
`tools/lib/evaluation-suite.mjs`, its focused test and verifier hook, decision
0047, and all ownership, manual, architecture, engineering, security, privacy,
README, and AGENTS registrations. No product package, provider, or model-facing
tool needs replacement.

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
6. Preserve decisions 0019, 0021, 0023, and 0027 when semantic emphasis changes:
   tones stay closed, application-neutral, structured-row, and renderer-owned,
   with normalization, bounded span count, and reset after emphasized spans and
   on cleanup.
7. For pointer changes, preserve decision 0045 and exact tests for fragmented
   SGR reports, logical hit geometry, scroll-stable and cross-message selection,
   composer replacement, double-click timing and word-wise drag, Shift fallback,
   OSC 8 closure, OSC 52 bounds and ordering, Windows clipboard framing and
   native fixture rejection, truthful settlements, resize reset, partial
   initialization, cleanup retry, and the same Windows/Linux VT pointer contract.

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

## Update or remove structured process execution

`run_process` is the only admitted execute tool. Keep its model-facing schema,
exact approval projection, runner port, Node adapter, protocol codec, and native
broker as separate replaceable layers. The public token registry currently maps
only `node` to the current absolute Node executable. Never add a shell, command
string, executable path, PATH lookup, stdin, inherited environment, or
model-selected resource limit. Every invocation retains one exact, single-use
approval.

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
descriptor policy, program registry, limits, failure mapping, output contract,
or cleanup ordering only with the full Windows and Linux conformance matrix and
decisions 0016 and 0036. Roll back by removing `run_process` advertisement
before removing its handler or any implementation layer.

On Linux, preserve the admitted namespace order: the broker creates the guard
inside the run leaf with user, mount, and PID namespaces; only the mapped guard
creates the cgroup namespace rooted at that leaf. Do not merge those operations
without replacing the ownership proof. The inherited host mounts form a locked
unit in the less-privileged mount namespace and cannot be detached individually.
After mount propagation is private, the guard must create a detached, read-only
namespaced cgroup v2 view through the file-descriptor mount API and attach it
over the inherited cgroup mount. Do not replace this with a global temporary
mount point.

To remove process execution, first remove `run_process` from the built-in
descriptor registry and manual inventory. Then delete its handler, runner port,
Node adapter, protocol codec, and focused TypeScript tests. Delete
`packages/agent-cli/native/process-broker`, `tools/build-native.mjs`,
`tools/lib/native-process-broker.mjs`, the native tests, Linux bootstrap,
verifier and cleaner rules, compiler registry, decisions 0015, 0016, and 0036,
and the Linux CI job only when no proof or platform work consumes them. File
tools, runtime text chat, TUI, and terminal lifecycle remain usable throughout.

## Update or remove brand and motion contracts

Update a canonical brand asset together with `assets/brand/manifest.json`, its
digest, `docs/BRAND.md`, decision 0037, validator tests, and every published use.
Keep the passive-capability check ahead of digest acceptance. Element and
attribute names remain unqualified; colons in quoted values and text remain
data. Roll back a validator rule together with its regression and documented
contract rather than authorizing rejected capability through a new digest.
Rollback restores the complete prior manifest and asset set; never mix versions.
Removing the visual signature removes its assets, references, registry entries,
validator, tests, and decision while leaving the product identity `agent`.

Visible motion must preserve decision 0038: pure phase computation stays in
TUI, scheduling stays in CLI, one monotonic tick is pending at most, functional
events win arbitration, and the eight-frame-per-second rate remains bounded.
The pulse is the footer's only right-edge content and appears only for
`generating`, `runningTool`, or `cancelling`; idle and approval leave that edge
empty. Preserve its six-phase neutral-lead, ochre-head, neutral-trail sequence
and composer-edge alignment. Update the pulse together with deterministic phase, scheduler,
arbitration, and view tests. Remove motion by deleting its scheduler, arbiter
source, phase projection, and pulse together; retain the generic timer port while
timed notices use it. Static component rendering and
Phase 0 remain.

Timed-notice changes follow decision 0041. Change the duration only at the
notice scheduler constant and update scheduler, integration, manual, and view
regressions together. Remove timed expiry by deleting the notice scheduler,
notice arbiter source, and application tokens while retaining latest-notice
replacement and editor dismissal. Remove notices entirely only with command
feedback, reducer state, view slots, tests, manual text, and the 0041 policy
entry; the timer port remains while motion uses it.

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
