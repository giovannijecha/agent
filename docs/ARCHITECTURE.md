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

@agent/cli -> @agent/provider-opencode-go  -> @agent/runtime
           -> @agent/provider-opencode-zen -> @agent/runtime
                                               |----> @agent/tools
                                               +----> @agent/core
```

The diagram's direct edges are `cli -> runtime`, `cli -> tools`, `cli -> core`,
`cli -> tui`, `cli -> provider-opencode-go`, `cli -> provider-opencode-zen`,
each provider adapter to `runtime`, `tools`, and `core`,
`runtime -> tools`, `runtime -> core`, and `tools -> core`.

Runtime is a concrete independent foundation exercised by deterministic tests.
CLI has a real optional runtime composition edge exercised by deterministic
integration sessions. The production entry point builds one bounded provider
session from only the OpenCode Go and OpenCode Zen backends. Environment
variables may preload independent memory-only credentials, but the entry point
never selects a provider or model. The generic terminal host takes ownership
before the CLI-owned `/providers` credential and selection flow and `/models`
catalog flow. Until both selections settle, normal text follows the no-model
path. Executable argument parsing stays in CLI. Cross-package access uses public package
surfaces; deep and relative cross-package imports are forbidden.

## Brand and clean-room presentation

The canonical product identity is `agent`; lowercase `.agent` is the visual
signature only. Canonical supplied assets and immutable digests live in
`assets/brand/manifest.json`.

Reference inspection may establish only observable user outcomes. It cannot
supply component hierarchies, module boundaries, identifiers, styling values,
animation timings, redraw algorithms, or source structure.

Animation phases are pure TUI inputs; scheduling remains at the CLI platform
boundary. The owned monotonic scheduler retains at most one pending tick,
operates at eight frames per second, re-arms only after a successful render,
and yields to terminal and runtime events. The active-work footer pulse keeps
constant cell geometry. Phase 0 is its deterministic static baseline.

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

The current runtime is deliberately conservative: it admits one active model
turn, one bounded ordered tool-call batch per model step, sequential handler
execution, and one pending approval. The complete batch is one decision by the
sole controller, not several agents. The product does not create sub-agents, delegate work to
hidden workers, run a swarm, or merge concurrent agent conversations. Tools,
TUI components, provider adapters, and verification jobs are bounded
capabilities rather than agents. Changing this invariant requires the
replacement architecture defined by decision 0013, including new identity,
authority, scheduling, cancellation, privacy, migration, and removal contracts.

Decision 0061 adds a provider-side convergence boundary without changing that
generic runtime shape. Both OpenCode adapters request at most one call per response, so
the model observes each checkpointed result before it authors the next call and
can reassess every remaining part of the same user goal. If the compatible
service nevertheless returns a bounded batch, the decoder and runtime retain
the defensive sequential path. No tool handler executes concurrently and no
completed effect is retried implicitly.

## Package contracts

### `@agent/core`

Owns immutable structured values, messages, complete ordered tool exchanges,
conversations, roles, and results. It performs no terminal, model,
filesystem, network, process, environment, or clock I/O.

### `@agent/tools`

Owns the provider-neutral tool contract: bounded recursive schemas, immutable
descriptors, read/write/execute risk classes, closed registries, exact input
validation, opaque prepared and planned calls, bounded concrete effect plans,
hostile planner/handler-result containment, and structured success/failure
results. It has no platform I/O and depends only on core. Platform planners and
handlers receive only validated input and cooperative cancellation. Only an
owned planned call may be denied or executed.

### `@agent/runtime`

Owns the pull-based streaming-model port, cooperative cancellation, bounded
prospective turns, stream validation, cleanup outcomes, and atomic conversation
commits and sequential model/tool steps. It permits one active turn, one bounded
ordered tool-call batch per model step, one pending permission decision, and one
outstanding runtime read. It validates every call before effects, assigns
bounded per-call output capacity, plans each call just in time after the prior
call settles, executes handlers sequentially, and checkpoints only a complete
call/result exchange. A failed effect plan records a failed attempt without an
operator prompt; every valid request waits for one exact CLI decision before
denial or invocation.
Before any tool attempt, user input and partial assistant chunks are prospective.
After every selected call has a truthful result, one complete ordered exchange
is checkpointed before the next model step because external-effect truth cannot
be rolled back. Final
assistant text remains prepared until application acknowledgement. Failure or
cancellation discards only state newer than the last checkpoint. Terminal
failure and cancellation receipts remain until application acknowledgement or
runtime stop, preserving cleanup failures across buffered-event shutdown races.
Runtime is Node-free and imports only core and tools.

### `@agent/provider-opencode-go` and `@agent/provider-opencode-zen`

Owns the strict provider wire contract: closed validated model selection, request
serialization, incremental UTF-8 and SSE decoding, streamed text and indexed
tool-call batch assembly, protocol bounds, a one-call request policy, and
content-free failures. Each implements
the existing streaming-model port through an injected pull-based byte transport.
It owns no socket, environment access, API key, terminal, application state,
tool policy, or second agent identity. Each imports only core, runtime, and tools.
The CLI-owned provider session delegates one open to exactly the selected
backend; it does not retain a second runtime, retry through the other adapter,
or merge credential slots.

### `@agent/tui`

Owns incremental terminal-key, bracketed-paste, and bounded SGR pointer
decoding, bounded editing,
one-row and multiline projected input components, validated
viewports and atomic frames, owned cell measurement, immutable fragments,
bounded text and input components, bounded generic component stacks, normalized
structured rows with closed semantic span tones, one independent closed
selection mark, validated logical text interaction, and six closed surface
roles, one bounded line-oriented Markdown subset with an exact semantic
separator, one bounded internal lexical highlighter, one generic bordered
panel, one generic paired horizontal-rule frame, one generic split line,
dynamically centered horizontal insets, one generic solid side rail, one bounded
generic selection list over one-row components whose selected row alone receives
the closed accent foreground,
deterministic vertical allocation, ANSI commands, and serialized asynchronous
differential rendering. One immutable layout plan
exposes measured and assigned slot rows, then renders that exact allocation;
direct layout rendering delegates to the same path.
It knows nothing about agents or Node. Unknown control sequences never become
editable text; display text sanitizes controls and lone surrogates; structured
rows, fragments, and frames reject unsafe scalar or terminal-control content
independently.
One cell-width module feeds structured rows, wrapping, Markdown, tables,
surfaces, editors, carets, clipping, and rendering. Printable ASCII, the closed
structural glyph set, and the exact precomposed Latin prose ranges and
punctuation in decision 0044 occupy one cell. Every other non-ASCII scalar keeps
the conservative two-cell fallback. For every changed structured row,
differential rendering first paints each maximal contiguous non-transparent
surface run across its exact logical cell extent with ASCII spaces under that
run's authoritative surface, returns to the row origin, and then writes its
content. Runs may begin after a shared inset; transparent gaps and differently
surfaced runs remain separate. This renderer-owned operation preserves physical
rectangles without changing measurement, retained text, or the shared width
authority. The profile performs no normalization,
locale lookup, terminal probing, or grapheme clustering, and no consumer may
carry a private exception.
Plain text and Markdown share one normalization, word-aware span-preserving
wrapping, anchoring, and padding implementation under decision 0025. Logical
lines declare structural prefixes, continuation prefixes, and either word or
literal cell wrapping. Long tokens fall back to cells; lists hang their marker
width, quotes repeat their rail, and fenced code reserves its declared zero- or
one-cell surface padding before literal wrapping. The exact `---` separator
expands only after the viewport width is known. Markdown compiles directly into
structured rows and has no
AST, extension registry, rendered HTML, Markdown link destination, images, or
alternate renderer. Exact visible ASCII HTTPS text may carry only an identical
validated OSC 8 target under decision 0045. Complete recognized code fences may
use the internal line-oriented
highlighter; it has closed language aliases and roles, performs no I/O or code
execution, and falls back to plain text for unknown labels or excessive spans.
Only the renderer translates validated span tones into fixed
terminal sequences and resets style after every emphasized span and during
cleanup. Product tone choices remain in CLI. Untrusted conversation text can
trigger only the closed Markdown syntax roles; it cannot supply tone metadata,
ANSI, color, or renderer instructions.
One `MarkdownBlock` may snapshot at most 512 isolated documents inside the
existing total text bound. It inserts one literal blank row between them and
resets all fence and delimiter state at every boundary. The CLI uses one
document per structured role entry, so user or model syntax cannot absorb a
later message. Roles select only the CLI-owned container treatment; redundant
role labels are not inserted into conversation content.
Committed frame and viewport snapshots change only after a completed successful
output write. Conservative flags record that the alternate screen or hidden
cursor may have become visible before an attempted write, so cleanup remains
possible after partial output.

### `@agent/cli`

Owns commands, application view composition, startup, shutdown, process streams,
raw mode, the ordered terminal-event queue, bounded display-only chat state, the
single-writer application reducer, one bounded tool-activity log and presentation
path, the responsive conversation shell and truthful status footer,
application-owned transcript navigation and pointer selection, stable display
document identities, monotonic input timestamps, and fair two-source event
arbitration.
One frozen CLI-owned conversation-density record supplies the closed content
inset, flush offsets, composer-rule rows, and rhythm rows to the existing
presenters and composer pointer projection. The focused composer retains one
full-width rule row above and below its transparent content, activity surfaces
have zero vertical padding, and external lower-shell rhythm remains one
optional row. User entries consume the shared content inset directly through a
transparent `Surface`; they add no rail, marker, border, or background.
Activity stack clipping retains its identity/state head before optional detail.
It is the only product package
allowed to import approved `node:` APIs. It uses only
named stdin, stdout, stderr, and exit capabilities rather than a broad process
object. Reusable terminal mechanics belong behind the TUI contract. Model turn
mechanics remain behind the runtime session contract. It also implements the
registered bounded Node filesystem tools. Before credentials, providers,
runtime, tools, or terminal ownership, one CLI-owned boundary canonicalizes the
exact startup directory. It rejects filesystem volume roots, the exact user
home, and the exact shared temporary directory, and it never walks upward to a
Git root. One immutable canonical absolute path feeds the footer, filesystem
handlers, and process working-directory resolution. Model-selected relative
paths are then denied on traversal or symbolic-link crossing; handlers do not
replace or independently recanonicalize the authority root.

The CLI next constructs one immutable `WorkspaceReadPolicy`, still before
credentials, provider/runtime construction, tool registration, or terminal
ownership. A pure grammar module compiles the closed, bounded, deny-only rules;
the CLI loader owns filesystem observation and binds the result to the branded
root. Built-in sensitive-path rules are mandatory and one optional root
`.agentignore` may only add denials. `read_file` checks a normalized lexical
target before filesystem observation, `list_directory` filters children, and
`search_text` prunes directories and files before opening them. Raw discovered
entries retain the existing work bounds. The policy is injected into the
existing tool registry and creates no tool, package, provider, or alternate path
resolver.

Decision 0051 keeps `read_file` as that one read capability while adding a pure
CLI-owned logical-line projection after the accepted bounded observation. The
optional one-based start and bounded count never alter path resolution or
policy. Results retain exact source terminators and report actual start,
returned lines, total lines, and whether more lines remain. The complete file
is still observed once within its existing bound; projection reduces provider
context and does not claim random-access filesystem reading.

Protected home and temporary roots come from one separate CLI-owned native
resolver. Linux uses the effective-user account database and `/tmp`; Windows
uses the current-user Profile and Local AppData Known Folders. The Node adapter
starts that exact package-relative executable with no arguments, shell, input,
or inherited environment, accepts one strictly decoded bounded binary frame,
and enforces a five-second operation deadline plus a 250-millisecond cleanup
deadline after termination is requested. Missing or late `close` cannot keep or
later mutate the content-free result. Platform discovery remains separate from
the boundary's filesystem canonicalization and exact-root denial.

Approved `apply_patch` plans cross a separate `WorkspaceMutationCommitter` port.
The pure patch layer resolves one absent-target creation or one ordered set of
unique, non-overlapping exact-text hunks against the complete observed source.
The CLI adapter then encodes one immutable create or replace commit plan,
launches the exact package-local C17 broker with no arguments or environment,
and accepts one fixed content-free settlement. Windows binds relative opens to
directory handles, reserves creation with no replacement and delete-pending
cleanup, and replaces through one exclusive opened object. Linux guards lookup
with `openat2`, publishes a complete `O_TMPFILE` without replacement, and holds
a write lease while comparing and replacing one opened object. The planner no
longer contains a portable write path. Missing exclusion or publication
support fails closed, and late process events cannot create a second result.

`manage_path` planning first asks its separate `WorkspaceNamespaceCommitter`
port whether the validated operation is supported. A negative capability
settles without path-specific planning, namespace observation, preview, or
authorization. A supported plan produces one immutable create-directory, move,
or remove effect bound to canonical paths, object kinds and identities, parent
identities, and destination absence, then crosses the same port exactly once.
The CLI adapter launches the exact package-local C17 broker with no arguments
or environment and accepts one fixed content-free settlement. Linux exposes
only directory creation, uses guarded handle-relative traversal and
verified-parent `mkdirat`, and retains a native `unsupported` guard for move and
remove. Its admitted rename and unlink APIs cannot bind an expected source
identity to the namespace mutation. Windows uses handle-relative `NtCreateFile`, native rename
information, and disposition information for all three operations. The planner
exposes no overwrite, merge, recursive removal, implicit parent creation,
self-descendant move, or portable pathname fallback. Missing namespace
primitives and stale state fail closed.

CLI also owns the exact OpenCode HTTPS adapters, public catalog adapter, and
session configuration. They admit only `opencode.ai:443` and the registered Go
or Zen catalog and Chat Completions paths, never follow an
application-selected origin, keep each API key in its independent memory slot,
and expose only bytes and response metadata to the corresponding Node-free
provider package. Public catalog GETs carry no credential. Their bounded strict
IDs are intersected with the matching owned allowlist before adapter creation.
Decision 0036 admits one model-facing execute capability, `run_process`, through
the CLI-owned C17 broker proven by decisions 0015 and 0016. The structured tool
accepts one registered program token, literal arguments, and a rooted working
directory; it exposes no shell, executable path, PATH lookup, stdin,
environment, or model-selected limit. Linux targets receive an empty
environment. Windows targets receive only `SystemRoot`, queried directly by the
broker through the operating system API so Node can initialize without
inheriting user state. Matching platform tests prove descendant cancellation,
bounded output, owner-loss behavior, isolated target environment, and complete
cleanup. The Node adapter observes the broker control-input stream from spawn
through its first failure or close; a write racing broker shutdown is reduced
to the invocation's existing typed failure and cannot escape the serialized
lifecycle. The capability runs terminating commands only and never retains a
background or persistent service. This is descendant lifecycle containment,
not a machine sandbox: approved Node code still has the launching user's
filesystem and network authority outside its selected initial directory.

Decision 0050 makes the CLI-owned program registry the single authority that
maps the current exact `node` token to the absolute current Node executable.
The `run_process` descriptor and handler consume that same registry. It also
records the exact complete six-tool inventory: `read_file`, `list_directory`,
`search_text`, `apply_patch`, `manage_path`, and `run_process`. Each of the
three bounded read domains, text patching, namespace management, and execution
has one canonical descriptor and independently removable implementation. An
actual sandboxed command-language tool may replace the execute domain only
after a separate cross-platform isolation proof; it cannot coexist with
`run_process` as an overlapping alias.

## Lean tool harness

The model-facing tool surface is an exact capability registry, not an open-ended
command catalog. Each tool has one canonical name, one unique capability, a
current necessity statement, a risk class bound to its source descriptor, and
an independent removal path. Aliases are forbidden. A rename replaces the old
name everywhere rather than advertising both names.

Built-in filesystem descriptors explicitly advertise `.` as the exact
workspace-root representation while retaining a required workspace-relative
`path`. The shared provider-neutral instruction requires all advertised fields;
adapters do not repair or retry malformed calls. Tool preparation retains only
the closed unknown-name, invalid-input, or invalid-identity reason, which the
CLI projects as a content-free `tool/invalid-call/...` code before any planner,
permission, or handler effect.

Admission requires evidence that the capability is not already available with
comparable bounds, approval semantics, and model effort. Convenience or future
possibility is insufficient. Removing one tool must leave the remaining
registry, text-only runtime path, CLI, and TUI buildable without unrelated
rewrites. The exact current inventory is owned by `tools/manual-policy.json` and
verified against CLI descriptors and the operator manual under decision 0014.
Decision 0050 owns that complete inventory and requires any future
authority-domain replacement to end with one canonical descriptor and
independently removable implementation.
Product descriptor construction is confined to the registered CLI module; the
generic tools workspace owns validation mechanics, not advertised product tools.

## Interactive terminal flow

```text
bounded terminal FIFO ----+
                           v
                  two-source arbiter -> single-writer application reducer
                           ^                         |
runtime pull event --------+                         v
 planned layout + logical hit map + Markdown + activity + scroll + editor range
                                                   |
                                                   v
                         atomic frame + synchronized differential renderer
```

The arbiter retains at most one terminal read, one explicitly armed runtime read,
and one ready event per source. The losing read is never abandoned. One event is
reduced and at most one output write is awaited at a time. The renderer enters an
alternate screen for interactive sessions, enables bracketed-paste mode,
DEC 1002 button-event tracking, and 1006 SGR mouse mode, hides the cursor only
during redraw, selects a steady vertical bar caret for the interactive session, and
restores mouse modes, paste mode, the terminal-default cursor style, cursor
visibility, and the prior screen during idempotent cleanup. Unsupported
terminals may ignore the paste or shape command without
changing editor geometry or lifecycle truth. A non-TTY
invocation bypasses the renderer and writes plain text containing no escape byte,
then releases any injected runtime. Every write installs a scoped output-error
listener until its completion callback, including renderer cleanup after host
shutdown.
Before a write containing OSC 8 or OSC 52, the renderer marks a terminal string
as possibly active. A failed write must be closed by ST and one complete OSC 8
close before any later frame, copy, synchronized-output recovery, or terminal
mode cleanup proceeds.

Terminal memory limits are explicit: one input chunk and one bracketed-paste
payload are each at most 65,536 UTF-16 code units, queued input is at most
131,072 code units across at most 1,024 events, the editor holds 4,096 code
points, the composer exposes at most six content rows, and an incomplete escape
sequence is bounded to 32 code units. Overflow discards queued input, pauses stdin, and
returns a typed failure through normal cleanup.

Pointer interaction follows decision 0045. The latest successful layout plan
returns exact transcript and composer allocations with the frame that was
rendered. Transcript spans carry stable document identities and pre-wrap logical
offsets through surfaces, wrapping, clipping, scrolling, and frame assembly;
padding and continuation indentation carry no text reference. The application
stores anchor and focus in that logical space, so its existing `ScrollState` may
move while a selection remains meaningful. Resize clears geometry-dependent
selection. Composer cells resolve through the same `LineEditor`, whose one range
contract also owns word selection, word-wise extension, replacement, deletion,
paste, and submission cleanup. No screen transcript, second editor, or platform
pointer path exists.
CLI gesture state is isolated in `terminal-interaction.ts` behind a narrow
editor interaction port; the application reducer retains only arbitration,
scroll reconciliation, notices, and ordered effects.
The session invokes that reducer synchronously at each decoded action boundary,
so a pointer mutation cannot be overtaken by later text, deletion, or paste from
the same terminal chunk. This remains one serialized input transaction rather
than a deferred pointer queue or second editor path. Interrupt, command, EOF,
and exit actions use that same emission path; one transaction retains
cancellation before shutdown while publishing at most one terminal exit effect.

A settled non-empty range is reconstructed from visible logical text. On
Windows x64, the CLI clipboard port sends one bounded UTF-16LE frame to the exact
package-relative owned C17 broker; broker exit success confirms the Win32
`CF_UNICODETEXT` transfer. Its two-second operation deadline is followed by a
250-millisecond post-kill cleanup deadline, after which the content-free failure
settles even if `close` is absent. On unsupported platforms, the port returns
`unsupported` and the serialized renderer emits the bounded OSC 52 fallback.
The single-writer reducer distinguishes `copied`, `requested`, and `failed`
settlements through the existing notice generation. Clipboard notices use the
closed composer placement: `InputArea` paints the short status on the caret
row's physical right edge only when it fits, without changing its measurement,
editor width, caret, composer allocation, or transcript allocation. Only the
same reducer dismisses the current generation when a composer pointer action is
applied; transcript pointer interaction leaves it intact. Only the
renderer emits OSC 8 links, OSC 52 requests, mouse lifecycle controls, styles,
or any other terminal sequence. The same VT pointer path serves Windows and Linux; Shift remains an
optional terminal-native selection escape hatch, Ctrl+C remains the agent
interrupt, and exact visible HTTPS activation remains terminal-owned.

Transcript navigation follows decision 0024. The decoder maps only the exact
Up, Down, Page Up, and Page Down sequences to ordered session actions. The
single-writer reducer owns the immutable scroll state and last valid transcript
geometry. The view wraps its one Markdown transcript in the generic scroll view
and returns geometry from the same layout plan that rendered the frame. Moving
away from the newest row changes only reducer-owned navigation state; returning
to the end or accepting a new turn restores follow-end. Navigation truth is not
duplicated as footer telemetry. Editor Home and End remain independent.

Tool activity is application state, not terminal state. The CLI reducer maps
validated runtime transitions into one bounded log and one generic component
stack. It retains only the current or most recently settled turn and exposes
only tool name, risk, an admitted safe subject, bounded permission preview, and explicit state. One
pure projection keeps only the latest activity in the contextual slot while its
turn is active. A new tool replaces it, and turn settlement removes it. Tool
activity never enters the scrollable conversation. Every state, including
pending permission, uses the same generic borderless transparent `Surface`.
The status mark and written state select one of the closed success, attention,
or failure foregrounds; action, safe subject, ordinary previews, and resting
permission actions remain neutral, and written state remains explicit. Exact
patch-preview removals use the separate non-bold `diffRemoved` red foreground,
and insertions use the non-bold `diffAdded` green foreground while their written
prefixes remain authoritative. One pure closed six-entry projection maps
the exact tool name and risk to a display-only action label. A generic
right-priority `SplitLine` retains the status mark and action on the left and the
written state on the right before an optional useful safe subject. Canonical tool
name and risk validate the projection but do not repeat in the visible head.
Non-permission states occupy exactly that line. Pending permission may append the
exact bounded human-readable effect preview, followed by a transparent generic
selection list.
Queued, running, cancelling, and terminal states never project that preview. The
bounded log still retains the preview as lifecycle state, so presentation does
not create a second activity model.
Decisions 0056, 0057, 0060, and 0062 own the exact display table, status marks,
split priority, transparent truth treatment, changed-only patch rows,
patch-direction foregrounds, one-line ordinary projection, useful subject, and
permission-only expansion independently from the lifecycle and permission engines.
Tools cannot choose surfaces, colors, panels, or private presentation
paths. The generic TUI owns stacking, clipping, padding, caret translation, and
hostile-component containment but knows no tool vocabulary.
Decision 0022 defines update and removal of this surface independently from the
tool engine, runtime protocol, structured rows, scroll view, and renderer.

The responsive conversation shell follows decisions 0026, 0027, 0028, 0039,
0040, 0041, 0043, 0045, and 0059. In vertical order the CLI composes a flexible document,
contextual activity, one latest ephemeral notice, completion, one bounded
stage-wide composer, and a compact status line. The document remains
dominant; absent contextual state consumes no rows.
The composer projects the existing bounded editor through generic `InputArea`
and therefore creates no second editor or submission path. It has no prompt
marker; its draft is neutral, grows from one through six content rows, wraps
ordinary words, and retains the caret-visible window after reaching the cap.
Bracketed paste reaches that editor as one atomic non-submitting event; a later
typed Enter remains the only submission event. Ctrl+Left, Ctrl+Right,
Ctrl+Backspace, Ctrl+W, and Ctrl+Delete arrive as semantic decoder events and
use the editor's single whitespace-delimited word rule; the CLI never
reinterprets terminal encodings or duplicates draft mutation. The generic area
also projects the editor's closed selection mark; pointer
positioning and double-click word selection call that same editor rather than
mutate a CLI copy. The generic `HorizontalRules` frame owns one cell of
horizontal content padding, one full-width light-blue `accent` rule above and
below the transparent content row, and caret translation. It collapses both
optional rule rows before content when fewer than three rows are assigned. The
footer renders stable context only: the working-folder label at the left edge
and configured provider/model at the physical center. Its right edge is reserved
for one constant-width three-cell pulse while autonomous work advances through
`generating`, `runningTool`, or `cancelling`; it is empty while idle or awaiting
approval. The pulse ends at the composer's final frame cell. Lifecycle and
navigation words are not duplicated there. A generic
three-column line keeps those anchors independent and retains right, then center,
then left when width is scarce. Low-priority footer chrome collapses before required
interaction rows. One pure CLI projection gives every shell region the full
usable terminal width while retaining one technical outer column per side when
space permits. The generic inset applies that projection to the footer as well;
individual shell regions own no width calculation or arbitrary reading-width
cap. Six pure pulse phases add one neutral leading and trailing step around the
ochre head while preserving the three-cell extent.
The latest notice is reducer-owned bounded state with an independent `info` or
`warning` level and a content-free generation token. Its transparent stage-wide
surface uses one horizontal inset; informational text is muted and warnings use
the attention foreground without inheriting the application phase. A new
notice replaces the previous one, editor interaction dismisses it, and the
CLI-owned scheduler submits the exact token for expiry after 5,000 milliseconds.
The event arbiter serializes expiry after terminal and runtime work but before
cosmetic motion, and a stale token cannot clear newer feedback. The generic
timer port is shared substrate, while motion and notice scheduling retain
independent lifecycle state.
User entries compose one stage-wide transparent `Surface` with the shared
one-cell content inset and no rail, marker, border, or background. Its first text
cell is the canonical content column shared by assistant prose and composer text,
caret, and pointer geometry. Vertical padding stays at zero. Base user prose uses
the closed steel-blue `accent` tone and italic slant. Registered Markdown roles replace
that base tone for their exact spans; assistant base prose remains `plain` and
unboxed. Fenced code
and strict pipe tables use the generic content-fit transparent surface painter after visible rows are selected. Complete fences with at
most two visible logical rows select zero horizontal padding through the same
surface group; larger fences and tables select one cell. Strict table rows pad
every column to the maximum visible cell width computed across that table, so
uneven source cells still produce one rectangular surface. The compiler derives
one muted header rule from the same measured total row extent and emits it
inside that surface; it does not emit an outer border or a complete cell grid.
No `you`, `agent`, or static
header label is injected. Surface, slant, and foreground tone remain
independent closed style dimensions. User authorship is distinguished by its
base accent prose; the composer stays transparent between two full-width
light-blue accent rules. Semantic success, attention, and failure foregrounds are reserved
for authoritative tool marks and written lifecycle state. One blank row separates adjacent transcript entries. The empty state contributes no
welcome or reference content. Semantic state is shared across interactive
surfaces: green is successful, yellow is active or permission-sensitive, and red
is failed, denied, or cancelled. The TUI primitives
remain agent-agnostic.

Conversation display uses the closed Markdown subset in decision 0023. The TUI
recognizes headings, one-level lists and quotes, matched fenced code, inline
code, single-asterisk italic emphasis, strong text, strict pipe tables, and an
exact `---` horizontal separator, then compiles them into the same bounded
spans. Inline code and fenced language labels use the restrained steel-blue
reference accent; italic emphasis retains the surrounding foreground tone and
selects the closed italic slant; table headers use emphasis; structural
separators and the single table header rule remain muted.
Recognized complete fences may
use the five closed syntax roles under decision 0031; lighter blues remain
code-only. Under decision 0032 the exact horizontal separator expands to the
available component width only in shared display layout; unsupported variants
remain literal. Unknown or unlabeled fences remain plain. Inline precedence is
code, strong, then italic emphasis. Missing delimiters, longer delimiter runs,
malformed tables, and unsupported syntax remain literal.
Markdown never receives tool
activity, status, provider data, or application lifecycle state.
Every structured role entry is a separate parser document; syntax cannot cross
from user to assistant content or between turns.

The current shell implements `/providers`, `/models`, `/permissions`, and `/exit`
through one immutable CLI-owned catalog shared by exact dispatch and completion.
Only a non-empty, whitespace-free, non-exact case-sensitive prefix activates
completion. While visible, Up and Down change its bounded non-wrapping selection
instead of navigating the transcript; Tab replaces the draft with the selected
exact command without submitting it, while Enter dispatches the selected exact
command through the same canonical path as a fully typed submission. The generic
TUI selection list owns one-row measurement, clipping, caret translation,
selected-row visibility, and the exact selected-row `accent` foreground. It
preserves every other span property and knows no command names or execution policy. The
completion slot is below contextual activity and any context notice, and above the composer. Each entry
is one compact transparent inline row with its description immediately after
the command; no passive keyboard hint is rendered. One shared optional generic
spacer row precedes each adjacent non-empty activity, notice, or completion
region, the composer, and the footer. Every instance has zero minimum height and collapses before
required content. The
composer remains the sole required row on a one-row viewport.
Operator guidance lives in the maintained manual rather than a duplicated
interactive help surface. The application owns one memory-only exact-tool
permission table: reads default to `Allow`, writes and execution to `Ask`, and
`/permissions` changes only the current session. Every runtime request waits for
one turn-and-call decision. Pending `Ask` requests use the contextual
`SelectionList` actions `Allow once`, `Allow for session`, and `Deny`; its exact
current action receives the generic accent foreground, and no slash command
resolves a pending call. Without an
injected runtime, ordinary submitted content is discarded after a generic notice
and never becomes transcript or conversation state. With a runtime, only one
turn is active: streamed text is prospective display state, completion publishes
one prepared response, and the CLI synchronously resolves its runtime commit
before publishing the bounded transcript pair. Failure or cancellation removes
prospective state after the last truthful tool checkpoint. Tool names, risk, and
state remain visible in one contextual TUI region. A separate bounded
permission preview exposes either the descriptor projection for a direct handler
or the concrete effect preview produced by a mutation plan. Patch previews show
the canonical target and human-readable changed rows when they fit. The CLI
removes only exact complete common prefix and non-overlapping suffix rows inside
one hunk before budgeting; separator differences and partial rows remain, while
the complete untrimmed hunk stays bound to permission and commit. If unequal
terminal separators are the only field difference, exact printable ASCII
escapes stay inline on their owning rows and source backslashes remain doubled.
Removed rows
use `diffRemoved` and inserted rows use `diffAdded`, including
wrapped continuations, while their exact prefixes remain visible;
larger content uses bounded prefix/suffix excerpts and an explicit omitted-code-unit
count. Observed identity, SHA-256 digests, complete hunks, and replacement
content remain
bound inside the effect plan and native commit rather than becoming UI metadata.
Call identifiers, tool outputs, causes, and
unbounded content never appear.

A terminal failure after a truthful tool checkpoint is projected through one
pure CLI-owned classifier. Its fixed `model/...`, `tool/...`, or residual
`runtime/failure` code appears in the bounded incomplete-turn marker and latest
ephemeral notice. One separate pure CLI module maps the two admitted providers'
already content-free errors into the same closed adapter-neutral reason
families. The code identifies the stage that stopped while the prior tool
lifecycle state remains authoritative; no provider identity, raw reason,
status value, response body, tool payload, path, content, or call identifier
crosses into presentation.

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

`evaluations/` and `tools/lib/evaluation-suite.mjs` form one maintainer-only
offline evaluation boundary. A pure validator binds the manifest to the exact
brief, input, and expected-file inventory. The operational entry point prepares
only an input tree under ignored state, grades regular-file equality without
execution, and validates one closed content-free record. It has no dependency
on product packages and adds no provider, runtime, controller, tool descriptor,
prompt, transcript, or terminal path. The canonical verifier validates this
inventory and its regressions but never creates a run. Focused regressions may
start the approved Node executable against only the immutable versioned
TypeScript and JavaScript red-green input and expected fixtures; the evaluator
and verifier never run a prepared or model-authored candidate workspace. The
red-green brief asks the ordinary product to observe one nonzero test result,
correct the source, and run the same command successfully without adding a
parallel controller or execution path.

`packages/agent-cli/src/evaluation-receipt.ts` is an adjacent, independently
removable product observer, not part of the evaluator. The composition root
constructs it only for exact interactive `--evaluation-receipt` launches. The
serialized CLI and successful canonical read boundaries feed it content-free
facts; after ordinary terminal cleanup it returns one bounded immutable receipt
to the composition root. Stale application events are excluded before recorder
observation, and the composition root classifies the product result before
ordering any receipt settlement diagnostic. It has no evaluator, filesystem,
network, TUI, runtime, or model-facing tool port and never changes an
application transition.

`packages/agent-cli/src/process-output.ts` owns the composition root's one
content-free Node process-stream write result behind a narrow output port. It
installs one temporary error listener before writing, removes it after a
successful callback, and retains it across an errored callback until Node's
subsequent error event settles failure. The receipt path therefore cannot leave
an unhandled post-cleanup stream event or replace a previously classified
product failure with raw stream content.

`evaluations/failures/registry.json` and
`tools/lib/evaluation-failure-registry.mjs` form one adjacent maintainer-only
evidence boundary. The registry binds reviewed negative results to maintained
task identifiers using closed category, priority, lifecycle, occurrence, record,
and grade fields. The canonical verifier supplies the task catalog and tracked
source inventory; the validator never reads ignored runs, candidate content, or
provider output. Evaluator commands admit the exact inventory path and reuse
only the registry's immutable byte bound to reserve complete corpus-tree
capacity. They do not parse its contents, so failure evidence cannot affect
preparation or grading. Evidence invalidated by a defective task contract is
removed rather than resolved or made available to product decisions; the empty
registry remains one valid owned state.

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

`tools/provider-policy.json` is the fail-closed registry for subscription and
direct integrations. A technically observed OAuth flow is not eligible until
the project has independent-client authorization and an owned or expressly reusable
registration. Schema version 6 binds the four provider-specific
authorization inquiries in `docs/PROVIDER-APPLICATIONS.md` to their research
date, official route, visibility, lifecycle state, submission date, and public
or content-free private reference. Request metadata cannot change eligibility.
It also binds the two admitted direct providers to exact chat and public catalog
endpoints, credential slots, complete model allowlists, cost classes, and
process-only persistence. Verification pins the exact workspace set and scans
product source, tests, and declarations for ambient network access,
subscription endpoints, OAuth identifiers, foreign credential storage, broad
process access, borrowed product identity, and provider-literal drift.

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
  direct validated frames before deleting component modules and decisions 0006
  and 0026; decoder, renderer, runtime, and core remain unchanged. To remove only
  the current visual grammar, replace its CLI document builders with one plain
  transcript and input row, remove semantic activity and three-zone footer
  composition, then delete unused surface, text-style, spacer, panel,
  horizontal-rules, split-line, three-column-line, horizontal-inset, and side-rail modules with
  decisions 0028 and 0033.
- Remove Markdown by replacing the transcript component with `TextBlock`, then
  deleting its parser, component, internal syntax highlighter, exports, tests,
  decisions 0023, 0030, 0031, and 0032, and policy and manual evidence. Remove
  structured-region identities, table recognition and its derived header rule, the shared row-paint
  integration, `inset`, and the five syntax tones in the same change if they
  have no remaining consumer. Remove `emphasis` only if it has no remaining consumer;
  lifecycle success and failure tones remain governed independently by decision
  0027. Structured rows and the renderer remain unchanged.
- Remove interactive behavior by deleting the decoder, editor, viewport, CLI
  session, view, and Node host together; restore plain startup and the previous
  renderer contract, then remove decision 0004 from the ownership registry.
- Remove or replace core at its package and root registries; the current CLI and
  TUI remain unchanged after runtime is removed or redirected first.
- Remove runtime by first removing CLI composition, restoring unconditional
  no-model handling, and then deleting its workspace, registry, path, decision,
  and generated artifacts. Core, TUI, and provider-independent CLI surfaces
  remain buildable.
- Remove the application loop by restoring a terminal-only serialized loop,
  removing CLI runtime composition and decision 0007, then deleting arbiter,
  chat-state, and chat-view modules without changing generic TUI or core.
- Add or remove a provider at the adapter, registries, and CLI edge; core changes
  only if its owned model contract deliberately changes. Remove its credential
  slot, catalog path, allowlist, model selector entries, and transport together.
- Remove one built-in tool by first stopping its descriptor advertisement, then
  deleting its handler, focused tests, permission and activity-presentation
  entries, manual record, and unused private helpers. Update decision 0008 if
  its execution contract or registry reference changes. The remaining registry
  and text-only path stay buildable under decision 0014.
- Remove built-in tools by first stopping descriptor advertisement, restoring
  text-only runtime steps, and deleting CLI permission/activity composition. Remove
  the runtime tool dependency, then the tools workspace and structured tool
  entries only when no consumer remains. In the same removal change, replace
  manual-policy schema 9 so it removes the advertised inventory; unregister
  decisions 0008, 0014, 0015, 0016, and 0036 only when their admitted surfaces
  and proof infrastructure are gone; and remove their ownership, required-path,
  and manual-evidence registrations. Core text chat and provider-independent
  CLI surfaces remain buildable throughout.
- Remove namespace management by first removing `manage_path` advertisement,
  manual inventory, and policy entry, then deleting its planner, preview,
  committer, protocol, native broker, tests, and decisions 0054 and 0058. Never
  retain a namespace alias or pathname fallback. Read tools, `apply_patch`,
  `run_process`, runtime text chat, and TUI remain independently buildable.
- Remove process execution by first removing `run_process` advertisement, then
  its handler, runner port, Node adapter, and protocol codec. Remove the native
  source, build driver, conformance harness, Linux cgroup bootstrap, toolchain
  registrations, and Linux CI job only when no proof or platform work consumes
  them. File tools, runtime text chat, and TUI remain independently buildable.
- Remove task evaluation by deleting local ignored runs, then its corpus,
  manifest, evaluator entry point and library, tests, verifier hook, decision
  0047, the TypeScript fixture decision 0064, the red-green fixture decision
  0065, failure registry, validator, tests, decision 0049, and documentation
  registrations. The independently optional receipt may remain as generic
  interaction evidence. Remove the receipt separately by
  deleting its launch flag, recorder, composition hooks, tests, decision 0048,
  and registrations. The model-facing tool surface remains unchanged in either
  removal.

The exact registry and derived-artifact procedure is defined in
`docs/MAINTENANCE.md`.

An architectural change requires a decision record, updated diagrams and
contracts, migration and rollback notes, and tests at every affected boundary.
