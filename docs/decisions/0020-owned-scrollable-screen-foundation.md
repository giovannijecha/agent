# 0020: Owned scrollable screen foundation

- Status: accepted
- Date: 2026-08-09

## Context

The first vertical TUI framework safely composes bounded text, status, and
input, while the renderer already owns alternate-screen lifecycle and
differential row updates. A durable coding interface additionally needs stable
full-screen updates and history navigation. Implementing scroll separately in
chat, help, and tool output would create overlapping state machines and make
later rich content difficult to remove or verify.

Current public Pi source was inspected at commit
`936aff00918de1187f085f123c2812d8f2d67745` only to establish observable
terminal behavior: synchronized full-screen updates, differential redraw, and
follow-end scroll behavior. No implementation, test, prompt, identifier,
component hierarchy, or product identity is reused.

## Decision

Extend `@agent/tui` with two independent generic capabilities.

First, every renderer frame is one synchronized terminal update. The renderer
wraps the complete owned draw buffer in DEC synchronized-output begin and end
markers. A failed write leaves synchronization as possibly active; the next
draw or cleanup emits an end marker before proceeding. Frame snapshots still
commit only after a successful complete write. Alternate-screen, cursor, style,
and synchronization restoration remain ordered and retryable.

Second, add an immutable `ScrollState` and a `ScrollView` component. Scroll
state contains only a bounded row offset and whether it follows the content
end. It reconciles against explicit content and viewport row counts, clamps on
content shrink, disables follow mode when moved away from the end, and enables
it when moved back to the end. It retains no content and performs no I/O.

`ScrollView` wraps exactly one generic component. It measures and renders that
component through the same contained component boundary used by vertical
layout, resolves one bounded window, copies only visible rows and tones, pads
unused rows, and exposes a child caret only while it is visible. The child can
never select its own terminal controls or exceed existing frame bounds.

All public failures are immutable and content-free. Scroll metrics accept at
most the existing 4,096-row frame bound. One view has no event queue, timer,
terminal dependency, product vocabulary, or hidden global state.

## Evolution sequence

This decision is the first TUI v2 foundation, not the final interface. Later
decisions may add, in order, structured rich rows, a bounded owned Markdown
subset, CLI-owned transcript blocks and one unified tool-activity surface, then
keyboard navigation and responsive status composition. Each capability must
reuse this single scroll and renderer path rather than introduce a parallel
screen engine.

Mouse input, images, overlapping layers, split panes, arbitrary styling,
animation, and extension-supplied render callbacks remain excluded until a
current product need earns a complete contract. Benchmarks are deferred until
the behavior and safety contracts stabilize.

## Update, rollback, and removal

Changing synchronization recovery, scroll reconciliation, component
containment, padding, caret translation, or bounds requires focused regression
tests and an update to this decision. The CLI must not mutate scroll state from
outside its single-writer reducer when product navigation is later connected.

To remove scrolling, first replace every `ScrollView` composition with its
contained component, then remove scroll modules, exports, tests, manual
references, and this decision. To remove synchronized output only, remove both
markers and the recovery flag together while retaining the previous serialized
differential renderer. Alternate-screen lifecycle, frame validation, vertical
layout, semantic tones, input, runtime, and core remain independently usable.
