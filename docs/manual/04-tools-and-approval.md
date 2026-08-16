# 04 - Tools and permissions

## Purpose

Use this chapter to understand the current registered workspace tools, their
safety classes, the session permission policy, and the exact authorization
boundary for tool invocation.

## Operator workflow

Run `/permissions` to inspect or change the six tool modes for the current
process session. Up and Down select without wrapping, Left and Right move the
selected mode through `Deny`, `Ask`, and `Allow`, and Enter closes the editor.
The three read tools start as `Allow`; `apply_patch`, `manage_path`, and
`run_process` start as `Ask`. The editor is transient, accepts no arguments or
wildcards, and persists nothing.

An `Allow` request proceeds without interruption, `Deny` returns a structured
denial without invoking the handler, and `Ask` presents exactly `Allow once`,
`Allow for session`, and `Deny`. Up and Down select the action and Enter applies
it. `Allow for session` changes only that exact tool and also allows the current
call; it does not cache the current path, preview, arguments, or result. Failed
effect planning reports failure without asking because there is no valid effect
to authorize. The current exact names and risk classes are in the verified
inventory below.

Every tool uses the same activity document. Its explicit states are `permission`,
`queued`, `running`, `cancelling`, `succeeded`, `failed`, `denied`, and
`cancelled`. The log keeps exactly one contextual activity beside the composer
while its turn is active. Permission,
execution, and terminal outcome update that surface; the next tool replaces it,
turn settlement removes it, and tool activity never enters the transcript.
Every state uses the same borderless transparent surface. The status mark and
written state use a restrained success, attention, or failure foreground while
the readable display-only operation and optional useful safe subject remain
neutral. Canonical tool name and risk still validate the closed projection but
do not repeat in the visible head. The compact main line keeps its status mark
and operation on the left and its written state on the right. A
pending `Ask` uses a separate transparent contextual selection list after the
activity surface; its exact current action uses the generic restrained
steel-blue selection accent, while its resting actions remain neutral. Slash-command
text is never an authority path. The exact
bounded human-readable effect preview is visible only while permission is pending. Queued,
running, cancelling, and terminal states remain one line, while the bounded
lifecycle log retains the preview internally.

## Guarantees and limits

Every tool receives a validated structured object and the same immutable
canonical workspace boundary selected before startup. The footer exposes that
exact absolute root; tool handlers do not select or recanonicalize another one.
Absolute model inputs, parent escape, symbolic links, unsupported file kinds,
unknown fields, and oversized data fail closed.
Files are limited to 262,144 code units. Directory listing is limited to 512
entries. Recursive exact-text search is limited to 512 directories, 4,096
entries, 2,048 files, 256 matches, and 4,194,304 scanned code units.

The read tools share one immutable disclosure policy loaded before
credentials. Mandatory rules deny `.agentignore`, `.git`, `.env` and `.env.*`,
common SSH and cloud credential directories, package and Git credential files,
conventional private-key names, and `.key`, `.pem`, `.p12`, `.pfx`, `.jks`, and
`.keystore` files. One optional root `.agentignore` may add at most 128 rules in
16,384 bytes. Empty and `#` lines are ignored; other lines are root-relative
deny patterns using `/`, segment-local `*`, at most one complete `**` segment,
and optional trailing `/` directory shorthand. Negation, absolute paths,
backslashes, whitespace padding, empty, `.` or `..` segments, controls, format
characters, duplicates, lines over 256 code units, and patterns over 32
segments are invalid. Linux matches exactly; Windows folds ASCII letters only
and rejects DOS short-name components such as `~1` as ambiguous.

`read_file` returns `permission` for a denied lexical target before observing
the filesystem and rechecks the resolved target under the same policy.
It accepts optional `startLine` and `lineCount` integers to return an exact
logical-line region. The start is one-based and the count is capped at 512. A
path-only call returns the complete bounded file. Every success returns exact
unnumbered `text` with original line terminators plus actual `startLine`,
returned `lineCount`, complete `totalLines`, and `hasMore`. A start beyond EOF
returns an empty successful selection at `totalLines + 1`. The handler still
observes and verifies one complete bounded file before projection, so this
reduces provider context without adding random-access filesystem authority.
`list_directory` rejects a denied target and omits denied children.
`search_text` rejects a denied root and prunes denied directories and files
before opening them; resolved traversal targets are rechecked before
observation. Hidden entries still consume the raw enumeration bounds. The
policy does not inspect content and does not restrict authorized `apply_patch`,
`manage_path`, or `run_process` effects.

`apply_patch` uses one three-state mutation lifecycle: pure schema preparation,
just-in-time effect planning, then exact authorization and invocation. It accepts one
path of at most 447 code units whose exact structured projection is at most 896
code units, plus from 1 through 32 ordered `{ oldText, newText }` hunks. The
complete batch checks both mutation-path bounds and the aggregate hunk bounds
before any planner observes the workspace. The read tools retain their separate
path limits. For an absent target, exactly one hunk with empty `oldText`
provides the complete new-file content. For an existing target, every non-empty
`oldText` must occur exactly once in the same complete source snapshot; hunks
must be strictly ordered, non-overlapping, and must change content. Empty
`newText` deletes its anchor; retaining source around an anchor expresses
insertion. Aggregate hunk text is limited to 524,288 code units and 2,097,152
UTF-8 bytes, and the resulting file retains the existing complete-file bounds.
Planning binds target absence or
canonical file identity, complete observed and resulting content, parent state,
and SHA-256 digests. Unsupported source text, ambiguous anchors, overlap,
reordering, no-op hunks, and limit failures settle before approval. The approval
surface is limited to 2,048 code units. Its first row supplies the canonical
relative path as useful head detail; subsequent `- ` and `+ ` rows show removed
and inserted changed logical text. Within each hunk, the formatter removes only
the longest exact common prefix and non-overlapping suffix of complete logical
rows before budgeting. Original separators participate in comparison, so a
line-ending difference remains a replacement; partial rows and cross-hunk text
never collapse. If unequal terminal separators are the only field difference,
the exact `\r\n`, `\r`, or `\n` is escaped inline on its owning row; source
backslashes remain doubled, so the display is unambiguous without an empty diff
row. The complete untrimmed hunk remains bound to authorization,
stale-state validation, and commit. The complete removed row and any wrapped
continuation
use a restrained non-bold red foreground; the complete inserted row and its
continuations use a restrained non-bold green foreground. The prefixes remain
visible, so color is not the only direction signal. Backslashes, tabs, and non-line control or format
scalars are escaped. When complete changed text does not fit, deterministic
prefix and suffix excerpts retain an explicit omitted-code-unit count over the
changed projection. The
compact fallback keeps one bracketed omitted count for each non-empty remove or
insert field, so every ordered hunk remains represented; the number is the exact
omitted code-unit count. Internal state digests, object identity, complete
observed and replacement content, line counters, field registries, and tuple
encodings remain bound to the effect plan and commit but are not UI content.
The mutation-path projection reservation
keeps that complete 32-hunk compact form within the same approval bound even at
the maximum admitted path. Invocation rejects a changed identity, parent,
target absence, canonical path, or complete content as `conflict` before
mutation. No stale plan is silently refreshed or broadened.

After approval, the tool invokes the one decision 0046 native committer. It
receives the immutable accepted root, normalized relative target, approved
parent or file identity, complete expected replacement content, and complete
proposed content. There is no Node pathname-write fallback. Linux guards lookup
with `openat2`, publishes complete `O_TMPFILE` content without replacement, and
holds a write lease while comparing and replacing. Windows traverses relative
directory handles, reserves a new target through exclusive `FILE_CREATE` plus
delete-pending cleanup, and replaces through one exclusive opened file. A
missing kernel or filesystem primitive returns `unsupported` without mutation.

This binds the write to the object approved by the operator and closes ordinary
namespace-retargeting and conflicting-content races. It is not a multi-file
transaction, crash rollback, storage-durability guarantee, or filesystem
sandbox. On Windows, directory enumeration may briefly see an exclusively held
new name before its complete content is retained; ordinary opens cannot observe
partial content, and termination before settlement removes it.

`manage_path` accepts exactly one nested `request`: `create_directory` with one
path, `move` with source and destination, or `remove` with one path. It creates
one absent directory whose parent already exists, moves one regular file or
directory to an absent destination, or removes one regular file or empty
directory. It never creates parents implicitly, overwrites, merges, removes
recursively, removes a non-empty directory, crosses volumes, or moves a
directory beneath itself.

The planner first queries the namespace committer's closed operation capability.
An unsupported operation returns a content-free failure before path-specific
planning, namespace observation, preview, or authorization. Supported planning
binds canonical paths, source kind and identity, relevant parent identities,
and destination absence before one exact authorization. Each effect crosses the
separate decision 0054 native namespace committer exactly once; a supported
invocation rechecks the approved state before mutation. Linux uses
guarded handle-relative traversal and
verified-parent `mkdirat` for `create_directory`. It returns `unsupported` for
`move` and `remove` before opening or observing the workspace namespace because
its admitted APIs cannot atomically bind the approved source identity to those
mutations. Windows anchors relevant parents with handle-relative `NtCreateFile`
and supports native create, rename, or disposition information classes. Missing
primitives or stale state fail closed without a pathname, cooperative-lock, or
rollback fallback. Every successful result is one stale-checked handle-relative
namespace commit, not recursive authority, multi-object atomicity, rollback,
durability, or a filesystem sandbox.

`run_process` accepts only the registered `node` program token, enforced before
approval by an owned exact-literal schema, an ordered list of literal arguments,
and one existing workspace-relative directory. It does
not accept a shell string, executable path, PATH lookup, stdin, environment, or
model-selected limits. Linux targets receive an empty environment. Windows
targets receive exactly one `SystemRoot` value queried by the native broker from
the operating system; no user environment is inherited. The adapter caps
arguments at 64 entries. Each argument and the relative working directory are
limited to 2,730 UTF-16 code units and 8,192 UTF-8 bytes, must be valid Unicode
scalar text, and cannot contain NUL. The exact aggregate approval projection is
limited to 8,192 UTF-16 code units before execution. Descendants are capped at
16, stdout and stderr at 65,536 bytes each, and execution at 120 seconds.
`run_process` runs terminating commands only. A local server or other persistent
process is not retained after the bounded invocation.

The workspace boundary constrains path selection for built-in filesystem tools
and the initial process working directory. Whole-tree containment constrains
the approved process lifetime and descendants. Neither is a machine sandbox:
approved Node code still has the launching user's filesystem and network
authority. Do not approve untrusted programs on the assumption that they are
confined to the displayed workspace.

OpenCode Go requests at most one tool call per model response. After that call
settles, the complete structured exchange is checkpointed and the same model is
opened again with the result before it authors another call. The owned
instruction requires it to reassess the remaining user goal, complete every
requested part or explain one blocker, consolidate all currently known edits to
one file into one `apply_patch`, and never repeat a failed request blindly. This
prevents ordinary dependent edits from being authored against the same stale
pre-result snapshot.

The provider-neutral boundary remains defensive. If a compatible service
returns several calls despite the request, one response may contain up to 32
ordered calls subject to the remaining per-turn, argument, output, and
conversation limits. The complete batch is validated without filesystem
observation before planning or invocation. Calls are planned just in time and
invoked sequentially in provider order. Every successfully planned call
receives one exact runtime permission decision. An `Ask` pauses independently;
session `Allow` and `Deny` modes are looked up again by exact tool name. This is
one decision by the same agent, not concurrent handlers, delegation, implicit
retry, or multi-agent orchestration.

Mutation preview line positions and added or removed line counts treat CRLF as
one line boundary and lone CR or LF as one boundary. The displayed metadata
therefore follows the same line-ending contract as the rest of the owned text
pipeline without rewriting the approved content.

The harness exposes one canonical name for each admitted capability and no
aliases. The verified inventory records why each current tool is necessary:

| Tool | Unique capability | Risk | Current necessity |
|---|---|---|---|
| `apply_patch` | `patch-one-text-file` | `write` | Creates or updates one file through ordered exact-text hunks without broad overwrite or shell authority. |
| `list_directory` | `enumerate-one-directory` | `read` | Discovers one directory without reading file contents or recursing. |
| `manage_path` | `manage-one-workspace-path` | `write` | Creates one directory, moves one file or directory, or removes one file or empty directory without shell or recursive authority. |
| `read_file` | `read-one-file` | `read` | Inspects one known file without traversing unrelated workspace paths. |
| `run_process` | `run-one-contained-process` | `execute` | Runs one terminating structured process inside owned whole-tree containment without shell, PATH, stdin, or inherited user-environment authority. |
| `search_text` | `search-bounded-text` | `read` | Locates exact text with bounded traversal instead of many model-directed reads. |

This table is the exact currently advertised surface. Decision
[0050](../decisions/0050-owned-minimal-coding-capability-surface.md) defines its
six non-overlapping authority domains. Decision
[0051](../decisions/0051-owned-bounded-file-line-projection.md) completes bounded
`read_file` range projection, decision
[0053](../decisions/0053-owned-structured-text-patch.md) converges text writes
as `apply_patch`, and decision
[0054](../decisions/0054-owned-workspace-namespace-management.md) converges
namespace mutation as `manage_path`, while decision
[0058](../decisions/0058-owned-linux-namespace-fail-closed-boundary.md) records
the operation-specific Linux fail-closed boundary. No overlapping legacy name
or alias remains. Decision
[0055](../decisions/0055-owned-session-tool-permissions.md) owns the session
permission modes and contextual decision path.

The execute tool currently resolves only `node` through one CLI-owned closed
registry. Unknown tokens fail before permission. Additional registered programs
need a closed argument policy and maintained evidence that they remove a real
coding constraint. An unrestricted shell is not currently available. A future
sandboxed `shell` may replace `run_process` only after a separate Windows and
Linux isolation proof; both execute names will never be advertised together.

A new tool must prove a distinct capability, current necessity, focused tests,
and independent removal before it is advertised. Decision 0014 forbids
convenience aliases and speculative tools; semantic overlap is a review
judgment rather than a claim inferred from registry labels.

Non-printing and directional Unicode in an exact permission-preview field is
shown as an explicit escaped code point. Patch formatting alone may introduce LF
as structural diff rows; every other unescaped unsafe scalar invalidates the
runtime event before it reaches the terminal, so a target path cannot be visually
reordered or concealed.

## Failure behavior

Tool errors expose only stable categories such as not found, permission,
conflict, limit, cancellation, unsupported, and I/O. Outside the exact bounded
permission effect preview, arguments and file contents do not enter notices,
activity, transcripts, or logs. Call identifiers, results, and thrown causes do
not enter those presentation paths. Once a
handler was invoked, even a malformed handler result becomes a generic
checkpointed failure so an external mutation cannot be silently repeated.
Normal process exit returns the bounded exit code, stdout, and stderr as
structured tool output. Exit code zero is successful tool activity. A nonzero
exit is failed tool activity, remains recoverable by the model, and preserves
the bounded output so the same agent can diagnose it. Timeout, cancellation,
output overflow, unsupported platform or program token, containment failure,
launch failure, malformed broker protocol, invalid UTF-8, and cleanup failure
return stable content-free categories and never commit partial process output.
The broker terminates the complete descendant tree before the tool settles.
Process groups, enumerated PID trees, and `taskkill /T` remain rejected
substitutes for the no-breakaway guarantee. Product support is limited to x64
Windows and x64 Linux; every other target fails closed.

An invalid `.agentignore` prevents startup rather than silently dropping custom
rules. The diagnostic contains no rejected pattern or path. Changes made after
startup do not affect the current session.

The release gate rejects duplicate canonical names, capability identifiers, or
necessity records; unsupported descriptor syntax; descriptor risk drift; and a
manual inventory that does not match source. It also confines production
descriptor construction to the registered CLI module. Review enforces the
semantic alias ban defined by decision 0014.

## Maintenance and removal

Changing a descriptor, risk class, planner, limit, permission preview, or
checkpoint rule requires schema, planner/handler, runtime, reducer, privacy,
cancellation, stale-state, and cleanup tests. Add, rename, or remove one tool
together with its descriptor, planner or handler, focused tests, policy record,
compact activity-presentation entry, and this inventory. A rename removes the old name;
it never retains an alias. Remove an advertised descriptor before deleting its
implementation, and keep the remaining registry buildable. Changing the
read-policy inventory, grammar, bounds, platform case behavior, loader, or
enforcement requires decision 0042, privacy/security prose, grammar and loader
tests, startup regression, and all three read-tool regressions in the same
change. Changing mutation planning, observation, identity checks, previews, or
invocation requires decisions 0042 and 0046 plus absent-target, identity-swap,
content-swap, parent-swap, malformed-Unicode, strict-UTF-8, cancellation,
bounded-preview, native protocol, complete large-write, conflicting-handle, and
forced-termination regressions on Windows and Linux. Remove planner registration
first, then remove the mutation-plan, preview, committer, protocol, and native
sources only after the affected write tools have been removed or replaced.
Never roll back to size-only approval, a stale approved invocation, or direct
Node writes. Never add negation or a handler-specific bypass.
Changing namespace grammar, planning, identity checks, permission previews,
protocol, platform capability, or commit primitives requires decisions 0054
and 0058 plus create, move, empty-directory, non-empty-directory, overwrite,
self-descendant, stale-state, native-protocol, cancellation, and
forced-termination regressions on Windows and Linux. Linux regressions must
prove that move and remove produce no observation, preview, authorization, or
mutation and remain `unsupported` until a new object-bound protocol is
accepted. Remove `manage_path` advertisement first,
then remove its planner, preview, committer, protocol, and native sources. Never
retain an unadvertised namespace alias or portable pathname fallback. Changing the
process registry, protocol, limits, output contract, executable resolution, or
containment backend also requires the complete Windows and Linux proof and
decision 0036 to change in the same review. Remove `run_process` advertisement
before its handler or adapter, then remove the native product build only when
no remaining proof or platform work consumes it. Tool-specific presenters are
forbidden; activity changes go through the one log and one presentation
function defined by decisions 0022, 0033, 0056, 0057, 0060, 0062, and 0063.

## Evidence

- Tool contracts and engine: `packages/agent-tools/src/index.ts`
- Tool convergence decision: `docs/decisions/0050-owned-minimal-coding-capability-surface.md`
- Bounded file projection decision: `docs/decisions/0051-owned-bounded-file-line-projection.md`
- Structured text-patch decision: `docs/decisions/0053-owned-structured-text-patch.md`
- Namespace management decision: `docs/decisions/0054-owned-workspace-namespace-management.md`
- Linux namespace fail-closed decision: `docs/decisions/0058-owned-linux-namespace-fail-closed-boundary.md`
- Session permission decision: `docs/decisions/0055-owned-session-tool-permissions.md`
- Compact activity decision: `docs/decisions/0056-owned-compact-tool-activity-line.md`
- Transparent human activity decision: `docs/decisions/0057-owned-transparent-human-tool-activity.md`
- Semantic patch diff foreground decision: `docs/decisions/0060-owned-semantic-patch-diff-foregrounds.md`
- Changed-only patch preview decision: `docs/decisions/0062-owned-changed-only-patch-preview.md`
- Terminal-separator patch preview decision: `docs/decisions/0063-owned-terminal-separator-patch-preview.md`
- Built-in filesystem adapters: `packages/agent-cli/src/builtin-tools.ts`
- Shared built-in limits: `packages/agent-cli/src/builtin-tool-limits.ts`
- Pure file line projection: `packages/agent-cli/src/workspace-file-read.ts`
- Pure structured text patching: `packages/agent-cli/src/workspace-text-patch.ts`
- Closed process program registry: `packages/agent-cli/src/process-program-registry.ts`
- Shared workspace path resolution: `packages/agent-cli/src/workspace-path.ts`
- Mutation effect plans: `packages/agent-cli/src/workspace-mutation-plans.ts`
- Bounded mutation previews: `packages/agent-cli/src/workspace-mutation-preview.ts`
- Mutation commit port: `packages/agent-cli/src/workspace-mutation-committer.ts`
- Native mutation adapter: `packages/agent-cli/src/platform-workspace-mutation.ts`
- Native mutation protocol: `packages/agent-cli/src/platform-workspace-mutation-protocol.ts`
- Native mutation entry point: `packages/agent-cli/native/mutation-commit/main.c`
- Native mutation protocol: `packages/agent-cli/native/mutation-commit/protocol.c`
- Native mutation contract: `packages/agent-cli/native/mutation-commit/mutation-commit.h`
- Linux mutation backend: `packages/agent-cli/native/mutation-commit/backend-linux.c`
- Windows mutation backend: `packages/agent-cli/native/mutation-commit/backend-windows.c`
- Native mutation rejection proof: `tools/test/native-mutation-commit.test.mjs`
- Pure namespace effect plans: `packages/agent-cli/src/workspace-namespace-plans.ts`
- Bounded namespace previews: `packages/agent-cli/src/workspace-namespace-preview.ts`
- Namespace commit port: `packages/agent-cli/src/workspace-namespace-committer.ts`
- Native namespace adapter: `packages/agent-cli/src/platform-workspace-namespace.ts`
- Native namespace protocol: `packages/agent-cli/src/platform-workspace-namespace-protocol.ts`
- Native namespace entry point: `packages/agent-cli/native/namespace-commit/main.c`
- Native namespace protocol: `packages/agent-cli/native/namespace-commit/protocol.c`
- Native namespace contract: `packages/agent-cli/native/namespace-commit/namespace-commit.h`
- Linux namespace backend: `packages/agent-cli/native/namespace-commit/backend-linux.c`
- Windows namespace backend: `packages/agent-cli/native/namespace-commit/backend-windows.c`
- Namespace protocol tests: `packages/agent-cli/test/platform-workspace-namespace-protocol.test.ts`
- Namespace adapter tests: `packages/agent-cli/test/platform-workspace-namespace.test.ts`
- Canonical workspace boundary: `packages/agent-cli/src/workspace-boundary.ts`
- Workspace-ignore grammar: `packages/agent-cli/src/workspace-ignore.ts`
- Workspace read policy: `packages/agent-cli/src/workspace-read-policy.ts`
- Trusted platform-root adapter: `packages/agent-cli/src/platform-workspace-roots.ts`
- Native platform-root resolver: `packages/agent-cli/native/workspace-roots/`
- Workspace trust decision: `docs/decisions/0042-owned-workspace-trust-boundary.md`
- Handle-relative mutation decision: `docs/decisions/0046-owned-handle-relative-mutation-commit.md`
- Process runner port: `packages/agent-cli/src/process-runner.ts`
- Node process adapter: `packages/agent-cli/src/node-process-runner.ts`
- Native broker protocol: `packages/agent-cli/src/process-broker-protocol.ts`
- Permission reducer: `packages/agent-cli/src/application.ts`
- Session permission policy: `packages/agent-cli/src/tool-permissions.ts`
- Permission presentation: `packages/agent-cli/src/permissions-view.ts`
- Activity lifecycle: `packages/agent-cli/src/tool-activity-log.ts`
- Pure activity projection: `packages/agent-cli/src/tool-activity-presentation.ts`
- Activity presentation: `packages/agent-cli/src/activity-view.ts`
- Accepted execution design: `docs/decisions/0008-owned-tool-execution.md`
- Lean-harness decision: `docs/decisions/0014-lean-tool-harness.md`
- Process-containment decision: `docs/decisions/0015-process-tree-containment.md`
- Native proof decision: `docs/decisions/0016-owned-native-process-containment.md`
- Structured process decision: `docs/decisions/0036-owned-structured-process-execution.md`
- Tool-activity decision: `docs/decisions/0022-owned-tool-activity-surface.md`
- Semantic-activity decision: `docs/decisions/0033-owned-semantic-activity-surfaces.md`
- Tool-call batch decision: `docs/decisions/0029-canonical-tool-call-batches.md`
- Convergent tool-turn decision: `docs/decisions/0061-owned-convergent-tool-turns.md`
- Owned model instruction: `packages/agent-cli/src/agent-instructions.ts`
- OpenCode Go request encoder: `packages/agent-provider-opencode-go/src/wire.ts`
- Visual-grammar decision: `docs/decisions/0028-owned-conversation-visual-grammar.md`
- Native broker contract: `packages/agent-cli/native/process-broker/broker.h`
- Cross-platform proof: `tools/test/native-process-broker.test.mjs`
