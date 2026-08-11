# 0025: Owned word-aware display layout

- Status: accepted
- Date: 2026-08-10

## Context

The shared plain-text and Markdown layout introduced by decisions 0006 and 0023
wrapped every line at the next terminal-cell boundary. The behavior was bounded
and safe, but normal prose could split a word between two rows. A maintainer
visual review reproduced the defect in a long streamed answer. Fixing only the
conversation view would create a second wrapping path and leave other generic
text components inconsistent.

Markdown also has structural prefixes. A word-aware change that treats the
space after a list marker, quote rail, or code rail as an ordinary break can
leave the marker alone or remove the rail from continuation rows. The shared
layout therefore needs an explicit line contract, not a transcript-specific
heuristic.

## Decision

Keep one Node-free display layout in `@agent/tui`. Each internal logical line
declares bounded prefix, content, continuation, and wrapping fields. The fields
carry only printable text and closed semantic tones; they do not expose product
state, terminal commands, model metadata, or callbacks.

Two wrapping modes exist:

- `word` greedily breaks at the last normalized ASCII-space run that fits after
  the protected structural prefix. Boundary spaces are omitted at the visual
  seam. Leading spaces and spaces that fit remain literal. A token wider than
  the available row falls back to deterministic terminal-cell wrapping.
- `cell` preserves literal content and wraps only when the next measured scalar
  does not fit. Fenced code uses this mode.

`TextBlock` and ordinary Markdown use `word`. Markdown list and quote lines own
one protected first-row prefix and one explicit continuation prefix. Lists use
a hanging space prefix equal to their marker width; quotes repeat their rail.
Fenced code repeats its rail while retaining cell wrapping. Continuation
prefixes are omitted on a viewport too narrow to leave space for the next
scalar. The final row still passes through `TextSpan`, `RichRow`, `Fragment`,
and `Frame` validation.

There is no dictionary, locale rule, hyphenation, URL exception, Unicode line
breaking claim, alternate renderer, or component-specific wrapper. Conservative
owned cell measurement remains unchanged.

## Bounds, failures, and security

The pending row is bounded by the validated component width. Soft wrapping
backtracks only within that row, then releases the emitted prefix. A carried
word and continuation prefix are accepted together only when their measured
width fits; otherwise the optional continuation is omitted. Logical-line span
collections, output rows, text size, component geometry, and retained head or
tail windows keep the existing TUI limits.

Tabs are expanded by the existing four-cell policy before they can become a
word boundary. Controls and lone surrogates retain the existing replacement
policy. Wide scalars that cannot fit one column retain the existing printable
replacement. Invalid line structure, spans, geometry, or text return the
existing content-free `ComponentError`; rejected content and callback causes
are not retained. Only the renderer emits ANSI.

## Verification and visual review

Focused tests must prove prose soft wrapping, exact-boundary spaces, long-token
cell fallback, semantic-span preservation, list hanging prefixes, repeated
quote and code rails, fenced-code literal wrapping, wide scalars, tabs, head
and tail anchoring, tiny viewports, bounds, and content-free failures. All TUI,
CLI integration, and canonical verifier suites remain release gates.

The maintainer repeats visual review with long normal and Markdown answers at
normal and narrow widths. Passing automated tests does not approve the broader
visual design; that remains a separate staged decision informed by explicit
mockups.

## Update, rollback, and removal

Changing break characters, boundary-space handling, prefix repetition, wrapping
mode selection, cell measurement, or fallback requires shared-layout,
plain-text, Markdown, transcript, manual, privacy, and policy regressions in the
same change. New wrapping modes require a current product need and a new
decision; components cannot add private wrapping implementations.

To roll back word wrapping, restore one cell mode for ordinary text, remove the
prefix/content/continuation line contract and focused regressions, and remove
this decision and its policy and manual registrations. `TextBlock`,
`MarkdownBlock`, structured rows, scrolling, the renderer, the CLI, runtime,
providers, and core remain independently buildable.
