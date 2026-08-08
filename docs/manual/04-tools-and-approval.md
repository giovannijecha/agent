# 04 - Tools and approval

## Purpose

Use this chapter to understand the current registered workspace tools, their
safety classes, and the exact approval boundary for filesystem mutations.

## Operator workflow

When a model runtime is available, tools registered as `read` run automatically;
tools registered as `write` or `execute` pause before execution. Inspect the
exact approval summary, then enter `/approve` or `/deny`. The decision applies
to that one pending call only and is never cached. The current exact names and
risk classes are in the verified inventory below; no `execute` tool is admitted.

## Guarantees and limits

Every tool receives a validated structured object and resolves paths beneath
one explicit absolute workspace root. Absolute inputs, parent escape, symbolic
links, unsupported file kinds, unknown fields, and oversized data fail closed.
Files are limited to 262,144 code units. Directory listing is limited to 512
entries. Recursive exact-text search is limited to 512 directories, 4,096
entries, 2,048 files, 256 matches, and 4,194,304 scanned code units.
`create_file` refuses overwrite; `replace_text` requires exactly one match.

The harness exposes one canonical name for each admitted capability and no
aliases. The verified inventory records why each current tool is necessary:

| Tool | Unique capability | Risk | Current necessity |
|---|---|---|---|
| `create_file` | `create-new-file` | `write` | Creates a new file without broad overwrite or process authority. |
| `list_directory` | `enumerate-one-directory` | `read` | Discovers one directory without reading file contents or recursing. |
| `read_file` | `read-one-file` | `read` | Inspects one known file without traversing unrelated workspace paths. |
| `replace_text` | `replace-one-exact-match` | `write` | Changes one exact match without arbitrary overwrite or shell authority. |
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
conflict, limit, cancellation, unsupported, and I/O. Arguments, file contents,
call identifiers, results, and thrown causes do not enter notices. Once a
handler was invoked, even a malformed handler result becomes a generic
checkpointed failure so an external mutation cannot be silently repeated.
Direct process execution is not available.

The release gate rejects duplicate canonical names, capability identifiers, or
necessity records; unsupported descriptor syntax; descriptor risk drift; and a
manual inventory that does not match source. It also confines production
descriptor construction to the registered CLI module. Review enforces the
semantic alias ban defined by decision 0014.

## Maintenance and removal

Changing a descriptor, risk class, limit, approval preview, or checkpoint rule
requires schema, handler, runtime, reducer, privacy, cancellation, and cleanup
tests. Add, rename, or remove one tool together with its descriptor, handler,
focused tests, policy record, and this inventory. A rename removes the old name;
it never retains an alias. Remove an advertised descriptor before deleting its
implementation, and keep the remaining registry buildable. Process execution
requires a separate accepted cross-platform process-tree contract.

## Evidence

- Tool contracts and engine: `packages/agent-tools/src/index.ts`
- Built-in filesystem adapters: `packages/agent-cli/src/builtin-tools.ts`
- Approval reducer: `packages/agent-cli/src/application.ts`
- Accepted execution design: `docs/decisions/0008-owned-tool-execution.md`
- Lean-harness decision: `docs/decisions/0014-lean-tool-harness.md`
