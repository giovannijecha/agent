# 0008: Owned tool execution and approval loop

- Status: accepted
- Date: 2026-08-07

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
approval risk, handler contracts, result containment, and one-call execution.
Core gains immutable structured values plus explicit tool-call and tool-result
conversation entries. No tool protocol is encoded inside message text.

The CLI remains the only Node boundary and implements five initial tools:

- `read_file`, `list_directory`, and `search_text` are read-only;
- `create_file` and `replace_text` mutate workspace files.

Direct process execution is deliberately deferred. Killing one child process
does not prove that its descendants have stopped or released inherited pipes,
especially on Windows. `run_process` must not be advertised or allowlisted until
an owned cross-platform process-tree boundary proves cancellation, timeout,
environment isolation, output bounds, and cleanup without a shell.

Every path is resolved beneath one explicit workspace root. Symlink traversal,
absolute input paths, parent traversal, oversized input/output, unknown fields,
and unsupported file kinds fail closed. Read-only calls run automatically.
Write and execute calls require the exact interactive `/approve` or `/deny`
command for the single pending call. No approval is cached or broadened.
Mutation descriptors declare a bounded approval summary. The CLI shows the
exact target path and content-size fields before it accepts a decision; call
identifiers, file content, and results remain hidden. Exact string fields escape
Unicode control, format, surrogate, private-use, line-separator, and
paragraph-separator scalars before display. The CLI independently rejects an
unescaped unsafe scalar, so bidi or zero-width content cannot visually reorder
or conceal the approved target.

The runtime accepts at most one tool call per model step and executes calls
sequentially. A turn has explicit tool-step and content limits. A completed tool
attempt appends its structured call and result to the candidate conversation and
checkpoints that candidate before the next model step. This checkpoint is the
truth boundary for external effects: later cancellation or model failure cannot
pretend an executed operation did not happen. Partial assistant text after the
last checkpoint remains prospective and is never committed.

Runtime emits bounded requested, started, and finished tool events through its
existing single event source. Approval is a synchronous runtime command; actual
execution advances only through `nextEvent`. Cancellation is shared with the
active tool handler, and runtime stop waits for handler settlement before
releasing terminal state. Tool failures and denied approvals become structured,
content-free tool results so the model may respond. Once a handler has been
invoked, a throw, malformed result, or oversized result becomes a generic
structured failure that is checkpointed before the turn terminates. This avoids
repeating an effect merely because its handler broke the return contract.

The TUI gains no product-specific framework primitive. CLI composes existing
text components into one contextual tool-status slot that disappears at idle.
Only the descriptor-declared approval summary is rendered. Raw arguments,
content fields, call identifiers, outputs, and causes are not rendered or logged.

## Limits and security

Structured values bound depth, nodes, keys, list entries, strings, and aggregate
code units. Schemas bound fields and recursion independently. Registries bound
tool count and reject duplicate or invalid names. Runtime bounds tool steps per
turn. Filesystem traversal, directory enumeration, searched directories and
entries, file size, text volume, and matches are bounded at the Node adapter.

Foreign values, handler promises, and results are decoded into owned snapshots
before state mutation. Errors never retain model arguments, file contents,
credentials, or thrown causes. Mutation tools use explicit
preconditions; `replace_text` requires one exact match and `create_file` refuses
overwrite. Directory reads are incremental, and recursive search revalidates
canonical paths before enumeration and before and after file reads. The current
filesystem contract assumes no hostile concurrent namespace replacement by an
external process; any stronger boundary requires handle-relative platform
support and a replacing decision.

## Update, rollback, and removal

Change schemas, limits, approval classes, checkpoint rules, or built-in tools
only with core, engine, Node-adapter, runtime, reducer, privacy, cancellation,
and cleanup regressions. Provider adapters translate their wire protocol only
into the public structured model/tool contract.

To remove tools, first stop advertising descriptors and restore the text-only
runtime path. Remove CLI approval commands, tool status, Node handlers, and the
runtime tool dependency. Then remove structured tool entries if no consumer
remains, delete `@agent/tools` from every registry, remove this decision, clean
derived artifacts, and run the canonical verifier. Text chat, TUI, and the
providerless CLI must remain buildable throughout rollback.
