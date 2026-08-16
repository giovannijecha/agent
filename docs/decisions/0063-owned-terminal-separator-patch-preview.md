# 0063: Owned terminal-separator patch preview

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0053, 0057, 0060, and 0062

## Context

Decision 0062 removes exact shared logical-row context while retaining original
line separators in comparison. Its display formatter then converts every
retained CRLF, lone CR, or LF separator to a structural display break and drops
the final empty split result. That avoids a false empty diff row, but it makes a
terminal-separator-only replacement ambiguous: removing the final LF from
`line` and adding it back both display the same `- line` and `+ line` rows.

The approval surface must distinguish those opposite effects without exposing
an internal tuple, adding a false logical row, or changing the complete patch
plan that permission authorizes.

## Decision

For each compacted hunk, the CLI compares the exact terminal CRLF, lone CR, LF,
or absence on both changed fields. It exposes a terminal separator only when
the separators differ and removing each one leaves code-unit-identical field
text. In that otherwise ambiguous case, the separator appears on the same
owning diff row as the exact ASCII escape `\r\n`, `\r`, or `\n`. Ordinary
content changes and equal terminal separators retain the compact decision-0062
display. A nonterminal separator remains one formatter-owned structural LF
between diff rows.

A truncated prefix does not claim that its last retained separator is the field
terminator; an exact field and an excerpt suffix do when the hunk comparison
requires the distinction.

Source backslashes retain the existing escape rule and become `\\` before
display. A physical terminal LF therefore appears as `line\n`, while source
text containing the two literal characters backslash and `n` appears as
`line\\n`. The direction prefix remains the authority for removal or
insertion, and the inline escape remains inside that same direction-colored
logical row. No empty diff row is introduced.

The conditional inline escape participates in the existing 2,048-code-unit
rendered preview bound. Excerpt selection and omitted counts continue to
measure the original changed field's code units. If the compact zero-budget
fallback retains only an omitted count, it does not invent a
terminal-separator claim.

The complete untrimmed structured hunk, including its exact original line
endings, remains the sole planner, permission, stale-state, and native-commit
input. The display is not reparsed and gains no mutation authority.

## Failure and security behavior

Only the three admitted line separators receive terminal escapes. Existing
unsafe-scalar escaping, path validation, direction-prefix validation, preview
bounds, and fail-closed projection remain unchanged. An unknown control scalar
cannot select an escape or create a structural row.

The change reveals only separator ownership already admitted by the bounded
human-readable patch preview. It grants no new read, write, namespace, process,
provider, permission, or concurrency capability and retains the same
object-bound commit.

## Verification

Pure formatter regressions cover adding and removing one terminal LF, replacing
terminal CRLF with LF, removing lone CR, distinguishing a literal source
`\\n`, leaving ordinary equal-separator content compact, exact multi-row
creation, and the absence of an empty direction row. Existing excerpt, maximum
hunk/path fallback, projection, activity-tone, permission, stale-state, native
commit, and canonical Windows and Linux tests remain authoritative.

## Update, rollback, and removal

Changing the terminal escape vocabulary, source-backslash distinction,
exact-tail rule, structural separator, budget accounting, or direction ownership
requires this decision, decisions 0053, 0057, 0060, and 0062, formatter tests,
`AGENTS.md`, operator guidance, architecture, engineering, maintenance, privacy,
security, and policy registries to change together.

Rollback removes only the inline terminal escapes and restores the ambiguous
decision-0062 terminal-row presentation; it does not change the immutable patch
plan. Removing the preview or `apply_patch` follows decisions 0053 and 0057 and
must not leave this formatter path or decision as dormant authority.
