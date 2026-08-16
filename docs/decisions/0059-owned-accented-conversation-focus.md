# 0059: Owned accented conversation focus

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0028, 0031, 0032, 0034, 0040, 0043, and 0055

## Context

The conversation-density refinement distinguished user turns with an exact-height
muted side rail and brighter neutral italic prose. In ordinary use, the rail
reads as a small box before the message and adds structure without adding useful
state. The user's authorship is already authoritative transcript metadata, so it
can be expressed through the existing closed foreground palette without another
glyph or component boundary.

Command completion, the session permission editor, and pending tool decisions
all reuse the generic `SelectionList`, but their CLI presenters independently
make selected labels brighter or bolder. That treatment is subtle, differs
between row shapes, and leaves the generic component unaware of the visual
meaning of the selected index it already owns. Interactive focus should have one
consistent presentation wherever the shared list is used.

## Decision

User transcript entries remain stage-wide transparent `Surface` components with
italic prose, zero vertical padding, and the shared one-cell content inset. They
no longer compose a `SideRail`. Their base prose uses the existing restrained
steel-blue `accent` tone instead of `highContrast`. Registered Markdown roles
continue to replace the base tone on their exact spans, so emphasis, references,
literal code, fenced syntax, tables, and logical text selection retain their
owned semantics. Assistant base prose remains `plain`. Removing the rail does
not move the canonical text column shared by user prose, assistant prose,
composer text, caret projection, and pointer geometry.

`SelectionList` now owns the foreground presentation of its exact selected row.
After rendering the selected one-row child, it recreates that row with `accent`
foreground on every non-empty span while preserving text, slant, surface,
selection mark, hyperlink, and logical position metadata. Unselected rows retain
the tones supplied by their presenters. The CLI therefore supplies only the
resting hierarchy of each row: command and permission labels remain `plain`, and
supporting descriptions or risk text remain `muted` when unselected. It does not
branch on selection to choose brighter or bolder foregrounds.

The selected row remains transparent and gains no marker, rail, background,
border, inverse video, or new glyph. The exact command or permission action text
remains the authoritative decision label; color is a focus aid and never the
only expression of lifecycle state, permission meaning, risk, or outcome. This
generic rule applies equally to slash completion, `/permissions`, pending tool
actions, and every future admitted `SelectionList` consumer. It does not change
the independent `selected` text mark used for mouse and editor text selection.

The `accent` palette value and renderer mapping do not change. This decision
extends its semantic use from references, fence labels, and composer rules to
user authorship and generic interactive focus. No new tone, theme input, or ANSI
path is introduced. The generic `SideRail` remains an independently tested
framework primitive, but conversation entries no longer depend on it.

## Bounds, security, and responsive behavior

Selection bounds, non-wrapping movement, visible-window projection, one-row
measurement, clipping, and key dispatch remain unchanged. `SelectionList`
restyles only the already validated selected `RichRow` after bounded child
rendering. It reconstructs closed `TextSpan` values through the existing public
boundary and fails content-free if any row cannot be reconstructed. It does not
inspect command, tool, risk, provider, workspace, or model meaning.

User Markdown remains independently parsed per bounded transcript document.
Untrusted content cannot choose tones, styling, selection, or ANSI bytes. The
renderer remains the sole ANSI owner. Narrow viewports may drop the shared
surface inset before required text, exactly as for assistant prose; no private
width calculation or alternate transcript path is added.

## Verification

CLI conversation regressions prove one-line and multiline user entries are
transparent, italic, `accent` at base prose, free of the rail glyph, aligned to
assistant and composer content, and still preserve Markdown semantic overrides.
Generic TUI regressions prove exactly the selected visible row receives
`accent`, unselected rows retain their original tones, non-foreground metadata
is preserved, clipping retains the focused row, and malformed children remain
contained. CLI view regressions cover slash completion, the session permission
editor, and pending tool decisions so none retains presenter-private selection
emphasis.

The build, complete test suite, CLI smoke test, ownership and manual policy
checks, and canonical Windows and Linux verification gates remain required.

## Update, rollback, and removal

Changing user-role color, slant, inset, Markdown precedence, selected-row tone,
or the scope of generic list focus requires this decision, `AGENTS.md`,
architecture, manual, maintenance guidance, generic component tests, and CLI
view regressions to change together. Do not add a consumer-private selected
foreground or restore a user decoration in only one presenter.

To roll back user presentation only, restore the muted `SideRail` and
`highContrast` base prose together with their exact geometry regressions. To
roll back list focus only, remove selected-row reconstruction from
`SelectionList` and restore one reviewed, consistent focus contract across all
CLI consumers; do not leave selection visible only through accidental text
weight. Removing `SelectionList` entirely still follows decisions 0034 and
0055 and requires removing every completion and permission consumer first.
