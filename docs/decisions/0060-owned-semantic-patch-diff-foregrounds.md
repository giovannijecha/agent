# 0060: Owned semantic patch diff foregrounds

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0028, 0031, 0033, 0034, 0053, 0056, and 0057
- Preview row set amended by: decision 0062
- Terminal-separator preview amended by: decision 0063

Decision 0062 narrows the displayed row set to changed logical rows after exact
per-hunk context compaction. Direction classification and tones remain unchanged.
Decision 0063 may append an exact terminal-separator escape to an otherwise
ambiguous row; that escape retains the row's existing direction tone.

## Context

Decision 0057 replaces internal patch-plan metadata with exact bounded `- ` and
`+ ` rows, but every preview row currently uses the neutral prose foreground.
The prefixes preserve meaning, yet scanning a multiline permission preview still
requires reading each marker individually. Removed and inserted content should
be distinguishable at a glance without restoring a background, border, grid, or
private tool card.

The existing `success` and `failure` tones are authoritative lifecycle truth.
They are bold and belong to the status mark and written state. Reusing those
semantic roles for patch content would falsely describe an insertion as a
successful tool result and a removal as a failed tool result. Patch direction
therefore needs separate closed roles even when it shares the restrained green
and red palette values.

## Decision

Add two renderer-owned foreground tones:

- `diffAdded` maps to the existing restrained success green without bold weight;
- `diffRemoved` maps to the existing restrained failure red without bold weight.

The fixed RGB values remain `134,203,146` and `232,112,112` respectively. These
roles identify only the direction of exact planned text changes. They never
represent lifecycle state, authorization, execution outcome, Markdown, model
prose, or source-language syntax.

The pure tool-activity projection classifies its bounded preview as either
`plain` or `patchDiff`. It emits `patchDiff` only after the canonical
`apply_patch` display projection has validated the path and every remaining row
as beginning with exact `- ` or `+ `. The shared activity presenter renders
every complete removed logical row, including its `- ` prefix, with
`diffRemoved`; every complete inserted logical row, including its `+ ` prefix,
with `diffAdded`. Wrapped continuation rows inherit the same direction tone from
their owning logical row.

Every other preview remains `plain`. The patch path remains neutral useful head
detail, the status mark and written permission state retain `attention`, and the
generic permission selection retains its independent accent focus. Diff rows
remain transparent and gain no weight, background, border, rail, gutter, line
number, or additional glyph. Prefix text remains authoritative, so color is not
the sole carrier of direction.

Only the pending-permission activity state displays changed text. Queued,
running, cancelling, terminal, transcript, and notice paths do not replay or
recolor the retained preview.

## Bounds, security, and failure behavior

The model cannot select a preview kind or tone. The CLI derives both from the
exact admitted tool identity and the already validated owned patch projection.
The activity presenter verifies each bounded `patchDiff` row again before
constructing a component and fails content-free on an unknown prefix. It does
not reparse hunks, paths, digests, identities, or source content.

Each logical diff row uses the existing bounded `TextBlock` wrapping path and
the activity stack's existing viewport allocation. Consecutive rows with one
direction are coalesced into a single block; a canonical 32-hunk patch therefore
creates at most 64 direction groups. A noncanonical projection that exceeds the
shared stack bound fails content-free. Text,
escaping, LF-only structural separation, omission counts, clipping priority,
permission authority, and mutation binding do not change. The renderer remains
the sole ANSI owner.

## Verification

Tone and renderer tests prove both new closed values, exact non-bold RGB output,
invalid-value rejection, and normal style reset. Pure presentation tests prove
only validated `apply_patch` previews receive `patchDiff`. CLI activity tests
prove removed rows and all of their wrapped continuations use `diffRemoved`,
inserted rows use `diffAdded`, all remain transparent, the path remains neutral,
the permission state remains attention-colored, and non-patch previews remain
plain. Existing preview bounds, hostile text, short viewport, settled-state,
permission, stale-state, and one-commit regressions remain required.

The canonical Windows and Linux verification gates remain mandatory.

## Update, rollback, and removal

Changing diff role names, RGB values, weight, row-prefix mapping, wrapping,
preview classification, or lifecycle scope requires this decision, the closed
tone registry, renderer mapping and byte tests, activity projection, CLI view
tests, `AGENTS.md`, architecture, engineering, maintenance, and operator manual
to change together. Do not introduce model-selected colors or a private patch
renderer.

To roll back presentation only, return exact patch rows to `plain`, remove
`previewKind`, delete both diff tones and their renderer tests, and retain the
prefixes and bounded human-readable preview. Removing patch preview entirely
still follows decisions 0053 and 0057 and must preserve exact per-call
authorization until `apply_patch` itself is removed.
