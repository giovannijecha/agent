# 0008: Owned tool execution and approval loop

- Status: accepted
- Date: 2026-08-07
- Amended: 2026-08-13 by decision 0042 for canonical root ownership and
  mutation effect planning
- Amended: 2026-08-14 by decision 0046 for owned handle-relative mutation
  commit
- Amended: 2026-08-15 by decision 0055 for session tool permissions
- Amended: 2026-08-16 by decision 0057 for human patch approval presentation
- Amended: 2026-08-16 by decision 0061 for convergent model-tool turns
- Amended: 2026-08-16 by decision 0069 for exact root-path guidance and
  content-free invalid-call reasons

Decision 0055 replaces implicit read allowance and the typed `/approve` and
`/deny` path with one exact-tool session policy and contextual decisions. The
schema, planning, checkpoint, and handler boundaries in this decision remain.
Decision 0057 replaces patch binding metadata in the permission UI with a
bounded human-readable diff; the immutable plan and commit binding remain exact.
Decisions 0061 and 0067 make both OpenCode adapters request one call per model response so each new
call is authored after the previous structured result is checkpointed. The
generic defensive batch and sequential execution contracts below remain exact.

## Context

The runtime can stream and commit text, but a coding agent must also inspect and
change a workspace. Tool calls cross four trust
boundaries: untrusted model output, user approval, operating-system I/O, and the
conversation sent back to the model. Hiding calls in text or executing shell
strings would make validation, cancellation, auditing, and removal unreliable.

The implementation must remain original, dependency-free, provider-neutral,
and compatible with the existing single-writer CLI and transactional runtime.

## Decision

Create the Node-free `@agent/tools` workspace. It depends only on `@agent/core`
and owns immutable descriptors, a bounded schema algebra, registry validation,
approval risk, pure call preparation, bounded effect plans, planner and handler
contracts, result containment, and one-call execution. Core gains immutable
structured values plus explicit tool-call and tool-result conversation entries.
No tool protocol is encoded inside message text.

The CLI remains the only Node boundary and implements the tools registered under
decision 0014. Their exact canonical names, risk classes, and current necessity
records live in the verified operator-manual inventory.

Decision 0014 governs this model-facing surface: every tool has one canonical
name, a distinct capability, documented current necessity, and an independent
removal path. Aliases and speculative convenience tools are forbidden.

Direct process execution is deliberately deferred. Killing one child process
does not prove that its descendants have stopped or released inherited pipes,
especially on Windows. Decision 0015 records that the present pure Node.js
boundary cannot prove no-breakaway containment. `run_process` must not be
advertised or allowlisted until the replacing cross-platform process-tree
boundary proves cancellation, timeout, environment isolation, output bounds,
owner-loss behavior, and cleanup without a shell.

Decision 0042 supersedes raw workspace-root composition. The CLI resolves the
exact startup directory once into one immutable canonical boundary before
credentials, providers, tools, or terminal ownership. Every path is resolved
beneath that accepted root. Symlink traversal, absolute input paths, parent
traversal, oversized input/output, unknown fields, and unsupported file kinds
fail closed. Decision 0055 gives every valid request one exact CLI permission
decision from its current per-tool session mode. A planning failure has no valid
invocation to permit and settles as a normal failed call. Direct handlers retain
descriptor projections.
Under decisions 0042, 0046, 0053, and 0057, `apply_patch` plans one concrete effect
just in time from observed filesystem state. Its bounded preview shows the
canonical target and complete human-readable removed and inserted logical rows
when they fit, or bounded prefix/suffix excerpts with an omitted-code-unit count.
Backslashes, tabs, and non-line controls or formats are escaped. Only the owned
formatter may introduce LF row separators; the CLI independently rejects every
other unescaped unsafe scalar, so bidi or zero-width content
cannot visually reorder or conceal the approved effect. Call identifiers,
results, and unbounded content remain hidden.

Decision 0029 supersedes the original one-call limit. The runtime accepts one
bounded ordered tool-call batch per model step, validates it completely before
effects, plans each call just in time after its predecessor settles, and invokes
handlers sequentially. Pure batch validation never performs planner I/O. A turn
has explicit tool-step and content limits. Once every call has a truthful result,
the runtime appends one
complete structured exchange to the candidate conversation and checkpoints that
candidate before the next model step. This checkpoint is the
truth boundary for external effects: later cancellation or model failure cannot
pretend an executed operation did not happen. Partial assistant text after the
last checkpoint remains prospective and is never committed.

Runtime emits bounded requested, started, and finished tool events through its
existing single event source. Permission is a synchronous runtime command; actual
execution advances only through `nextEvent`. Cancellation is shared with the
active tool handler, and runtime stop waits for handler settlement before
releasing terminal state. Tool failures and denied permissions become structured,
content-free tool results so the model may respond. Once a handler has been
invoked, a throw, malformed result, or oversized result becomes a generic
structured failure that is checkpointed before the turn terminates. This avoids
repeating an effect merely because its handler broke the return contract.

The TUI gains no product-specific framework primitive. Decision 0022 replaces
the initial transient status with one CLI-owned bounded activity log rendered
through the generic component stack. It retains only the latest activity while
the current turn is active and maps every tool through the same presentation
path. Only a display action, optional admitted safe subject, explicit state, and
an owned bounded descriptor projection or effect preview are rendered. Canonical
tool name and risk validate the projection without repeating visibly. Outside that preview, raw arguments
and content fields are not rendered or logged. Call identifiers, outputs,
provider data, credentials, and causes are never rendered or logged.

## Limits and security

Structured values bound depth, nodes, keys, list entries, strings, and aggregate
code units. Schemas bound fields and recursion independently. Registries bound
tool count and reject duplicate or invalid names. Runtime bounds tool steps per
turn. Filesystem traversal, directory enumeration, searched directories and
entries, file size, text volume, and matches are bounded at the Node adapter.

Foreign values, planner/handler promises, effect plans, and results are decoded
into owned snapshots before state mutation. Errors never retain model arguments,
file contents, credentials, or thrown causes. Mutation tools use explicit
preconditions; `apply_patch` binds either absent-target creation or ordered
unique exact-text hunks to one file identity and complete content. Decision 0046
invokes that immutable effect through one owned Windows/Linux
handle-relative committer with no portable pathname-write fallback. Unsupported
exclusion or publication primitives fail closed. Directory reads are
incremental, and recursive search revalidates canonical paths before enumeration
and before and after file reads. The native commit closes ordinary retargeting
and conflicting-content races for one selected object; current behavior is not
a multi-file transaction, crash rollback, durability guarantee, or filesystem
sandbox.

## Update, rollback, and removal

Change schemas, limits, risk classes, planners, checkpoint rules, or built-in
tools only with core, engine, Node-adapter, runtime, reducer, privacy,
cancellation, stale-state, and cleanup regressions. Provider adapters translate
their wire protocol only into the public structured model/tool contract.

To remove tools, first stop advertising descriptors and restore the text-only
runtime path. Remove CLI permission policy and selectors, tool activity, Node handlers, and the
runtime tool dependency. Then remove structured tool entries if no consumer
remains, delete `@agent/tools` from every registry, remove this decision, clean
derived artifacts, and remove decisions 0014 and 0015. Replace manual-policy
schema 3 so it removes the advertised inventory and `blockedTools`, including
`run_process`, then remove every ownership, required-path, and manual-evidence
registration for the three decisions and run the canonical verifier. Text chat,
TUI, and the providerless CLI must remain buildable throughout rollback.
