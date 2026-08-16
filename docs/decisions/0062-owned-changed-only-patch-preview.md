# 0062: Owned changed-only patch preview

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0053, 0057, and 0060
- Terminal-separator ambiguity amended by: decision 0063

## Context

The bounded `apply_patch` permission preview from decision 0057 renders every
logical row in each exact `oldText` and `newText` field. A model commonly keeps
surrounding lines inside both fields to make an anchor unique. Those identical
rows are part of the immutable patch binding, but presenting them once as
removed and again as inserted falsely makes unchanged context look like work.
In a compact HTML edit this can repeat closing tags while obscuring the actual
style, text, or comment change.

The permission must remain bound to the complete exact hunk, including retained
context, line endings, observed content, identities, and digests. The display
therefore cannot rewrite the plan, reparse a general diff, infer syntax, or
collapse merely similar text.

## Decision

Before applying the existing approval-preview budget, the CLI projects each
validated hunk to changed logical rows. It splits `oldText` and `newText` only at
CRLF, lone CR, and LF boundaries while retaining each original separator in the
comparison token. It then removes the longest exact common prefix and longest
non-overlapping exact common suffix of complete logical-row tokens.

Comparison is code-unit exact. A row with a different separator, whitespace,
case, spelling, or scalar is not shared context and remains present on both
sides. Partial-line prefixes and suffixes are never removed. Prefix and suffix
trimming is local to one hunk; rows are never compared, moved, merged, or
reordered across hunks.

After trimming, the existing formatter emits only non-empty changed sides with
the exact `- ` and `+ ` direction prefixes. A side may disappear when an update
is a pure insertion or deletion relative to retained context, but every valid
non-no-op hunk retains at least one visible changed row. A structural line
separator does not create an additional empty terminal display row. Empty-file
creation keeps its explicit `+ [empty file]` row. Decision 0063 adds an inline
ASCII separator escape only when unequal terminal separators would otherwise
leave the opposite patches with the same displayed rows.

The compacted changed fields enter the existing deterministic excerpt and
2,048-code-unit preview budget. Omitted counts describe only code units in the
changed projection; exact context removed by this decision is neither counted
as omitted nor disclosed. The maximum 32-hunk compact fallback remains bounded
by the existing path reservation. Direction tones from decision 0060 apply
unchanged after the canonical projection validates every retained row.

The complete untrimmed structured hunk remains the sole planner, authorization,
stale-state, and native-commit input. The displayed diff is never reparsed and
cannot broaden or narrow the authorized effect.

## Failure and security behavior

The projection fails closed if a supplied hunk is a no-op or if compaction would
leave a purported changed patch without a display row. Product planning already
rejects those states before preview construction; the formatter repeats the
check as a defensive internal boundary.

Unsafe scalar escaping, path validation, exact permission choice, lifecycle
visibility, structured schema limits, observation policy, object identity,
state digests, and one object-bound commit remain unchanged. Removing identical
context reduces terminal disclosure and does not grant a new read, write,
namespace, process, or concurrency capability.

## Verification

Pure formatter regressions cover exact shared prefixes, exact shared suffixes,
both together, pure insertion and deletion around retained context, repeated
context rows, mixed separators, partial-line similarity, terminal separators,
multiple hunks, empty-file creation, excerpts, and the maximum 32-hunk/path
fallback. One concrete HTML regression proves retained closing tags do not
appear as removed and inserted while the style, heading, and comment changes
remain visible.

Existing planner, stale-state, permission, activity-tone, native-committer, and
canonical Windows and Linux verification remain authoritative.

## Update, rollback, and removal

Changing the logical-row tokenizer, exact comparison, trimming scope, omitted
counts, terminal-row rule, or lifecycle visibility requires this decision,
decisions 0053, 0057, and 0060, formatter tests, operator guidance, architecture,
engineering, maintenance, privacy, security, and policy registries to change
together.

Rollback removes changed-only compaction and restores the complete bounded hunk
fields without changing the immutable patch plan. Removing patch preview or
`apply_patch` still follows decisions 0053 and 0057; do not leave a dormant
projection or introduce another mutation authority.
