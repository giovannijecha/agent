# 0024: Owned transcript navigation

- Status: accepted
- Date: 2026-08-10

## Context

Decision 0020 introduced one immutable scroll state and one generic scroll
component, but the product transcript still followed its tail unconditionally.
A coding session needs reachable history without adding a second screen engine,
mouse protocol, editor overload, or product state inside `@agent/tui`.

Vertical allocation determines the transcript viewport after priorities,
minimums, preferences, and flex are resolved. Repeating that algorithm in the
CLI would let navigation geometry drift from the frame that is actually drawn.

## Decision

Add one immutable `VerticalLayoutPlan` interface to `@agent/tui`. Planning
measures and allocates every slot through the existing contained component
boundary. The plan exposes only each original slot's measured content rows and
assigned viewport rows, then renders that captured allocation without measuring
or allocating again. `VerticalLayout.render` delegates to the same plan path.
The framework remains Node-free, agent-agnostic, bounded, and free of input or
application state.

The CLI single-writer application controller owns one `ScrollState` and the
last valid visible transcript geometry. The chat view wraps its one Markdown
transcript in the existing `ScrollView`, obtains geometry from the layout plan,
and returns that geometry with the frame. The application loop reconciles the
controller before the frame write. No component callback mutates application
state, and no CLI module duplicates layout allocation.

The terminal decoder recognizes these exact navigation forms:

- CSI or SS3 Up and Down move the transcript by one row;
- CSI Page Up and Page Down move by the visible transcript height minus one
  row, with a minimum movement of one row.

The session reducer emits ordered transcript-navigation actions before the line
editor. Navigation never changes the draft or caret. Home and End remain editor
keys. Reaching the newest possible offset with Down or Page Down reenables
follow-end. Accepting a new user turn also selects follow-end. When follow-end
is disabled, the CLI exposes one quiet `history` label. Decision 0026 places it
in the compact status footer, which keeps one stable, low-priority row whenever
space permits so entering history cannot alter page geometry. The row yields to
higher-priority tool activity, composer, and transcript content in constrained
viewports.

Mouse input, a scrollbar, numeric position chrome, history aliases, message
selection, horizontal scrolling, and a second transcript component are
excluded.

## Bounds, failures, and security

Content and viewport metrics share the existing 4,096-row TUI bound. A zero-row
transcript allocation is valid and makes navigation inert. Invalid observed
geometry returns a content-free application error. Fixed navigation deltas are
reconciled only from validated private geometry; no model, provider, tool, or
display text can supply an offset, key mapping, or layout position.

The plan snapshots bounded slot allocation and returns immutable public
geometry. Component measurement and rendering remain contained against thrown
callbacks and malformed results. `Frame` remains the final control-character
and geometry boundary, and only the renderer emits ANSI.

## Verification and visual review

Focused tests must cover fragmented CSI and SS3 input, ordered session actions,
draft preservation, exact layout-plan geometry, invalid slot lookup, one-row
page overlap, content growth, content shrink, zero-row and fitting viewports,
follow-end recovery, new-turn reset, resize, long Markdown transcripts, tiny
screens, and the visible `history` state.

After canonical Windows and Linux verification succeeds, the maintainer reviews
one candidate build before publication in normal, narrow, short, long-history,
and active-streaming states. The review checks legibility, stable prompt
placement, visible history truth, predictable movement, and absence of noisy or
duplicated chrome. A visual correction that changes behavior or allocation
returns through tests and canonical verification.

## Update, rollback, and removal

Changing key mappings, page overlap, follow recovery, history truth, planning,
geometry observation, resize behavior, or bounds requires decoder, session,
layout, application, view, integration, manual, and policy updates together.
One new scrollable surface must reuse `ScrollState`, `ScrollView`, and layout-plan
geometry rather than add another scroll reducer.

To roll back product navigation, first replace the transcript `ScrollView` with
its `MarkdownBlock`, remove navigation actions and history status state, and delete the
CLI tests and manual references. If no remaining caller needs planned geometry,
restore direct layout rendering and remove the plan interface and tests. Then
remove this decision and its policy registrations. Input editing, Markdown,
structured rows, tool activity, renderer, runtime, providers, and core remain
independently buildable.
