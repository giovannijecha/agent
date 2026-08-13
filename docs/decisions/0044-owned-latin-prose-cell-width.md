# 0044: Owned Latin prose cell width

- Status: accepted
- Date: 2026-08-13

## Context

The generic TUI initially assigned one cell only to printable ASCII and a small
closed structural glyph set. Every other Unicode scalar occupied two cells.
That conservative fallback prevents unknown wide text from overflowing a
terminal row, but it overstates ordinary precomposed Latin prose and common
typographic punctuation.

Windows Terminal displays text such as `perché` and `l’agent` with one
cell per scalar. The TUI previously measured both `U+00E9 LATIN SMALL LETTER E
WITH ACUTE` and `U+2019 RIGHT SINGLE QUOTATION MARK` as two. A viewport-wide
`Surface` consequently emitted too few trailing background spaces, exposing
unpainted cells at the right edge. The same shared error moved composer carets
and wrapping early. Bracketed paste only made the defect easy to reproduce; it
did not cause it.

## Decision

Extend the one owned cell-width function with one closed Latin prose profile.
The following scalars occupy one terminal cell:

- `U+00A0..U+00AC` and `U+00AE..U+024F`;
- `U+1E00..U+1EFF`;
- `U+2010..U+2015`, `U+2018..U+201F`, `U+2026`, `U+2039`, and
  `U+20AC`.

The existing printable ASCII and structural glyph registrations remain
unchanged. `U+00AD SOFT HYPHEN`, combining marks, emoji, CJK text, and every
other unregistered non-ASCII scalar continue to occupy two cells. This change
does not introduce normalization, grapheme clustering, locale selection,
terminal probing, generated Unicode data, or a dependency.

The profile is data inside `@agent/tui`; no application or component may carry
a private Unicode exception. `RichRow`, display wrapping, Markdown, tables,
`Surface`, `LineEditor`, `InputLine`, `InputArea`, frame clipping, caret
projection, and differential rendering continue to consume the same functions
from `cell-width.ts`. Model text and pasted text cannot select or extend the
profile.

## Bounds and failure behavior

Membership checks operate over a fixed collection of ranges and exact scalar
values. Work remains linear in the already bounded number of accepted code
points and does not allocate according to a terminal width. Input controls and
lone UTF-16 surrogates remain rejected or sanitized by their existing owners.
An unregistered scalar always uses the prior two-cell fallback; there is no
ambient locale, environment, font, or terminal-dependent branch.

Zero-width combining marks remain deliberately unsupported. Treating them as
zero without an owned grapheme-cluster contract could detach a mark from its
base during clipping or editing. A future broader Unicode profile must define
grapheme lifecycle, Unicode version, data provenance, update cadence, fallback,
and cross-terminal verification before changing that behavior.

## Consequences

- Italian and other precomposed Latin prose paints viewport-wide surfaces to
  their physical right edge.
- User messages and the composer share the fix automatically.
- Caret placement, wrapping, clipping, tables, Markdown, and surfaces retain
  one measurement authority.
- Unknown width remains conservative; this decision does not claim complete
  Unicode terminal-width support.
- No package, provider, model tool, public extension point, or product-specific
  rendering path is introduced.

## Rejected alternatives

- Add extra spaces in user-message and composer surfaces: this would hide one
  symptom while leaving caret, wrapping, Markdown, tables, and clipping wrong.
- Treat every non-ASCII scalar as one cell: CJK and emoji could overflow the
  assigned viewport and invalidate renderer geometry.
- Depend on `wcwidth`, ICU, a terminal framework, or generated foreign tables:
  this would violate the owned zero-dependency boundary and add an update
  surface larger than the admitted behavior.
- Assign combining marks zero width immediately: code-point editing and clipping
  can separate them from a base without a grapheme contract.
- Normalize pasted or model text: presentation must not mutate retained user or
  assistant content.

## Verification

Focused TUI tests prove the exact admitted ranges and punctuation, unchanged
two-cell emoji and unregistered fallback, viewport-wide `Surface` padding,
editor projection, wrapping, and caret placement. CLI conversation tests render
the same accented and typographic text through a user surface and the composer,
then assert exact row text, full surface coverage, and the final caret column.
Existing wide-scalar, Markdown, table, renderer, tiny-viewport, and paste tests
remain regression gates. The canonical Windows and Linux verifier must pass.

## Update, rollback, and removal

Changing a range or scalar requires an amendment or replacing decision,
focused cell-width and end-to-end regressions, visual review on supported
terminals, and synchronized updates to architecture, engineering, maintenance,
manual, and ownership policy. Do not import a table or expand a block merely
because it is adjacent in Unicode.

Rollback removes the profile and its focused tests together and restores the
documented conservative fallback, accepting the right-edge defect as an
explicit regression. Removing cell-width ownership entirely requires replacing
every current consumer with one stronger accepted shared contract; private
component measurements are forbidden.
