# 0021: Owned structured terminal rows

- Status: accepted
- Date: 2026-08-09

## Context

The owned TUI currently associates one semantic tone with an entire printable
row. That is sufficient for a first interface, but it cannot express a quiet
phase label beside an emphasized product name or later distinguish tool names,
arguments, state, and results without splitting one visual line across several
product-specific components. Keeping a parallel rich-text path beside the
existing string-and-tone path would duplicate validation, clipping,
differential comparison, and renderer behavior.

Decision 0020 reserved structured rich rows as the next TUI v2 increment. This
decision fulfills that increment without adding Markdown, arbitrary styling,
product vocabulary, extension callbacks, or a second screen engine.

## Decision

Replace printable row strings plus parallel tone arrays with one canonical
immutable representation in `@agent/tui`:

- a `TextSpan` contains printable text and exactly one closed semantic `Tone`;
- a `RichRow` contains an ordered bounded collection of spans and derives its
  complete text and conservative terminal-cell width once;
- empty spans are removed and adjacent spans with the same tone are merged;
- an empty row is represented by a row with no spans;
- fragments and frames contain structured rows only. They expose no legacy
  string or parallel-tone compatibility path.

Every public constructor validates and snapshots external values before they
cross the boundary. Arrays, accessors, subclasses, and proxies may fail only as
content-free typed results. Text may contain no C0, DEL, C1, or unmatched UTF-16
surrogate value. One row contains at most 256 input spans and 16,384 Unicode
code points. Fragment and frame row limits remain 4,096. Bounds are checked
before allocation or concatenation. Adjacent chunks are grouped and joined once
so normalization remains linear in accepted row content.

`RichRow.fit` performs deterministic cell clipping while preserving semantic
span boundaries. It accepts any positive safe terminal width and performs work
bounded by row content rather than terminal width. Components compose, pad,
slice, and scroll rows without flattening them. `Frame` snapshots and
revalidates every row as the final terminal-safety boundary.

The renderer remains the sole ANSI owner. It compares normalized spans
structurally, redraws a row when either text or tone changes, maps each tone to
one fixed SGR sequence, and resets after each emphasized span. Model, provider,
tool, and application text can select no escape sequence or arbitrary style.
The span bound prevents style-transition amplification.

The first product proof is intentionally small: the CLI header renders the
product name with the accent tone and its phase with the muted tone on the same
row. Product words and tone choices remain in `@agent/cli`; the generic TUI
knows neither agents nor phases.

## Evolution sequence

Structured rows are the only basis for subsequent visual work. Decision 0022
uses them for a generic component stack and unified tool activity without a
parallel carrier. A later decision may add a bounded owned Markdown subset that
compiles into these same spans. Transcript blocks, navigation, and responsive
status must also reuse the same fragment, frame, scroll, and differential-
renderer path.

Images, arbitrary colors, extension-supplied render callbacks, overlapping
layers, split panes, animation, and multiple screen engines remain excluded
until a present product requirement earns a complete safety and removal
contract.

## Verification

Focused tests must prove span normalization, exact bounds, control and scalar
rejection, hostile accessor and proxy containment, immutable snapshots,
cell-preserving clipping, caret validation, scroll and layout composition,
mixed-tone differential rendering, style reset, failed-write recovery, narrow
viewports, and the CLI header proof. The canonical verifier remains the release
gate on Windows and Linux.

## Update, rollback, and removal

Changing span limits, normalization, clipping, equality, style mapping, frame
validation, or component composition requires focused regressions and an update
to this decision. Adding a style requires changing the closed `Tone` contract,
renderer mapping, privacy analysis, tests, manual, and decision 0019 together.

To remove structured rows, first replace every component and CLI view with one
validated plain-row contract, then change fragment, frame, scroll, layout, and
renderer atomically. Remove `TextSpan`, `RichRow`, their tests and exports, this
decision, and all manual and policy references in the same change. Do not leave
an unused compatibility representation. Core, runtime, tools, providers, and
terminal input remain independently buildable.
