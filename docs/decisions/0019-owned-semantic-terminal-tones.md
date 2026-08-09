# 0019: Owned semantic terminal tones

- Status: accepted
- Date: 2026-08-09

## Context

The vertical TUI framework deliberately began as printable monochrome text.
That boundary was safe but left product hierarchy implicit: identity, passive
status, focused input, and approval-sensitive state were visually equivalent.
A useful minimal interface needs restrained emphasis without allowing model
text or CLI modules to manufacture terminal control sequences.

## Decision

Extend the generic TUI contract with exactly four semantic tones: `plain`,
`muted`, `accent`, and `attention`. A fragment and frame carry one validated
tone for each printable row. Text and input components accept one tone for
their complete output; arbitrary spans, escape sequences, and color values are
not part of the component contract.

Only the renderer translates tones into fixed owned SGR sequences. `accent`
uses bold cyan, `attention` uses bold yellow, and `muted` uses dim text. Every
styled row resets terminal style immediately after its printable content, and
renderer cleanup resets style before restoring the cursor and prior screen.
Tone-only changes participate in differential redraw. Empty rendered rows are
treated as plain because styling an empty row has no visible meaning.

The CLI owns product presentation. Its compact header is one accented line,
passive notices are muted, approval and tool state use attention, transcript
content remains plain, and the focused input row uses the accent. Model and tool
content can supply printable text only; it cannot choose a tone.

Tone metadata is immutable, exact-row, bounded by the existing frame limits,
and revalidated at both fragment and frame boundaries. Invalid metadata returns
content-free structural errors. Non-interactive output still bypasses the TUI
and contains no escape byte.

## Intended scope

This decision provides a complete minimal emphasis layer, not a theme engine.
It does not add rich spans, arbitrary colors, gradients, icons, animations,
mouse input, panels, or application concepts to `@agent/tui`. New visual roles
require a replacing decision and evidence that the existing four roles cannot
express a current interface need.

## Update, rollback, and removal

Change a tone name, mapping, reset rule, or component propagation only with
fragment, frame, layout, renderer, one-cell viewport, and CLI view tests.
Rollback removes tone metadata from components, fragments, frames, and the
renderer together, restores the monochrome chat view, removes this decision
from both policy registries, and reruns the canonical verifier. Decoder, editor,
runtime, provider, and core contracts remain unchanged.
