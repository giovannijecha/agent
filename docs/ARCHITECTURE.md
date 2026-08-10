# Architecture

## Goal

Keep the agent small while making every substantial capability replaceable,
testable, updateable, and removable. Modularity means explicit contracts and
one-way dependencies, not speculative packages.

## Dependency graph

```text
+------------+       +----------------+       +--------------+
| @agent/cli |------>| @agent/runtime |------>| @agent/tools |
| Node + app |       | stream + tools |       | tool engine  |
+-----+------+       +-------+--------+       +------+-------+
      |                      |                       |
      |                      +-----------+-----------+
      |                                  v
      |                            +-------------+
      |                            | @agent/core |
      |                            | domain state|
      v                            +-------------+
+------------+
| @agent/tui |
| terminal UI|
+------------+

@agent/cli -> @agent/provider-opencode-go -> @agent/runtime
                                      |----> @agent/tools
                                      +----> @agent/core
```

The diagram's direct edges are `cli -> runtime`, `cli -> tools`, `cli -> core`,
`cli -> tui`, `cli -> provider-opencode-go`, `provider-opencode-go -> runtime`,
`provider-opencode-go -> tools`, `provider-opencode-go -> core`,
`runtime -> tools`, `runtime -> core`, and `tools -> core`.

Runtime is a concrete independent foundation exercised by deterministic tests.
CLI has a real optional runtime composition edge exercised by deterministic
integration sessions. The production entry point injects OpenCode Go only when
its exact memory-only credential is supplied through the hidden CLI prompt or
environment variable; otherwise it preserves the providerless path. Executable
argument parsing and hidden input stay in CLI and complete before the generic
terminal host takes ownership. Cross-package access uses public package
surfaces; deep and relative cross-package imports are forbidden.

## Single-agent execution model

`agent` is one personal coding agent, not a multi-agent coordinator. One agent
identity and application controller own one active runtime session and one
active model decision loop. A provider adapter supplies one interchangeable
model backend to this same execution path; it does not introduce another agent
identity.

Single-agent is an identity and authority contract, not a requirement that
every supporting operation occupy one thread. A future implementation may
schedule bounded controller-internal mechanics, such as immutable frame
computation or side-effect-free I/O waits, concurrently only during a read-only
phase and over immutable snapshots. Those mechanics cannot enter the model,
runtime, or tool engine; own no context, plan, conversation, follow-up decision,
or authority; and must return results to the sole controller.
Reduction is deterministic. Any mutation excludes concurrent mechanics.
Model turns, writes, and terminal output remain serialized. Process execution
and approval decisions also remain serialized.

The current runtime is deliberately more conservative: it admits one active
model turn, one tool call per model step, sequential model/tool steps, and one
pending approval. The product does not create sub-agents, delegate work to
hidden workers, run a swarm, or merge concurrent agent conversations. Tools,
TUI components, provider adapters, and verification jobs are bounded
capabilities rather than agents. Changing this invariant requires the
replacement architecture defined by decision 0013, including new identity,
authority, scheduling, cancellation, privacy, migration, and removal contracts.

## Package contracts

### `@agent/core`

Owns immutable structured values, messages, explicit tool-call/tool-result
entries, conversations, roles, and results. It performs no terminal, model,
filesystem, network, process, environment, or clock I/O.

### `@agent/tools`

Owns the provider-neutral tool contract: bounded recursive schemas, immutable
descriptors, read/write/execute risk classes, closed registries, exact input
validation, opaque prepared calls, hostile handler-result containment, and
structured success/failure results. It has no platform I/O and depends only on
core. Policy decides whether a prepared call may run; handlers receive only the
validated input and cooperative cancellation capability.

### `@agent/runtime`

Owns the pull-based streaming-model port, cooperative cancellation, bounded
prospective turns, stream validation, cleanup outcomes, and atomic conversation
commits and sequential model/tool steps. It permits one active turn, one tool
call per model step, one pending approval, and one outstanding runtime read.
Before any tool attempt, user input and partial assistant chunks are prospective.
A completed or denied attempt checkpoints its structured call and result before
the next model step because external-effect truth cannot be rolled back. Final
assistant text remains prepared until application acknowledgement. Failure or
cancellation discards only state newer than the last checkpoint. Terminal
failure and cancellation receipts remain until application acknowledgement or
runtime stop, preserving cleanup failures across buffered-event shutdown races.
Runtime is Node-free and imports only core and tools.

### `@agent/provider-opencode-go`

Owns the strict provider wire contract: fixed model selection, request
serialization, incremental UTF-8 and SSE decoding, streamed text and single
tool-call assembly, protocol bounds, and content-free failures. It implements
the existing streaming-model port through an injected pull-based byte transport.
It owns no socket, environment access, API key, terminal, application state,
tool policy, or second agent identity. It imports only core, runtime, and tools.

### `@agent/tui`

Owns incremental terminal-key decoding, bounded single-line editing, validated
viewports and atomic frames, conservative cell measurement, immutable fragments,
bounded text and input components, bounded generic component stacks, normalized
structured rows with five closed semantic span tones, one bounded line-oriented
Markdown subset, deterministic vertical allocation, ANSI commands, and
serialized asynchronous differential rendering.
It knows nothing about agents or Node. Unknown control sequences never become
editable text; display text sanitizes controls and lone surrogates; structured
rows, fragments, and frames reject unsafe scalar or terminal-control content
independently.
Plain text and Markdown share one normalization, span-preserving wrapping,
anchoring, and padding implementation. Markdown compiles directly into
structured rows and has no AST, extension registry, HTML, links, images, or
alternate renderer. Only the renderer translates validated span tones into fixed
terminal sequences and resets style after every emphasized span and during
cleanup. Product tone choices remain in CLI. Untrusted conversation text can
trigger only the closed Markdown syntax roles; it cannot supply tone metadata,
ANSI, color, or renderer instructions.
One `MarkdownBlock` may snapshot at most 512 isolated documents inside the
existing total text bound. It inserts one literal blank row between them and
resets all fence and delimiter state at every boundary. The CLI uses one
document per role-labelled message, so user or model syntax cannot absorb a
later message or a product-owned role label.
Committed frame and viewport snapshots change only after a completed successful
output write. Conservative flags record that the alternate screen or hidden
cursor may have become visible before an attempted write, so cleanup remains
possible after partial output.

### `@agent/cli`

Owns commands, application view composition, startup, shutdown, process streams,
raw mode, the ordered terminal-event queue, bounded display-only chat state, the
single-writer application reducer, one bounded tool-activity log and presentation
path, and fair two-source event arbitration. It is the only product package
allowed to import approved `node:` APIs. It uses only
named stdin, stdout, stderr, and exit capabilities rather than a broad process
object. Reusable terminal mechanics belong behind the TUI contract. Model turn
mechanics remain behind the runtime session contract. It also implements the
registered bounded Node filesystem tools. Every path is rooted, canonicalized,
and denied on traversal or symlink crossing.
CLI also owns the exact OpenCode Go HTTPS adapter and startup configuration. It
admits only `opencode.ai:443`, never follows an application-selected origin,
keeps the API key in memory, and exposes only bytes and response metadata to the
Node-free provider package.
Direct process execution remains absent from the model-facing registry under
decision 0015. Decision 0016 adds a private C17 proof boundary inside CLI:
common framed protocol and lifecycle modules select either an owned Windows Job
Object backend or an owned Linux delegated-cgroup and namespace backend. No
production TypeScript path invokes it. Matching platform tests must prove
descendant cancellation, empty environment, bounded output, owner-loss behavior,
and complete cleanup before a later decision may add the structured tool and
approval surface.

## Lean tool harness

The model-facing tool surface is an exact capability registry, not an open-ended
command catalog. Each tool has one canonical name, one unique capability, a
current necessity statement, a risk class bound to its source descriptor, and
an independent removal path. Aliases are forbidden. A rename replaces the old
name everywhere rather than advertising both names.

Admission requires evidence that the capability is not already available with
comparable bounds, approval semantics, and model effort. Convenience or future
possibility is insufficient. Removing one tool must leave the remaining
registry, text-only runtime path, CLI, and TUI buildable without unrelated
rewrites. The exact current inventory is owned by `tools/manual-policy.json` and
verified against CLI descriptors and the operator manual under decision 0014.
Product descriptor construction is confined to the registered CLI module; the
generic tools workspace owns validation mechanics, not advertised product tools.

## Interactive terminal flow

```text
bounded terminal FIFO ----+
                           v
                   two-source arbiter -> single-writer application reducer
                           ^                         |
runtime pull event --------+                         v
     generic components + Markdown + activity stack + structured rows + scroll
                                                   |
                                                   v
                         atomic frame + synchronized differential renderer
```

The arbiter retains at most one terminal read, one explicitly armed runtime read,
and one ready event per source. The losing read is never abandoned. One event is
reduced and at most one output write is awaited at a time. The renderer enters an
alternate screen for interactive sessions, hides the cursor only during redraw,
and restores the cursor and prior screen during idempotent cleanup. A non-TTY
invocation bypasses the renderer and writes plain text containing no escape byte,
then releases any injected runtime. Every write installs a scoped output-error
listener until its completion callback, including renderer cleanup after host
shutdown.

Terminal memory limits are explicit: one input chunk is at most 65,536 UTF-16
code units, queued input is at most 131,072 code units across at most 1,024
events, the editor holds 4,096 code points, and an incomplete escape sequence is
bounded to 32 code units. Overflow discards queued input, pauses stdin, and
returns a typed failure through normal cleanup.

Tool activity is application state, not terminal state. The CLI reducer maps
validated runtime transitions into one bounded log and one generic component
stack. It retains only the current or most recently settled turn, orders newest
activity first, and exposes only tool name, risk, descriptor-declared safe scope,
and explicit state. The generic TUI owns stacking, clipping, padding, caret
translation, and hostile-component containment but knows no tool vocabulary.
Decision 0022 defines update and removal of this surface independently from the
tool engine, runtime protocol, structured rows, scroll view, and renderer.

Conversation display uses the closed Markdown subset in decision 0023. The TUI
recognizes headings, one-level lists and quotes, matched fenced code, inline
code, and strong text, then compiles them into the same bounded spans. Missing
delimiters, longer delimiter runs, and unsupported syntax remain literal.
Markdown never receives tool
activity, status, provider data, or application lifecycle state.
Every role-labelled message is a separate parser document; syntax cannot cross
from user to assistant content or between turns.

The current shell implements `/help`, `/providers`, `/approve`, `/deny`, and
`/exit`. Approval commands are contextual and authorize only the exact pending
write or execute call. Without an
injected runtime, ordinary submitted content is discarded after a generic notice
and never becomes transcript or conversation state. With a runtime, only one
turn is active: streamed text is prospective display state, completion publishes
one prepared response, and the CLI synchronously resolves its runtime commit
before publishing the bounded transcript pair. Failure or cancellation removes
prospective state after the last truthful tool checkpoint. Tool names, risk, and
state remain visible in one non-wrapping contextual TUI row. A separate bounded
approval summary exposes only descriptor-selected target and size fields; raw
content, call identifiers, and tool outputs never appear.

Active Ctrl+C requests cancellation and keeps the shell open; idle Ctrl+C exits.
Ctrl+D, terminal EOF, and `/exit` exit in every phase. Shutdown closes the
arbiter, releases display-only personal-content references, begins runtime stop
synchronously, restores terminal input, finishes the renderer, and then awaits
runtime cleanup. All cleanup failures remain separate.

### `types/` and `tools/`

`types/` contains only the Node declarations current code requires, authored
from documented runtime behavior. `tools/` is the owned trust gate: it validates
the toolchain, continuous-verification workflow, workspace graph, operator
manual, public identity and license, imports, source, derived output, tests, and
CLI. Shipped modules may use only
statically safe computed member names; dynamic collection indexing uses explicit
methods so reflective loader escapes fail closed.

The native trust gate compiles original C17 source with external Clang on the
matching Windows x64 or Linux x64 host. Generated binaries are ignored and
cleaned. Linux verification alone prepares a disposable delegated cgroup with
elevated CI setup; broker and tests remain unprivileged. The Windows and Linux
jobs are separate mandatory evidence rather than cross-compiled substitutes.

## Implemented and planned boundaries

New packages are created only with their first real implementation:

- provider adapters translate an external protocol into the runtime model port
  and are injected at the CLI composition root;
- persistence stores versioned sessions behind a repository contract;
- platform adapters isolate terminal or transport behavior when Node built-ins
  are insufficient.

Core never imports adapters, and runtime imports only the provider-neutral tool
contract. Provider transport, Node tool implementations, persistence, and UI
must each be removable without changing unrelated domain rules.

## Provider eligibility boundary

`tools/provider-policy.json` is the fail-closed registry for subscription
integrations. A technically observed OAuth flow is not eligible until the
project has independent-client authorization and an owned or expressly reusable
registration. Schema version 3 also binds the four provider-specific
authorization inquiries in `docs/PROVIDER-APPLICATIONS.md` to their research
date, official route, visibility, lifecycle state, submission date, and public
or content-free private reference. Request metadata cannot change eligibility.
While every provider is blocked,
verification rejects auth or provider workspaces by pinning the exact
provider-neutral foundation workspace set. It scans
product source, tests, and declarations and rejects ambient network access,
subscription endpoints, OAuth identifiers, foreign credential storage, broad
process access, and borrowed product identity.

The accepted direct-integration path also rejects vendor SDKs, CLIs, app
servers, ACP executables, and other foreign runtime bridges. Provider-hosted
remote model services are allowed only after `agent` identifies itself through
its own registration or a provider-documented public identity for independent
clients.

No generic auth package is created ahead of its first eligible provider. When a
provider becomes eligible, a replacing decision defines the pure protocol
contract, CLI-granted transport and cryptography capabilities, process-memory
credential vault, adapter, cancellation model, and offline conformance tests.
Core and TUI remain unaware of provider credentials and network protocols.

## Integration lifecycle

Every integration requires a documented contract, timeout and cancellation
behavior, typed failures, deterministic conformance tests, configuration schema,
security boundary, update notes, rollback, and removal instructions. Network and
process access remain unavailable unless the CLI composes an explicit capability.

## Removal paths

- Remove the CLI by first removing its registry and TypeScript references, then
  deleting `packages/agent-cli`; both libraries must still build.
- Remove or replace TUI at its package, root registries, and CLI composition;
  core remains unchanged.
- Remove the vertical component framework by replacing CLI chat composition with
  direct validated frames before deleting component modules and decision 0006;
  decoder, renderer, runtime, and core remain unchanged.
- Remove Markdown by replacing the transcript component with `TextBlock`, then
  deleting its parser, component, export, tests, decision 0023, and policy and
  manual evidence. Restore the four-tone contract only if `emphasis` has no
  remaining consumer; structured rows and the renderer remain unchanged.
- Remove interactive behavior by deleting the decoder, editor, viewport, CLI
  session, view, and Node host together; restore plain startup and the previous
  renderer contract, then remove decision 0004 from the ownership registry.
- Remove or replace core at its package and root registries; the current CLI and
  TUI remain unchanged after runtime is removed or redirected first.
- Remove runtime by first removing CLI composition, restoring unconditional
  no-model handling, and then deleting its workspace, registry, path, decision,
  and generated artifacts. Core, TUI, and the providerless CLI remain buildable.
- Remove the application loop by restoring a terminal-only serialized loop,
  removing CLI runtime composition and decision 0007, then deleting arbiter,
  chat-state, and chat-view modules without changing generic TUI or core.
- Add or remove a provider at the adapter, registries, and CLI edge; core changes
  only if its owned model contract deliberately changes.
- Remove one built-in tool by first stopping its descriptor advertisement, then
  deleting its handler, focused tests, policy and manual entries, and unused
  private helpers. Update decision 0008 if its execution contract or registry
  reference changes. The remaining registry and text-only path stay buildable
  under decision 0014.
- Remove built-in tools by first stopping descriptor advertisement, restoring
  text-only runtime steps, and deleting CLI approval/status composition. Remove
  the runtime tool dependency, then the tools workspace and structured tool
  entries only when no consumer remains. In the same removal change, replace
  manual-policy schema 3 so it removes the advertised inventory and
  `blockedTools`, including `run_process`; unregister decisions 0008, 0014, and
  `docs/decisions/0015-process-tree-containment.md`; and remove their ownership,
  required-path, and manual-evidence registrations. Core text chat and the
  providerless CLI remain buildable throughout.
- Remove the private containment proof without touching product tools by deleting
  its CLI-native source, build driver, conformance harness, tests, Linux cgroup
  bootstrap, native toolchain and verifier registrations, decision 0016, and the
  Linux CI job. `run_process` remains blocked by decision 0015.

The exact registry and derived-artifact procedure is defined in
`docs/MAINTENANCE.md`.

An architectural change requires a decision record, updated diagrams and
contracts, migration and rollback notes, and tests at every affected boundary.
