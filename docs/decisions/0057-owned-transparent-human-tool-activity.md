# 0057: Owned transparent human tool activity

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0022, 0027, 0028, 0033, 0043, 0053, and 0056
- Patch diff foregrounds amended by: decision 0060
- Patch context compaction amended by: decision 0062

Decision 0060 retains the transparent human-readable patch preview while
giving removed and inserted rows separate non-bold red and green foregrounds.
Decision 0062 retains the exact immutable patch while removing only complete
code-unit-identical context rows from both display sides of one hunk.

## Context

Decision 0056 reduced the current tool snapshot to one compact line, but the
remaining stage-wide semantic background still reads as a broad card beside
the unboxed conversation. Its ordinary head also places a display action,
canonical tool name, and risk class together. For `read_file`, that produces
the visually repetitive `Read read_file read` without adding operator value.

The `apply_patch` permission preview has a related information-design failure.
It exposes the internal structured binding projection, including state digests,
field names, tuple lengths, and aggregate counters. Those values support the
owned plan contract but obscure the removed and inserted text that the operator
actually needs to judge.

The correction must preserve the exact permission decision, bounded preview,
stale-state proof, one object-bound commit, latest-only lifecycle, generic TUI
composition, and closed tool inventory. It must not turn display labels into
tool aliases or move tool activity into the transcript.

The operator screenshots are treated only as observable feedback about density,
hierarchy, and legibility. No foreign source, component hierarchy, identifier,
literal, timing, or rendering algorithm is inspected or reused.

## Decision

Every current tool snapshot remains inside the shared stage-wide `Surface`, but
that surface is transparent in every lifecycle state. Success, attention, and
negative truth move to the foreground of the status mark and written state.
The action and optional safe subject remain neutral. The state is always written,
so color is never the sole carrier of truth. No activity background, border,
rail, card, or private width path remains.

The compact head contains only:

- the registered bullet or ASCII `x` status mark;
- one display-only human action (`Read`, `List`, `Search`, `Write`, `Manage`, or
  `Run`);
- one optional safe subject when the current owned preview supplies useful
  context; and
- the written lifecycle state, right-aligned with retention priority.

The canonical tool name and risk class remain authoritative inputs to the pure
presentation table and still fail closed on unknown identity or risk drift, but
they are not repeated in the visible ordinary head. Narrow layouts discard the
optional subject before the action or written state.

For `apply_patch`, replace the internal binding dump with one CLI-owned readable
diff projection. Its first row contains the canonical workspace-relative path.
The head consumes that path as its optional subject. Remaining rows prefix
removed logical text with `- ` and inserted logical text with `+ `. Backslashes,
tabs, and non-line control or format scalars are escaped before display. The
formatter alone may introduce LF separators; every other control, Unicode line
separator, and paragraph separator remains invalid at the generic effect-plan,
runtime-event, and activity-log boundaries.

Within each validated hunk, remove only the longest exact common prefix and
non-overlapping exact common suffix of complete logical rows before display.
Original separators participate in comparison, partial rows never collapse,
and compaction never crosses a hunk. A pure insertion or deletion may therefore
show only one direction, while the complete untrimmed hunk remains bound to the
permission and native commit. Structural separators do not create a false empty
terminal display row.

The complete compacted changed logical text is shown when the
2,048-code-unit patch preview
bound permits. Larger remove and insert fields retain deterministic prefix and
suffix excerpts with an explicit omitted-code-unit count. The compact fallback
keeps one omitted count for every non-empty remove and insert field, so every
ordered hunk remains represented. CRLF, lone CR, and LF become structural display
rows while the immutable plan retains the exact original line endings. An
empty-file creation has an explicit
inserted empty-file row. Digest values, object identity, observed content,
resulting content, line counters, field registries, and tuple encodings remain
inside the immutable effect plan and native commit binding; they are not UI
content. Approval still authorizes that exact bound plan, not a reparsed diff.

Only pending permission renders the diff body. The safe path subject may remain
in the current queued, running, cancelling, or terminal snapshot until the turn
settles, but the changed text does not replay. Read permissions and tools without
an admitted safe subject stay on one line. The next tool still replaces the
snapshot and turn settlement still removes it.

## Verification

Pure formatter tests cover creation, update, deletion, exact common context,
separator differences, partial-line similarity, multiple hunks, line
breaks, escaped controls, empty creation, exact bounds, deterministic excerpts,
maximum hunk/path fallback, and rejection of malformed display projections.
Tool tests prove that approval no longer exposes digests, tuple fields, or
aggregate implementation metadata while the same stale-state and one-commit
tests remain authoritative.

Presentation and chat tests prove that every activity span is transparent;
marker and state carry matching semantic foreground truth; ordinary heads do
not repeat canonical name or risk; the patch path is useful head detail; the
pending body shows visible `- ` and `+ ` changes; short viewports retain action,
state, and the required permission choice before diff detail; and terminal
states never replay changed text.

Canonical verification continues to cover the generic surface, split-line,
wrapping, vertical allocation, renderer, manual evidence, build, tests, and CLI
smoke paths.

## Rollback and removal

Rollback restores one reviewed bounded approval projection and one transparent
compact head together; it must not restore the technical digest dump or broad
semantic background as an implicit fallback. Removing patch preview removes its
formatter, projection tests, manual contract, and this decision while retaining
exact permission for every mutation, or removes automatic text mutation first.
Removing activity presentation follows decisions 0008 and 0022 and leaves no
transcript replay, retained background, dormant parser, or duplicate identity.
