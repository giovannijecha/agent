# 0038: Owned deterministic TUI motion

- Status: Accepted
- Date: 2026-08-12
- Updated: 2026-08-13
- Refined by: decision 0040
- Timer substrate generalized by: decision 0041

## Context

The owned TUI already provides deterministic layout, rendering, input, and
application-state projection. A bounded activity indicator should make live
state easier to understand without adding ambient decoration, unbounded redraw
work, platform coupling, or copied implementation details from another product.

## Decision

Motion is state communication, not decoration.

The implemented motion boundary is:

- `@agent/tui` owns pure animation state and projection. It receives an
  explicit phase or tick and never reads a clock, schedules a timer, imports a
  Node API, or writes terminal bytes.
- `@agent/cli` owns the generic monotonic timer port and Node adapter; the motion
  scheduler independently owns its lifecycle, coalescing, and conversion of
  application state into cosmetic invalidations.
- `Renderer` remains the sole ANSI writer and continues to serialize frames.
- Cosmetic redraws run at eight frames per second with at most one pending
  invalidation. They never form a backlog and re-arm only after a successful
  render.
- Terminal input, runtime events, model deltas, tool events, approvals,
  cancellation, and shutdown always outrank cosmetic invalidations.
- Only an authoritative event that actually produces a redraw discards cached
  cosmetic readiness and rebases the next delay through that successful frame.
  A retained input fragment or stale event with no redraw leaves pending motion
  intact. Notice expiry follows the same rebase rule without resetting its
  current pure phase.
- Motion appears only while autonomous work advances through `generating`,
  `runningTool`, or `cancelling`. Idle and approval-waiting surfaces do not
  animate.
- Non-TTY output uses a static, escape-free representation.
- Cancellation and shutdown remove every motion timer and listener before late
  work can request another frame.
- Tests use an owned fake monotonic clock and explicit ticks. They do not sleep
  or depend on wall-clock timing.

The first visible projection is one constant-width three-cell pulse. It is the
footer's only right-edge content and does not duplicate lifecycle or navigation
words. Decision 0040 aligns its final cell with the conversation stage and the
composer's right edge. Six deterministic phases move one ochre head through a
neutral leading and trailing step, avoiding the abrupt reset of the original
four-phase sequence without increasing the eight-frame-per-second schedule.
Every phase preserves row count, cell width, and caret geometry. Phase 0 is the
deterministic static baseline.

Background-process presentation is excluded until its lifecycle and observation
contract is independently accepted.

## Clean-room reference boundary

External TUI products may be observed for user-visible outcomes such as smooth
redraw, readable activity, stable composition, and responsive cancellation.
Their source, tests, prompts, identifiers, component hierarchy, styles,
fixtures, timings, naming, and internal structure are not implementation
inputs. Agent derives its own contracts, modules, state machines, and tests.
Public claims such as compatibility, cloning, or drop-in equivalence are not
permitted without a separate verified contract.

## Consequences

- The TUI remains deterministic and platform-neutral.
- The CLI pays the lifecycle cost of motion and can remove it without changing
  core or runtime contracts.
- Rendering work remains bounded under slow output and bursty model traffic.
- Visual polish cannot obscure or manufacture application state.

## Implementation sequence

1. Add pure TUI phase and projection primitives with deterministic tests.
   Completed.
2. Add the bounded CLI scheduler and fake-clock lifecycle tests. Completed.
3. Add one truthful active-work indicator. Completed.
4. Evaluate overlays and unified activity presentation only after the first
   implementation passes human visual review.

Each step is independently removable. Removing motion restores the existing
static projections without changing conversation, tool, provider, or renderer
contracts.
