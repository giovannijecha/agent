# 0040: Owned quiet conversation rhythm

- Status: Accepted
- Date: 2026-08-13
- Notice boundary amended by: decision 0041

## Context

Human review of the fluid conversation stage found that its horizontal geometry
was coherent but its lower regions did not share one vertical rhythm. A
transcript could meet the composer when the document became scrollable, a
completion list could meet either activity or the transcript, and the composer
met the footer directly. Human review also established that the footer pulse
should terminate on the composer's right edge, using the same stage geometry
rather than a separate terminal-edge alignment.

The same review found that background-filled code, table, and completion regions
competed with the semantic tool lifecycle surfaces. User turns and the composer,
however, still need a quiet neutral distinction so role and input focus remain
immediately visible. Semantic green, ochre, and red backgrounds should
communicate authoritative operational state rather than generic content
structure.

## Decision

The CLI owns one one-row conversation-rhythm value and reuses it between every
adjacent lower-shell region:

- before non-empty contextual tool activity;
- before a non-empty notice following activity or transcript;
- before non-empty slash completion;
- before the composer, whether the preceding region is transcript, notice,
  activity, or completion; and
- between the composer and the footer.

Each rhythm slot has zero minimum height and one preferred row. Required
content therefore survives first on constrained viewports, while ordinary
viewports receive the same separation at every boundary. Transcript scrolling
uses the geometry after these slots are planned, so its final visible row never
merges visually with the composer.

The footer remains one generic three-column line and enters the same responsive
conversation-stage projection as the composer. Its left factual group, physical
center, and constant-width active-work pulse therefore share the stage axes;
the pulse's final cell coincides with the composer's final surface cell. No
terminal-size policy moves into the generic line component.

The pulse retains three cells and the existing eight-frame-per-second bounded
scheduler. Its pure projection uses six phases: a neutral leading step, one
ochre active head, and a neutral trailing step travel left to right before the
muted static baseline returns. This removes the original abrupt four-phase
reset without changing scheduler, renderer, row, width, or caret geometry. The
owned `U+00B7 MIDDLE DOT` footer separator and `U+2022 BULLET` join the closed
single-cell structural-glyph set so conservative measurement of earlier spans
cannot move the three rendered pulse cells away from that shared edge.

Green, ochre, and red background surfaces are reserved for authoritative tool
lifecycle state: active work, approval, success, and negative terminal outcomes.
User turns and the composer use the neutral `subtle` surface so they remain
recognizable without implying lifecycle state. Slash completion, fenced code,
and strict tables retain their owned structure, padding, foreground roles,
slant, clipping, and bounds, but use the transparent surface. Assistant prose
remains transparent as before.

Fenced code and tables continue through the one structured Markdown path.
Their parser-owned region identity still provides content-fit padding, shared
table widths, the header rule, literal-code wrapping, and bounded lexical roles;
it no longer paints an `inset` background. Model text still cannot select any
style or surface.

Slash completion maps every catalog entry to one compact inline row: command,
two literal cells, then description. It does not right-align the description,
fill the remaining row, or show a passive keyboard hint. Selection remains
visible through closed foreground roles, and Up, Down, Tab, and Enter retain
the exact behavior accepted by decision 0034.

This decision refines the presentation portions of decisions 0028, 0030, 0034,
0038, and 0039. Their parsing, input, scheduling, dispatch, stage, and lifecycle
contracts remain in force.

## Bounds and security

All new spacing is expressed through the existing bounded generic `Spacer` and
planned by the existing `VerticalLayout`. Footer alignment uses only the pure
viewport projection. Compact completion rows use the existing bounded
`InlineText` and `SelectionList`. Transparent structured regions continue
through the existing display normalization and surface painter. The change adds
no I/O, timer, terminal writer, model-visible field, parser extension, mutable
state, or alternate rendering path.

## Verification

CLI regressions prove exact composer-edge pulse placement, one blank row at every
active lower-shell boundary, preserved separation while the transcript scrolls,
compact completion descriptions, absence of the passive hint, neutral subtle
user and composer regions, and continued semantic tool backgrounds. TUI
regressions prove every pulse phase, constant pulse width, transparent
fenced-code and table regions without losing syntax tones, padding, rectangular
table geometry, wrapping, or clipping. Wide, narrow, tiny, resize, renderer,
runtime, and canonical verification remain required.

## Update, rollback, and removal

Change the rhythm height only at the CLI-owned conversation-rhythm constant and
update all boundary regressions together. A new lower-shell region must enter
the same conditional spacer path rather than introducing private margins.
Changing background authority requires this decision, the relevant presenter,
manual, architecture, policy, and focused tests to move together.

To roll back this refinement, restore the full-width footer with its private
leading margin, previous region-specific spacers, completion split lines and
hint, the former four-phase pulse, and the former non-semantic backgrounds. Do
not remove the generic `Spacer`, `InlineText`, `Surface`, structured Markdown,
`SelectionList`, or `ThreeColumnLine`; each retains independent consumers and
contracts.
