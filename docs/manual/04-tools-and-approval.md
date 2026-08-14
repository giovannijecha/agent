# 04 - Tools and approval

## Purpose

Use this chapter to understand the current registered workspace tools, their
safety classes, and the exact approval boundary for filesystem mutations and
contained process execution.

## Operator workflow

When a model runtime is available, tools registered as `read` run automatically.
A `write` or `execute` call pauses only after it has a valid concrete invocation.
Inspect the exact approval summary, then enter `/approve` or `/deny`. The
decision applies to that one pending call only and is never cached. If effect
planning fails, the call reports failure without approval because there is no
effect to authorize. The current exact names and risk classes are in the
verified inventory below.

Every tool uses the same activity document. Its explicit states are `approval`,
`queued`, `running`, `cancelling`, `succeeded`, `failed`, `denied`, and
`cancelled`. The log keeps exactly one contextual activity beside the composer
while its turn is active. Approval,
execution, and terminal outcome update that surface; the next tool replaces it,
turn settlement removes it, and tool activity never enters the transcript.
Every state uses the same borderless semantic surface. A restrained dark green,
ochre, or red background reinforces success, active or approval, and negative
terminal state; the written state remains explicit. The tool name is neutral
italic text. Approval uses the same component and retains `/approve` and
`/deny` before optional safe detail when space is limited.

## Guarantees and limits

Every tool receives a validated structured object and the same immutable
canonical workspace boundary selected before startup. The footer exposes that
exact absolute root; tool handlers do not select or recanonicalize another one.
Absolute model inputs, parent escape, symbolic links, unsupported file kinds,
unknown fields, and oversized data fail closed.
Files are limited to 262,144 code units. Directory listing is limited to 512
entries. Recursive exact-text search is limited to 512 directories, 4,096
entries, 2,048 files, 256 matches, and 4,194,304 scanned code units.

The automatic read tools share one immutable disclosure policy loaded before
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
`list_directory` rejects a denied target and omits denied children.
`search_text` rejects a denied root and prunes denied directories and files
before opening them; resolved traversal targets are rechecked before
observation. Hidden entries still consume the raw enumeration bounds. The
policy does not inspect content and does not restrict `create_file`,
`replace_text`, or approved `run_process` code.

`create_file` and `replace_text` use the same three-state mutation lifecycle:
pure schema preparation, just-in-time effect planning, then exact approval and
invocation. A creation plan proves that the canonical target is absent and
binds the effect to the parent identity, proposed complete content, and its
SHA-256 digest. A replacement plan opens the canonical regular file, requires
strict UTF-8 and exactly one match, then binds the effect to the file identity,
complete observed content, resulting content, and both SHA-256 digests. The
approval surface is limited to 2,048 code units. It shows exact proposed or
removed/inserted content when it fits; otherwise it shows bounded prefix and
suffix excerpts plus an explicit omitted-code-unit count. Invocation rejects a
changed identity, parent, target absence, canonical path, or complete content as
`conflict` before mutation. No stale plan is silently refreshed or broadened.

After approval, both tools invoke the one decision 0046 native committer. It
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

One model response may select up to 32 ordered tool calls, subject to the
remaining per-turn, argument, output, and conversation limits. The complete
batch is validated without filesystem observation before planning or invocation.
Calls are then planned just in time and invoked sequentially in provider order,
so a later mutation observes the settled result of every earlier call. Every
successfully planned write or execute call pauses for its own decision; one
approval never covers another call. A batch is one decision by the same agent,
not delegation or multi-agent orchestration.

Mutation preview line positions and added or removed line counts treat CRLF as
one line boundary and lone CR or LF as one boundary. The displayed metadata
therefore follows the same line-ending contract as the rest of the owned text
pipeline without rewriting the approved content.

The harness exposes one canonical name for each admitted capability and no
aliases. The verified inventory records why each current tool is necessary:

| Tool | Unique capability | Risk | Current necessity |
|---|---|---|---|
| `create_file` | `create-new-file` | `write` | Creates a new file without broad overwrite or process authority. |
| `list_directory` | `enumerate-one-directory` | `read` | Discovers one directory without reading file contents or recursing. |
| `read_file` | `read-one-file` | `read` | Inspects one known file without traversing unrelated workspace paths. |
| `replace_text` | `replace-one-exact-match` | `write` | Changes one exact match without arbitrary overwrite or shell authority. |
| `run_process` | `run-one-contained-process` | `execute` | Runs one terminating structured process inside owned whole-tree containment without shell, PATH, stdin, or inherited user-environment authority. |
| `search_text` | `search-bounded-text` | `read` | Locates exact text with bounded traversal instead of many model-directed reads. |

A new tool must prove a distinct capability, current necessity, focused tests,
and independent removal before it is advertised. Decision 0014 forbids
convenience aliases and speculative tools; semantic overlap is a review
judgment rather than a claim inferred from registry labels.

Non-printing and directional Unicode in an exact approval field is shown as an
explicit escaped code point. An unescaped unsafe scalar invalidates the runtime
event before it reaches the terminal, so a target path cannot be visually
reordered or concealed.

## Failure behavior

Tool errors expose only stable categories such as not found, permission,
conflict, limit, cancellation, unsupported, and I/O. Outside the exact bounded
approval effect preview, arguments and file contents do not enter notices,
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

Changing a descriptor, risk class, planner, limit, approval preview, or
checkpoint rule requires schema, planner/handler, runtime, reducer, privacy,
cancellation, stale-state, and cleanup tests. Add, rename, or remove one tool
together with its descriptor, planner or handler, focused tests, policy record,
and this inventory. A rename removes the old name;
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
Node writes. Never add negation or a handler-specific bypass. Changing the
process registry, protocol, limits, output contract, executable resolution, or
containment backend also requires the complete Windows and Linux proof and
decision 0036 to change in the same review. Remove `run_process` advertisement
before its handler or adapter, then remove the native product build only when
no remaining proof or platform work consumes it. Tool-specific presenters are
forbidden; activity changes go through the one log and one presentation
function defined by decision 0022.

## Evidence

- Tool contracts and engine: `packages/agent-tools/src/index.ts`
- Built-in filesystem adapters: `packages/agent-cli/src/builtin-tools.ts`
- Shared built-in limits: `packages/agent-cli/src/builtin-tool-limits.ts`
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
- Approval reducer: `packages/agent-cli/src/application.ts`
- Activity lifecycle: `packages/agent-cli/src/tool-activity-log.ts`
- Activity presentation: `packages/agent-cli/src/activity-view.ts`
- Accepted execution design: `docs/decisions/0008-owned-tool-execution.md`
- Lean-harness decision: `docs/decisions/0014-lean-tool-harness.md`
- Process-containment decision: `docs/decisions/0015-process-tree-containment.md`
- Native proof decision: `docs/decisions/0016-owned-native-process-containment.md`
- Structured process decision: `docs/decisions/0036-owned-structured-process-execution.md`
- Tool-activity decision: `docs/decisions/0022-owned-tool-activity-surface.md`
- Semantic-activity decision: `docs/decisions/0033-owned-semantic-activity-surfaces.md`
- Tool-call batch decision: `docs/decisions/0029-canonical-tool-call-batches.md`
- Visual-grammar decision: `docs/decisions/0028-owned-conversation-visual-grammar.md`
- Native broker contract: `packages/agent-cli/native/process-broker/broker.h`
- Cross-platform proof: `tools/test/native-process-broker.test.mjs`
