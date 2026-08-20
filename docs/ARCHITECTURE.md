# Architecture

## Scope

This document describes the current product shape: package boundaries, authority
flow, runtime composition, capabilities, provider integration, terminal
ownership, and security boundaries.

It does not explain why those boundaries were chosen or how maintainers change
them. Use:

- [decisions](decisions/README.md) for accepted rationale;
- [engineering](ENGINEERING.md) for change and evidence requirements;
- [maintenance](MAINTENANCE.md) for update, rollback, and removal procedures;
- the [operator manual](manual/README.md) for visible behavior.

## Single-agent execution model

`agent` is one local process with one identity, one application controller,
one active runtime session, and one active model decision loop. It
does not create sub-agents; providers are replaceable backends, not additional
agents.

Single-agent is an identity and authority contract, not a claim that every
mechanical operation must be synchronous. Reduction is deterministic. The sole
controller may overlap two to four explicitly registered independent read
handlers after all permissions settle. This observation cohort is not an atomic
filesystem snapshot. It excludes every owned effect, then returns all results
in provider order. Model turns, permission decisions, writes, process
execution, conversation commits, and terminal output remain serialized.

```text
terminal
   |
@agent/cli
   +-- canonical workspace and read policy
   +-- session provider, model, permissions, and tools
   +-- @agent/runtime
   |      +-- @agent/core
   |      +-- @agent/tools
   |      +-- model port
   +-- @agent/tui
   +-- @agent/provider-ollama-cloud
```

Startup does not select a provider or model. The operator configures both
inside the running TUI. Credentials, provider choice, catalog results, and
model choice live only for that process.

## Dependency graph

The workspace contains six shipped packages:

```text
@agent/core
   ^
   |
@agent/tools
   ^
   |
@agent/runtime <----- @agent/provider-ollama-cloud
   ^                              ^
   |                              |
   +------------ @agent/cli ------+
                     |
                  @agent/tui
```

Direct package edges are exact:

| Package | Direct local dependencies |
| --- | --- |
| `@agent/core` | none |
| `@agent/tools` | `@agent/core` |
| `@agent/runtime` | `@agent/core`, `@agent/tools` |
| `@agent/provider-ollama-cloud` | `@agent/core`, `@agent/runtime`, `@agent/tools` |
| `@agent/tui` | none |
| `@agent/cli` | all five packages above |

Core, tools, runtime, provider, and TUI remain Node-free. The CLI is the sole
Node and operating-system boundary.

## Package boundaries

| Package | Owns |
| --- | --- |
| `@agent/core` | deterministic domain state, immutable conversation trees, journal codecs, and immutable results |
| `@agent/tools` | tool schemas, risk classes, registry validation, and bounded handler execution |
| `@agent/runtime` | bounded streaming turns, cancellation, tool checkpoints, conversation-tree selection, and commits |
| `@agent/provider-ollama-cloud` | provider-neutral request translation and Ollama Cloud stream decoding |
| `@agent/tui` | input decoding, editors, structured rows, Markdown, layout, viewports, and frame rendering |
| `@agent/cli` | application state, commands, durable session journals, branch-aware transcript projection, provider/session state, built-in tools, terminal arbitration, filesystem/process access, and native brokers |

Dependencies point inward and public package access goes through each
`src/index.ts`. Deep cross-package imports are not part of the architecture.

## Composition and turn lifecycle

The CLI composition root performs startup in this order:

1. resolve the exact startup directory into one immutable canonical workspace;
2. load the built-in and optional root `.agentignore` read-denial policy;
3. create a new bounded local journal or restore the exact latest inactive one;
4. register the fixed tool inventory and session permission policy;
5. acquire terminal ownership and enter the conversation-first TUI;
6. accept an explicit provider and credential through `/providers`;
7. accept a model returned by the authenticated `/models` catalog.

A submitted user message is prospective until the complete turn settles. One
model response may contain one bounded ordered tool-call batch. The runtime:

1. validates the complete batch before effects;
2. plans calls serially in provider order;
3. obtains one exact permission decision for every successfully planned call;
4. executes calls sequentially, except for one admitted cohort of two to four
   independently registered reads after all cohort permissions settle;
5. checkpoints every tool result into conversation truth;
6. returns that truth before the next model decision;
7. appends one settled-turn node and commits one complete exchange when the
   turn settles.

A later model failure does not erase a completed tool checkpoint. The CLI
publishes a closed content-free failure family and retains the confirmed tool
truth. Read-cohort settlements are buffered and emitted in provider order.
There are no implicit retries, concurrent effects, fallback providers, or
parallel conversations.

If shutdown takes ownership after a checkpoint, runtime stop returns cleanup
truth separately from the immutable checkpointed turn it settles. The sole CLI
controller attempts that node's journal append before journal close and never
attempts the same node twice. Shutdown therefore cannot discard confirmed tool
truth or cause a completed effect to be replayed on resume.

Core retains a bounded immutable tree whose content-free root is node zero.
Each other node owns one completed turn or one checkpointed incomplete turn and
one parent identity. Runtime exposes exactly one selected root-to-node path as
the linear conversation sent to the model. Selecting an earlier node while
idle and submitting another task appends a child there without deleting any
existing descendants. Alternate branches are inert retained data, not
parallel conversations, and selection never replays a tool or effect.
The core snapshots each public turn delta through its bounded indexed surface
before validation, measurement, and storage; caller iteration is never used.
The CLI mirror cannot reject an accepted tree transition because of its bounded
checkpoint markers or separators, and `/timeline` keeps all retained identities
navigable while projecting at most 32 insertion-ordered rows at once.

Interactive `agent` creates one version-two per-user local journal outside the
workspace. Only complete settled turns, their optional separately bounded
native reasoning, and the selected node identity cross that CLI-owned
boundary. `agent resume --latest` validates the newest inactive version-one or
version-two journal for the exact workspace, rebuilds the immutable tree and
transcript, and creates a separate version-two continuation before providers,
tools, or terminal ownership. Credentials, catalogs, provider/model selection,
thinking effort and display settings, permissions, drafts, provisional turns,
activity, and notices
remain process-only. A final
truncated line recovers only its complete prefix. A complete final turn whose
head is exactly one journal revision behind is selected only when its parent is
that previous head; current-revision selections remain authoritative and every
other mismatch fails closed. Evaluation-receipt and non-TTY runs create no
journal.

Every accepted journal file is synchronized before publication. On POSIX, the
CLI also synchronizes a staged session directory before publishing it and the
containing directory after every head replacement, session publication,
retirement, or lock transition; unsupported directory synchronization fails
closed. Each launcher publishes one uniquely named, never-reused workspace
admission token before scanning the bounded token set. Scan, retention, resume
selection, and continuation publication proceed only while no other live token
exists. Overlapping live contenders fail busy without waiting and may all fail;
an operating-system-proven stale token can be removed only through its unique
pathname, so reclamation cannot delete a successor. While admitted, every new
session receives a creation value strictly greater than the newest validated
session even when the wall clock ties or moves backward.

Each encoded tool input and result retains the same independent structured-value
limits enforced when that payload entered the runtime; sibling payloads do not
share a parser budget.

The principal runtime bounds are fixed:

| Boundary | Limit |
| --- | ---: |
| user message | 4,096 code points |
| one streamed text delta | 16,384 code units |
| one assistant response | 262,144 code units |
| one streamed reasoning delta | 16,384 code units |
| one model-response reasoning value | 262,144 code units |
| one stream | 4,096 events |
| one parallel read cohort | 2-4 calls |
| one selected conversation path | 256 messages / 1,048,576 code units |
| retained conversation tree | 128 settled turns / 256 messages / 1,048,576 code units |
| one local session journal | 16,777,216 UTF-8 bytes |
| retained sessions per workspace | 32 validated directories / 64 scanned |
| workspace admission scan | 64 exact tokens |
| one turn | 32 model/tool steps |

## Capability surface

The advertised model-facing inventory is exactly:

| Tool | Capability | Default permission |
| --- | --- | --- |
| `read_file` | bounded complete or line-projected file observation | Allow |
| `list_directory` | bounded directory observation | Allow |
| `search_text` | bounded text search under the read policy | Allow |
| `apply_patch` | one object-bound structured text commit | Ask |
| `manage_path` | one object-bound namespace commit | Ask |
| `shell` | one bounded native-shell command execution | Ask |

The tool registry, schemas, planners, permissions, and handlers remain separate
authorities. A permission approves one exact planned call; it cannot widen a
schema, path, program, limit, disclosure policy, or native committer.

Registration separately marks a direct read handler as `independentRead`.
Only `read_file`, `list_directory`, and `search_text` carry that declaration.
The runtime does not infer concurrency from the `read` risk alone; mixed,
single, unregistered, and oversized batches remain serial.

`apply_patch` binds approval to the observed object or absence, exact ordered
hunks, and state digests. `manage_path` exposes `operation`, `path`, and the
move-only `destination` directly in one flat closed object. One provider-neutral
bounded discriminant validates the three exact operation field sets during
complete batch preflight while the provider projects no nested request envelope
or schema combinator. The tool owns only `create_directory`, `move`, and
`remove`; Linux currently admits only directory creation. `shell` admits one
exact command and a workspace-relative working directory. The CLI fixes Bash
without profiles on Linux or Windows PowerShell without profiles on Windows,
projects only the decision-0073 environment allowlist, excludes provider
credentials, and retains fixed whole-tree containment and execution bounds.
Approved shell code has the launching user's filesystem and network authority.

The read tools share one deny-only disclosure policy. Sensitive built-in paths
are always denied; an optional root `.agentignore` can add denials but cannot
grant access.

## Provider boundary

Ollama Cloud is the sole admitted direct provider. The integration is split
between:

- the Node-free package adapter, which builds bounded requests, normalizes the
  admitted native Ollama message and tool-call variants, and decodes the
  provider stream into runtime events;
- the CLI transport, which owns HTTPS, exact origins, bearer authentication,
  response limits, inactivity limits, and wall-clock deadlines.

The session has no default provider or model. `/providers` is the only
interactive credential and provider-selection path. `/models` performs one
authenticated catalog request and exposes only bounded entries whose returned
`name` and `model` fields are equal. The latest process-memory catalog is
the model-availability authority; it does not locally infer account entitlement,
credit, quota, or per-request provider capacity.

There is no redirect, alias, retry, router, or fallback. Provider errors cross
the product boundary only through closed content-free failure families. A
non-successful chat status is classified by HTTP outcome before the response is
closed, without retaining its number or reading its body. Every protocol
rejection before stream admission, including an unexpected status class,
invalid content type, or malformed transport opening, is the unphased
`model/open/protocol` outcome because no response stream was admitted.
The adapter treats a missing, null, or empty native `tool_calls` member as no
contribution, validates every non-empty call into one bounded ordered batch,
and writes settled assistant tool history in one canonical native
`type`/`function.index` form. Protocol failures on an opened stream identify
only the closed
`transport`, `framing`, `envelope`, `message`, `tool-call`, `finish`, or
`terminal` phase; they never expose provider content or authorize
model-specific behavior.
One valid terminal record completes the stream normally. A clean HTTP end also
completes it only after the decoder has accepted a non-empty native thinking,
content, or tool-call contribution. Empty clean streams fail at `terminal`;
incomplete framing and aborted or errored transports retain their own failure
boundaries. Any non-null finish reason is checked before those contributions
can change decoder state and is admitted only as `stop` on `done: true`.
Every native record validates thinking, content, and its complete tool-call
member against staged state before committing any of them to the stream.
Rejecting any record terminalizes that decoder: later records and a later clean
HTTP end cannot recover, contribute, or complete the response.
Any transport, UTF-8, NDJSON, or native-record failure returned by an admitted
read also terminalizes the owning stream before control returns. A later read
cannot consult the transport, framer, or decoder and returns only the closed
terminal failure, so accepted partial evidence can never become completion.
Credentials and catalog content never enter the transcript, logs, fixtures, or
documentation.

See [providers](PROVIDERS.md) and [privacy](../PRIVACY.md) for the public
contract.

### Bounded thinking stream

Decisions 0086 and 0085 define one optional provider-neutral reasoning stream.
`/thinking` is an idle two-row session editor available only after one
configured provider and one model are selected. Effort is exactly `off`, `low`,
`medium`, or `high`; display is exactly `off` or `on`; both default to `off`.
The controller captures effort with one turn and every continuation in that
tool loop uses the same value. Both settings remain unchanged through accepted
model selections in the same process. There is no model-name inference,
implicit retry, replay, compatibility parsing, router, or fallback; rejection
by a newly selected model fails the turn without mutating either setting.

Ollama requests map effort exactly to `think: false`, `"low"`, `"medium"`, or
`"high"`. The adapter validates the entire native record before emitting a
separate `reasoningDelta`; assistant text never becomes reasoning. Runtime
stages and bounds reasoning independently from answer text, attaches it to the
exact assistant message or tool exchange, and commits it only with the
corresponding settled conversation node. Failed or cancelled prospective
segments are discarded. Tool-loop and resumed selected-path history preserve
settled reasoning where the native provider requires it.

Display is owned only by the CLI. `on` projects reasoning as its own muted
document above assistant text; `off` filters every reasoning document from the
selected transcript without deleting the underlying state. The TUI remains
agent-agnostic and uses no parallel renderer. Journal version two is unchanged:
it requires an explicit string-or-null reasoning member on assistant records;
the version-one decoder remains exact, and a resumed version-one source
produces a separate version-two continuation.

## Terminal boundary

The TUI is conversation-first. The transcript is dominant; completion,
activity, notices, one interaction dock, and the footer are contextual regions
projected from authoritative application state.

`@agent/tui` owns generic, deterministic terminal mechanics:

- semantic rows, surfaces, wrapping, Markdown, highlighting, and layout;
- the bounded line editor, generic selection list, and six-row interaction dock;
- input decoding, pointer semantics, scroll geometry, and frame diffs;
- ANSI emission and terminal-width rules.

`@agent/cli` owns product meaning:

- transcript entries, `/thinking` mode, `/timeline` branch selection, durable journal settlement, command dispatch, and provider/session state;
- one latest ephemeral activity or notice;
- permission decisions and tool lifecycle projection;
- terminal/runtime event serialization and cancellation;
- filesystem, process, clipboard, and native-platform effects.

The ruled interaction dock has one focus owner. Editor focus renders the draft
or concealed provider credential and admits the frame's one caret. Selection
focus replaces that editor body with the provider, model, permission,
pending-tool, or timeline list, retains at most one header plus five visible
items, and admits no caret. A composer-placed transient notice remains visible
in selection focus through that header's trailing edge, temporarily replacing
its ordinary context without restoring the hidden draft or another editor. The
notice side has retention priority over the selector title when width is scarce.
During concealed credential entry, the same notice temporarily replaces the
non-secret entry guidance without exposing credential text.
Focus and composer-pointer authority are separate:
only a visible draft admits composer pointer effects; selection focus and the
concealed credential editor admit none while transcript selection and scrolling
remain active. Slash completion stays above the dock because it remains an
editor-owned draft operation. The immutable render projection carries both the
visible dock focus and composer-pointer authority into pointer reduction; one
 coalesced input chunk never reclassifies stale geometry from newer application
 state.
Contextual provider, model, session-permission, and timeline selectors retain
selection focus through ordinary text and editing keys. Up and Down navigate,
Enter keeps the selector's acceptance meaning, Escape or Ctrl+C cancels, and
every accepting or cancelling event is consumed without touching the retained
draft. Page navigation and EOF remain global. The Node terminal host retains at
most one trailing raw Escape byte for 30 milliseconds so fragmented terminal
sequences stay ordered; an uncontinued byte returns through the same event queue
as an explicitly settled Escape for the generic decoder.

Tool activity never becomes transcript content. User and assistant messages
remain structured role entries but render without redundant role labels.
Only the renderer emits ANSI and owns alternate-screen, paste, mouse, caret,
and cleanup lifecycles. On initialization it selects one terminal-controlled
blinking block for the frame's logical caret; it owns no blink timer or cursor
glyph. It shows the hardware cursor only when that logical caret is visible in
the current viewport; a frame without a visible caret keeps the cursor hidden
instead of synthesizing a position on other content. Cleanup restores the
terminal-default style and cursor visibility.

User entries compose one stage-wide transparent `Surface` with the shared
one-cell content inset and no rail, marker, border, or background. Generic
selection uses only the selected-row `accent` foreground. Patch previews use
the `diffRemoved` red foreground for removed rows and
the `diffAdded` green foreground for added rows.

## Platform and security boundary

The CLI establishes the workspace boundary before credentials, provider
selection, tools, or terminal ownership. Volume roots, the exact user home, and
the shared temporary directory fail closed.

Portable TypeScript never performs pathname mutation after authorization.
Owned native C17 brokers provide:

- canonical protected-root discovery;
- whole-process-tree containment for `shell`;
- object-bound text commits;
- object-bound namespace commits;
- Windows clipboard transfer.

Unsupported operating-system or filesystem primitives fail closed. Session
records are synchronized and recover one interrupted final append or its exact
one-revision head replacement window, but these guarantees are not a filesystem
sandbox, general transaction, rollback system, encrypted vault, or arbitrary
crash-recovery protocol.

The repository follows a clean-room ownership boundary. External runtime and
platform documentation may define contracts; foreign source, prompts, tests,
identifiers, component structures, and implementation patterns are not product
inputs. Approved inspections are pinned in
[ownership](OWNERSHIP.md).

## Repository control plane

Repository policy is executable:

| Authority | Registry or verifier |
| --- | --- |
| package graph and built-ins | `tools/ownership-policy.json` |
| documentation topology | `tools/documentation-policy.json` |
| manual coverage | `tools/manual-policy.json` |
| publication metadata | `tools/publication-policy.json` |
| provider admission | `tools/provider-policy.json` |
| evaluation corpus | `tools/evaluation-policy.json` |
| brand assets | `assets/brand/manifest.json` |

The canonical verifier validates source ownership, package edges,
documentation, generated-artifact hygiene, builds, native builds, and the CLI
smoke path without contacting a provider or reading credentials.

## Authority routes

| Question | Canonical owner |
| --- | --- |
| What does the product do for an operator? | [operator manual](manual/README.md) |
| What is the current system shape? | this document |
| How must a change be developed and proved? | [engineering](ENGINEERING.md) |
| How is a subsystem updated, rolled back, or removed? | [maintenance](MAINTENANCE.md) |
| Why was a lasting boundary accepted? | [decisions](decisions/README.md) |
| Which provider and privacy guarantees are public? | [providers](PROVIDERS.md) and [privacy](../PRIVACY.md) |
| Which external material was inspected? | [ownership](OWNERSHIP.md) |
| How are maintained tasks evaluated? | [evaluation](../evaluations/README.md) |
