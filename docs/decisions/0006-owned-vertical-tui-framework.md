# 0006: Owned vertical TUI component framework

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
- a projected single-line input component;
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

## Update, rollback, and removal

Change allocation, sanitization, width, focus, structured-row, or fragment rules
only with focused boundary tests and an update to this decision or its replacing
decision. Application-specific chat state remains in CLI and never becomes a
generic component.

To remove the framework, replace CLI component composition with direct validated
frames, then remove the component modules, exports, tests, and this decision from
the ownership registry. Decoder, editor, frame, renderer, runtime, and core stay
unchanged.
