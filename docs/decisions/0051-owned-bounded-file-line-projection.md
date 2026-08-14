# 0051: Owned bounded file line projection

- Status: accepted
- Date: 2026-08-14

## Context

The initial `read_file` capability accepts one workspace-relative path and
returns the complete permitted UTF-8 file within the existing file and tool
output bounds. This preserves exact content, but a model that needs one local
region must receive the entire file or repeat discovery through other tools.
Decision 0050 identifies bounded range reads as an efficiency improvement
inside the existing read authority rather than a new capability.

Line projection must not create a second file reader, private disclosure
policy, alternate path resolver, hidden truncation, or numbered text that no
longer matches the source. It must also describe its actual implementation
honestly: selecting lines from the already bounded file reduces provider
context, but does not prove handle-relative random-access filesystem reading.

## Decision

`read_file` retains its canonical name, read risk, path field, workspace
boundary, disclosure policy, and complete-file size bounds. Its closed input
schema adds two optional integers:

- `startLine` is the one-based first logical line and is bounded from 1 through
  262,145. It defaults to 1.
- `lineCount` is the maximum number of logical lines returned and is bounded
  from 1 through 512. When omitted, every remaining line is returned.

A call containing only `path` therefore preserves the existing complete-text
behavior. `lineCount` without `startLine` selects from line 1, while
`startLine` without `lineCount` selects from that line through the end.

The successful result is one immutable structured value with exactly:

- `text`: the exact selected source substring with original line terminators;
- `startLine`: the actual one-based selection start, clamped to one position
  beyond the final line when the request starts beyond end of file;
- `lineCount`: the number of logical lines represented by `text`;
- `totalLines`: the complete bounded file's logical line count; and
- `hasMore`: whether at least one logical line follows the selected text.

Logical lines are separated by LF. A CR immediately before LF remains part of
that exact terminator. A non-empty unterminated tail is one line, an empty file
has zero lines, and a final LF does not create a phantom empty line. Selecting
through a terminated line retains its terminator. No line number, prefix,
normalization, ellipsis, or synthetic newline is inserted into `text`.

The CLI owns one pure projection module. The built-in handler continues to
perform the same lexical denial before observation, canonical resolution,
bounded single read, cancellation check, and post-read path and policy check.
Projection occurs only after those checks succeed. It does not expand the set
of readable files, the maximum source size, the evaluation receipt authority,
or the number of model-facing tools.

## Bounds and failures

The existing 262,144-code-unit source bound and tool-engine output bound remain
authoritative. `lineCount` bounds logical rows, not code units; one long line is
still constrained by the complete source and output bounds. A request beyond
the final line succeeds with empty `text`, an actual `startLine` equal to
`totalLines + 1`, zero returned lines, and `hasMore: false`. This makes end of
file explicit without inventing a filesystem or schema failure.

Invalid integer types and individual bounds fail during complete-batch schema
validation before filesystem observation. A malformed direct projection call
fails closed with an immutable content-free error. Existing cancellation,
permission, not-found, I/O, source-limit, and output-limit behavior is
unchanged. No rejected source content enters errors, activity, logs, fixtures,
or documentation.

The evaluation receipt continues to identify `read_file` by its canonical
resolved target. Different ranges of the same file count as repeated access to
that file, which measures additional filesystem observations without retaining
range or content data.

## Verification

Pure projection tests cover empty, terminated, unterminated, LF, CRLF,
partial, exact-end, and beyond-end selections; default behavior; the 512-line
bound; immutable results; and invalid direct inputs. Built-in contract tests
cover the descriptor's exact optional fields, complete-file compatibility,
metadata, schema rejection before observation, disclosure-policy reuse, and
unchanged tool inventory.

The manual and architectural documentation state that projection reduces
returned context but still performs one bounded complete-file observation.
The canonical Windows and Linux gates remain mandatory.

## Update, rollback, and removal

Changing line semantics, metadata fields, range limits, or read mechanics
requires this decision, the shared built-in limits, projection module, schema,
handler, focused tests, manual, architecture, engineering guidance, and
maintenance guidance to change together.

Rollback removes `startLine`, `lineCount`, the added result metadata, and the
projection module in one change, restoring the exact `{ path } -> { text }`
contract and its tests. Removing `read_file` follows decisions 0014 and 0050;
delete its descriptor and handler before removing this decision and the
projection module. No dormant schema field, compatibility alias, or alternate
reader remains after rollback or removal.
