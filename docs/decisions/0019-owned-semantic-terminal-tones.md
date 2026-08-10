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

Register exactly four generic TUI tones: `plain`, `muted`, `accent`, and
`attention`. Text and input components accept one tone for their complete
output. Decision 0021 later replaces the original parallel row-and-tone carrier
with one canonical structured row whose bounded spans each carry one of these
same closed tones. Escape sequences and arbitrary color values are never part of
the component contract.

Only the renderer translates tones into fixed owned SGR sequences. `accent`
uses bold cyan, `attention` uses bold yellow, and `muted` uses dim text. Every
styled span resets terminal style immediately after its printable content, and
renderer cleanup resets style before restoring the cursor and prior screen.
Tone-only changes participate in differential redraw. Empty rendered rows have
no spans because styling an empty row has no visible meaning.

The CLI owns product presentation. Its compact header is one accented line,
passive notices are muted, transcript content remains plain, and the focused
input row uses the accent. Decision 0022 uses accent for a tool name, muted for
the rail and risk, attention for approval-sensitive, unsuccessful, and
cancellation states, and muted for a successful state. Model and tool content
can supply printable text only; it cannot choose a tone.

Tone metadata is immutable, bounded by the structured-row and frame limits, and
revalidated at row, fragment, and frame boundaries. Invalid metadata returns
content-free structural errors. Non-interactive output still bypasses the TUI
and contains no escape byte.

## Intended scope

This decision provides a complete minimal emphasis vocabulary, not a theme
engine. Structured span carriage is governed separately by decision 0021. The
framework still excludes arbitrary colors, gradients, icons, animations, mouse
input, panels, and application concepts. New visual roles require a replacing
decision and evidence that the existing four roles cannot express a current
interface need.

## Update, rollback, and removal

Change a tone name, mapping, reset rule, or component propagation only with
structured-row, fragment, frame, layout, renderer, one-cell viewport, and CLI
view tests. Rollback first replaces structured rows with one validated plain-row
contract, then removes tone metadata from components, fragments, frames, and the
renderer together, restores the monochrome chat view, removes decisions 0019
and 0021 from both policy registries, and reruns the canonical verifier. Decoder,
editor, runtime, provider, and core contracts remain unchanged.
