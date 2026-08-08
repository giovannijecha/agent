# 04 - Tools and approval

## Purpose

Use this chapter to understand the five current workspace tools, their safety
classes, and the exact approval boundary for filesystem mutations.

## Operator workflow

When a model runtime is available, `read_file`, `list_directory`, and
`search_text` run automatically because they are read-only. `create_file` and
`replace_text` pause before execution. Inspect the exact target path and bounded
content-size summary, then enter `/approve` or `/deny`. The decision applies to
that one pending call only and is never cached.

## Guarantees and limits

Every tool receives a validated structured object and resolves paths beneath
one explicit absolute workspace root. Absolute inputs, parent escape, symbolic
links, unsupported file kinds, unknown fields, and oversized data fail closed.
Files are limited to 262,144 code units. Directory listing is limited to 512
entries. Recursive exact-text search is limited to 512 directories, 4,096
entries, 2,048 files, 256 matches, and 4,194,304 scanned code units.
`create_file` refuses overwrite; `replace_text` requires exactly one match.

Non-printing and directional Unicode in an exact approval field is shown as an
explicit escaped code point. An unescaped unsafe scalar invalidates the runtime
event before it reaches the terminal, so a target path cannot be visually
reordered or concealed.

## Failure behavior

Tool errors expose only stable categories such as not found, permission,
conflict, limit, cancellation, unsupported, and I/O. Arguments, file contents,
call identifiers, results, and thrown causes do not enter notices. Once a
handler was invoked, even a malformed handler result becomes a generic
checkpointed failure so an external mutation cannot be silently repeated.
Direct process execution is not available.

## Maintenance and removal

Changing a descriptor, risk class, limit, approval preview, or checkpoint rule
requires schema, handler, runtime, reducer, privacy, cancellation, and cleanup
tests. Remove advertised descriptors and restore text-only turns before deleting
the tool engine. Process execution requires a separate accepted cross-platform
process-tree contract.

## Evidence

- Tool contracts and engine: `packages/agent-tools/src/index.ts`
- Built-in filesystem adapters: `packages/agent-cli/src/builtin-tools.ts`
- Approval reducer: `packages/agent-cli/src/application.ts`
- Accepted execution design: `docs/decisions/0008-owned-tool-execution.md`
