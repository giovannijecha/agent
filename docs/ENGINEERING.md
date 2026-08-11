# Engineering standard

## Definition of done

A change is complete only when:

1. its scope, owner, and affected contract are explicit;
2. implementation stays inside the owning package;
3. public behavior, invariants, errors, side effects, and security are documented;
4. focused tests cover success, failure, and boundary conditions;
5. update, rollback, replacement, and removal remain localized;
6. The platform entry point (`tools/verify.ps1` on Windows or `tools/verify.sh`
   on Linux) passes from a clean offline workspace.

An owned engine or framework is not complete with only its happy path. Its
accepted contract includes lifecycle, bounds, concurrency, failures, security,
tests, update and rollback procedures, and an independent removal path.

## Source rules

- Use strict TypeScript and ESM with explicit `.js` relative import suffixes.
- Native platform primitives use original C17 split into common contract and
  operating-system backend modules. Compile with registered external Clang,
  warnings as errors, no third-party headers or libraries, and no committed
  binaries. A native backend is evidence only on its matching operating system.
- Use explicit collection operations such as `.at()` for runtime indexing in
  shipped modules. Computed member names must be statically proven safe.
- Import other workspaces only through their declared public package names.
- Use the `node:` prefix for an explicitly approved built-in.
- Keep runtime state private and return frozen values or defensive snapshots.
- Keep I/O at the CLI edge and domain behavior deterministic.
- Resolve terminal writes from their platform completion callback and serialize
  input, resize, render, and cleanup operations; never redraw reentrantly.
- Retain one read per asynchronous source across races; never issue a replacement
  until the previous result is consumed, and reduce all events through one writer.
- Retain unacknowledged terminal receipts behind their source so closing an
  arbiter cannot erase independently observable cleanup failures.
- Keep an output-error listener active for the complete lifetime of every write,
  including non-TTY output and writes performed after input teardown.
- Keep executable arguments secret-free. A pre-TUI credential prompt must bound
  input, disable echo, and restore raw mode and listeners on every terminal path.
- Return discriminated results for expected failures; translate them in the CLI.
- Decode foreign results, stream capabilities, and events into owned snapshots
  before mutation; reflective access and hostile getters must remain contained.
- Treat model tool calls as hostile structured data. Bound and validate a
  complete ordered batch against the closed advertised schemas before effects,
  execute its calls sequentially, and never infer approval from prose, a prefix,
  a prior call, another batch member, or a risk category.
- Escape non-printing and directional Unicode in exact approval fields before
  display, then reject any unescaped unsafe scalar at the application boundary.
- Treat warnings, stale documentation, skipped tests, and suppressed type errors
  as failures.
- Delete obsolete paths completely; never retain dormant compatibility code.
- Never expose a private platform proof to the model until its adapter, schema,
  approval, privacy, cancellation, checkpoint, and removal contracts are
  accepted and tested independently.

## Documentation rules

Every public module states its responsibility and exclusions. Every public
contract documents inputs, outputs, invariants, errors, side effects, and
security assumptions. Operational documentation covers setup, verification,
updates, rollback, and removal. Lasting tradeoffs belong in a decision record,
not only in comments or chat history.

## Integration lifecycle

Define the owned contract and deterministic fake before an adapter. Implement
public protocols from authoritative specifications without importing an SDK.
Keep provider-specific values at the adapter boundary. Updates change the
adapter and fixtures rather than leaking version checks into core. Removal
deletes the adapter, composition entry, tests, and documentation while unrelated
packages continue to compile.

When provider documentation is stale, current public source may be inspected at
a pinned commit. Record only observable facts and risks in the provenance log,
derive a fresh contract, and never reuse implementation structure, registered
identifiers, prompts, fixtures, or foreign product identity. Technical
feasibility does not bypass the provider eligibility gate.

An official integration bridge is not automatically owned substrate. Vendor
SDKs, CLIs, app servers, ACP executables, and their stored identities remain
foreign runtime dependencies. A direct subscription adapter requires an
`agent`-owned registration or a provider-documented identity expressly reusable
by independent clients.

A provider-published direct API-key contract is a separate eligibility class.
It may be implemented only through an accepted provider-specific decision, an
exact origin and credential variable, a CLI-owned transport, a Node-free wire
adapter, content-free failures, offline adversarial tests, and documented
privacy and removal behavior. One admitted key provider does not authorize a
generic endpoint, model selector, credential store, OAuth flow, SDK, or second
provider adapter.

All integrations preserve the single-agent execution model. A provider is one
replaceable backend for the active runtime session; a tool is one bounded
capability controlled by the same agent. The sole controller may overlap only
bounded controller-internal mechanics over immutable snapshots during a
read-only phase, and it must reduce their results in a deterministic order.
Such work cannot enter the model, runtime, or tool engine or own context, plans,
conversations, follow-up decisions, or authority. Any mutation excludes
concurrent mechanics. Model turns, writes, process execution, approvals, and
terminal output remain serialized. Current runtime remains sequential. Do not
introduce worker identities, delegation, concurrent agent turns, or inter-agent
state without a superseding architecture decision and its complete authority
and lifecycle contracts.

## Verification policy

The canonical PowerShell entry point performs two ownership passes: before npm
touches workspace links and after TypeScript emits JavaScript. It enforces:

- pinned external Node, npm, and TypeScript toolchain;
- the exact owned GitHub workflow, read-only permissions, bounded concurrency
  and timeout, pinned toolchain bootstrap, canonical command, and absence of
  imported actions, secrets, or `pull_request_target`;
- exact explicit workspace manifests and lockfile entries;
- absence of external packages and legacy stack artifacts;
- conservative import and dangerous-loader checks, including no-substitution
  templates and fail-closed dynamic member access in shipped code;
- escape-aware provider checks whose low-entropy identity and credential markers
  are context-bound rather than arbitrary compacted substrings;
- valid UTF-8, LF, final newlines, and canonical JSON;
- registered manual chapters, fixed section order, local links, and evidence
  paths, plus exact source-bound tool names and risk classes, unique capability
  identifiers, and unique necessity records;
- canonical public name, namespace, maintainer, governance posture, exact
  Apache-2.0 terms, and absence of false or automatic authorship claims;
- strict project-reference builds and owned declaration boundaries;
- all compiled tests, verifier tests, and an exact CLI process smoke test.

The verifier fails closed on syntax it cannot safely analyze. Weakening or
bypassing it requires an accepted replacing decision record.

Remote verification must call the same PowerShell entry point as local work.
The workflow may use GitHub-hosted execution and network access only to fetch the
public event revision and provision the already approved toolchain. Workspace
installation, builds, tests, and smoke verification remain offline.

## Terminal input policy

Treat terminal input as untrusted bytes. Decode bounded fragments before editing,
discard unknown control sequences, keep the prompt caret inside the validated
viewport, and validate the complete frame before output. Without a runtime,
  discard ordinary submitted personal text immediately. With a runtime, let only
  the explicit prospective-turn contract retain it. Commit final text only after
  application acknowledgement, checkpoint completed tool attempts before the
  next model step, and never place personal payloads in notices, failures, logs,
  fixtures, or persistence. Release display-only personal-content
references synchronously before awaiting external shutdown. Aggregate limits
must count queued payload size as well as event count.

Raw mode, listeners, and stream errors remain at the CLI edge. Generic decoding,
editing, component layout, viewport, frame, and rendering behavior remains
Node-free in the TUI. Runtime streaming and cancellation remain terminal-free.
Every shutdown path independently attempts runtime, terminal, and renderer
cleanup without allowing one failure to mask another.

Treat visual emphasis as closed metadata, never as display text. Components and
frames accept only normalized `TextSpan` and `RichRow` values under decision
0021, and spans accept only the semantic tones registered by decisions 0019,
0023, 0027, 0031, and 0032. The renderer alone maps them to fixed ANSI, redraws text- or tone-only
changes, and resets terminal style after emphasized spans and during cleanup.
Application code and untrusted content must never construct escape sequences or
arbitrary color values. Bound span count before iteration, merge adjacent equal
tones, and contain arrays, proxies, accessors, and subclasses at every public
row boundary.

Treat Markdown as one closed display grammar, not a compatibility target. Under
decision 0023, parse only the registered line and inline forms, keep incomplete
and unsupported constructs literal, and compile directly into the canonical
structured rows. Reuse the plain-text sanitizer, cell measurement, wrapping,
anchoring, padding, fragment, frame, and renderer path. Under decision 0025,
ordinary text wraps only through the shared word-aware policy, long tokens use
its cell fallback, and literal code remains on its explicit cell policy. Keep
structural and continuation prefixes in the logical-line contract; do not add a
component-private wrapper. Under decision 0030, keep assistant prose unboxed
and let only complete fenced code and strict pipe tables select the internal
structured-region role. Under decision 0032, assign zero horizontal padding to
complete fences with at most two visible logical rows and one cell to larger
fences; tables keep one cell. Before painting a strict table, measure every
accepted header and body cell and pad all rows to the same visible width per
column. Derive one muted header rule from that exact measured total row extent
and emit it in the same surface; never add a table-specific painter, outer box,
or full row grid. Reserve the declared surface padding before wrapping,
retain the region identity beside bounded visible rows, and reuse the generic
surface painter.
Inline code and fenced language labels may select `accent`; table headers use
`emphasis`; structural separators use `muted`. Parse only exact `---` as the
semantic horizontal separator and expand it in shared display layout, never in
the parser. Under decision 0031 as amended by 0032, complete recognized
fences may select only the five closed syntax roles through the internal
bounded line scanner, and unknown or unlabeled fences remain plain. Never infer
operational state or arbitrary style from model content. Do not add rendered
HTML, active links, images, arbitrary styles, parser callbacks, extensions, a
syntax-highlighting dependency or registry, a retained AST, or a second
rendering engine. If inline role
count exceeds the row bound, fall back to the complete sanitized literal line.
Snapshot document collections before parsing, bound their count and total text,
and restart syntax state at every document boundary. Conversation roles use
separate documents so one message cannot style or consume another.

Treat scrolling as immutable geometry, never as component-owned content or an
event queue. Reconcile an explicit row offset against measured content and the
assigned viewport through decision 0020. Moving away from the end disables
follow mode; returning to the end reenables it. All scrollable product surfaces
must use the same generic view. Renderer writes are synchronized terminal
transactions, and a failed transaction must be explicitly ended before retry
or cleanup.

For product navigation, follow decision 0024. Obtain content and viewport rows
from one immutable `VerticalLayoutPlan`; never repeat allocation math in CLI or
mutate application state from a component callback. The application reducer
alone owns scroll and observed geometry. Keep transcript keys out of the line
editor, preserve draft and caret, use one-row page overlap, and expose only the
quiet `↑ history` footer truth while follow-end is disabled.

Compose the product shell through decisions 0026, 0027, and 0028. The CLI alone
decides vertical order, slot priorities, product wording, semantic tones, and
truthful status facts. `Panel`, `SplitLine`, `ThreeColumnLine`,
`HorizontalInset`, `SideRail`, `Surface`, `SelectionList`, and `Spacer`
remain Node-free, agent-agnostic
component mechanics. A panel must render its complete border or delegate its
entire viewport without a border; partial boxes are forbidden. Compose the
composer from one `Panel` and the prompt-free `InputArea`; never create a second
editor, decoder, draft, or submission path. Let the area grow from one to six
content rows, wrap at word boundaries when possible, and keep the real terminal
caret visible as the projection moves. Bracketed paste is one bounded atomic
edit, never an implicit submission; only a distinct Enter event submits. The
renderer owns enabling and disabling bracketed-paste mode with its other
terminal lifecycle controls. Map admitted Ctrl word controls into semantic
decoder events, and keep the whitespace-delimited movement and deletion rule
inside the bounded editor. Never duplicate control decoding or word mutation in
CLI state. Keep the draft neutral. Render the
working folder left, provider/model at the physical center, and lifecycle phase
plus optional history once at the footer's right edge. When width is scarce,
retain right, then center, then left. Do not add a static product header or
duplicate lifecycle notice. Footer facts come only from the composition root or
authoritative application state. Compose compact transcript cards with
`Surface`; keep surface, slant, and foreground tone independent, closed, and
renderer-owned. Use the user surface for role distinction, leave assistant
prose direct, and reuse the content-fit dark `inset` painter for registered
structured Markdown regions. Keep green for
success/readiness, yellow for active/approval, and red for negative terminal
state. Do not add permanent dashboards, empty metrics, speculative progress, or
integration-specific cards. Future tools and integrations reuse the same
split-line, three-column-line, inset, rail, marker, spacer, activity-stack, scroll, and
vertical-layout paths. Keep role and content structured in the CLI, but do not
prefix visible messages with redundant role labels. Separate adjacent role
entries with one blank row and no leading or trailing decorative gap.
The renderer owns the interactive steady block cursor command and restores the
terminal-default style on every cleanup path. Keep cursor shape out of editor
text, frame content, and product state.

Keep slash discovery and dispatch on one immutable CLI catalog under decision
0034. Completion accepts only exact prefixes without whitespace and disappears
for an exact command. Let the session own its bounded selection index; intercept
Up and Down only while completion is visible, and let Tab replace the draft
without creating an action. While completion is visible, Enter clears the draft
and dispatches the selected exact command through the same canonical submission
path; do not add a menu-specific dispatcher. Map catalog rows through the generic
one-row `SelectionList`; never teach the TUI package command names, aliases,
execution, or provider policy.

Compose sequential component documents through the one bounded generic stack
defined by decision 0022. Product lifecycle state never enters that component:
the CLI owns one tool-activity log and maps every registered tool through the
same presentation function. Preserve the focused activity header before
optional scope in short viewports. Every state uses one generic borderless
semantic `Surface`; success, attention, and failure are closed renderer-owned
backgrounds selected from authoritative CLI state. Keep the tool name neutral
and italic, retain the written state, and do not add per-tool components,
panels, rails, icons, colors, aliases, or state paths. Visible activity is
derived from one bounded log: only the latest tool occupies the contextual slot
while its turn is active. The next tool replaces it, turn settlement removes
it, and no activity enters the scrollable conversation. Do not add a second
archive or lifecycle model. Activity
is limited to the current or most recently settled turn and is scrubbed during
cleanup. Place one optional generic one-row `Spacer` before non-empty contextual
activity. Give it zero minimum height so constrained viewports discard rhythm
before required interaction or activity content. Keep activity directly
adjacent to following completion or composer content; do not add a trailing
spacer or component-private padding. Keep the empty session empty and keep
operator guidance in the manual; do not recreate welcome suggestions or an
embedded help document.

## Tool execution policy

Keep the harness lean. Before adding a model-facing tool, prove that its
capability is distinct, necessary for a current operator task, and independently
removable. Register one canonical name and one unique capability identifier in
`tools/manual-policy.json`; aliases, deprecated compatibility names, and
speculative convenience tools are forbidden. A rename removes the previous name
atomically. Provider vocabulary is translated at the adapter boundary rather
than expanding the runtime registry. Product descriptor construction stays in
the registered CLI module; the generic tool engine owns mechanics only.

Tool descriptors and schemas are immutable provider-neutral data. Read tools may
run automatically; every write tool requires one exact pending-call decision
from `/approve` or `/deny`. One model response may select a bounded ordered
batch, but complete preflight precedes effects and handlers run sequentially in
provider order. No tool may use ambient network access. Process execution remains unavailable under decisions 0008 and
0015. A future backend must fail closed without the required Job Object or
delegated cgroup boundary and pass the registered adversarial platform proof
before any descriptor is advertised.

All filesystem paths are workspace-relative. Resolve lexical and canonical
containment, reject absolute paths, parent escape, symlinks, unsupported file
kinds, and oversized input or output. New-file creation refuses overwrite;
replacement requires exactly one old-text occurrence. Enumerate directories
incrementally and bound directory entries, searched directories, aggregate
entries, files, text, and matches. Expected I/O failures become content-free
structured tool results. After handler invocation, contract corruption becomes
a generic checkpointed failure before the runtime terminates the turn.

Checkpoint the structured call and result before the next model step. Later
cancellation or failure must not erase the recorded truth of an attempted side
effect. Render only descriptor-declared bounded approval fields; never render,
log, or retain raw arguments, file content, outputs, call identifiers, or causes
in notices or errors. Update decision 0008 whenever schemas, risk,
approval, checkpoint, containment, or Node-tool safety changes. Update decision
0014, the manual registry, necessity record, focused tests, and removal guidance
whenever the advertised surface changes.
