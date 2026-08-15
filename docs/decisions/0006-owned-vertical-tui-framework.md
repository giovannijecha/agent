# 0006: Owned vertical TUI component framework

The 2026-08-15 opaque-run refinement makes inset and full-width semantic
surfaces physically rectangular even when terminal glyph metrics are narrower
than the owned conservative cell-width authority. Before writing the structured
content of a changed row, the differential renderer paints every maximal
contiguous non-transparent surface run across its exact logical cell extent
with ASCII spaces under that run's authoritative surface and then returns to
the row origin. Content renders normally through the same spans. A run may
begin after the shared stage inset; transparent gaps and differently surfaced
runs remain separate. The earlier full-width homogeneous case is one run.

This renderer-owned stabilization adds no component-specific width exception:
layout, wrapping, selection, and caret geometry continue to use the one cell
authority. Each preliminary ASCII fill affects only its exact background
coverage, remains inside synchronized output, and is emitted only for a row the
differential renderer was already required to redraw.

- Status: accepted
- Date: 2026-08-07

## Context

The terminal engine can validate and differentially render complete frames, but
application views still assemble raw lines directly. A chat interface needs a
generic, bounded way to compose headers, untrusted multiline text, status rows,
and an editable prompt without moving product concepts into `@agent/tui`.

A partial widget facade would create unstable contracts. The first framework
version therefore needs a complete intended scope, explicit exclusions, and a
removal path while remaining small enough to own without external packages.

## Decision

Add a vertical component framework to `@agent/tui` with these contracts:

- immutable viewport-bound fragments with an optional relative caret;
- synchronous components with measure and render operations;
- bounded display-text normalization, sanitization, wrapping, and anchoring;
- a projected single-line input component, later complemented by decision 0035
  with a bounded multiline input area over the same editor state;
- deterministic vertical allocation using minimum rows, preferred rows,
  priority, and flex weight;
- exactly one composed caret and `Frame.create` as the final safety boundary.

Fragments occupy exactly the viewport rows assigned to their component. They
contain no terminal control characters and no line wider than their viewport.
Errors retain only a stable kind and optional numeric position, never rejected
text or callback causes.

Allocation first satisfies minimum rows by descending priority, then preferred
rows, then distributes remaining rows proportionally across flex slots. Ties
follow original slot order. At most 32 components and the existing frame bounds
apply. One-row viewports remain valid because callers can assign the prompt the
highest minimum priority.

Display text treats CRLF, CR, and LF as line boundaries, expands tabs to a fixed
four-cell stop, replaces remaining control characters and lone surrogates with
printable replacements, and uses the existing conservative cell-width policy.
Text that cannot fit a one-cell viewport becomes a printable one-cell marker.
Input is bounded to 1,048,576 UTF-16 code units. Measurement caps at the frame
row limit, while rendering retains only the assigned head or tail rows through
bounded storage; excessive logical lines never force an application shutdown.

## Intended scope

Version 1 is complete for deterministic vertical text applications. Decision
0019 later adds four closed semantic tones without allowing raw terminal
controls. Decision 0020 adds immutable scroll geometry, one generic scroll view,
and synchronized renderer transactions. Decision 0021 replaces the original
parallel row-and-tone representation with one canonical bounded structured-row
contract. The framework does not claim horizontal splits, overlapping layers,
arbitrary colors, mouse input, focus traversal, markdown, syntax highlighting,
grapheme tables, or arbitrary two-dimensional cell composition. Those
capabilities need separate contracts and decisions rather than compatibility
hooks in this one.

Decision 0022 adds one bounded generic component stack for sequential component
documents. It does not add product lifecycle state or a second layout engine.
Decision 0025 evolves the one shared display layout with word-aware prose,
explicit literal-code wrapping, and bounded continuation prefixes. It does not
add a second component or renderer path.
Decision 0026 adds one bounded one-row split-line component, one single-child
panel, one centered horizontal inset, and one open side rail for the responsive
conversation shell. These primitives do not claim arbitrary horizontal split
panes, overlapping regions, or two-dimensional cell composition.
Decision 0031 adds one bounded internal lexical highlighter for complete
recognized Markdown fences. It does not add the arbitrary syntax-highlighting
extension surface excluded by this decision.
Decision 0035 adds a bounded projected multiline input component. It reuses the
same editor, fragment, caret, validation, and vertical-layout contracts; it does
not create a second editor or submission path.

## Update, rollback, and removal

Change allocation, stack windowing, sanitization, width, focus, structured-row,
or fragment rules only with focused boundary tests and an update to this
decision or its replacing decision. Application-specific chat and activity
state remains in CLI and never becomes a generic component.

To remove the framework, replace CLI component composition with direct validated
frames, then remove the component modules, including panel, split line,
horizontal inset, and side rail, their exports and tests, and decisions 0006,
0026, and 0027 from the ownership registry.
Decoder, editor, frame, renderer, runtime, and core stay unchanged.
