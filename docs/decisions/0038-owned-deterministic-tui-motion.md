# 0038: Owned deterministic TUI motion

- Status: Accepted
- Date: 2026-08-12

## Context

The owned TUI already provides deterministic layout, rendering, input, and
application-state projection. Future activity indicators and transitions should
make live state easier to understand without adding ambient decoration,
unbounded redraw work, platform coupling, or copied implementation details from
another product.

## Decision

Motion is state communication, not decoration.

Visible animation is not implemented by this decision.

The future motion boundary is:

- `@agent/tui` owns pure animation state and projection. It receives an
  explicit phase or tick and never reads a clock, schedules a timer, imports a
  Node API, or writes terminal bytes.
- `@agent/cli` owns the monotonic clock, lifecycle, scheduling, coalescing, and
  conversion of application state into cosmetic invalidations.
- `Renderer` remains the sole ANSI writer and continues to serialize frames.
- Cosmetic redraws are capped at 10 frames per second with at most one pending
  invalidation. They never form a backlog.
- Terminal input, runtime events, model deltas, tool events, approvals,
  cancellation, and shutdown always outrank cosmetic invalidations.
- Motion appears only for a truthful active state. Idle surfaces do not animate.
- Non-TTY output uses a static, escape-free representation.
- Cancellation and shutdown remove every motion timer and listener before late
  work can request another frame.
- Tests use an owned fake monotonic clock and explicit ticks. They do not sleep
  or depend on wall-clock timing.

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
2. Add the bounded CLI scheduler and fake-clock lifecycle tests.
3. Add one truthful thinking indicator.
4. Evaluate overlays and unified activity presentation only after the first
   implementation passes human visual review.

Each step is independently removable. Removing motion restores the existing
static projections without changing conversation, tool, provider, or renderer
contracts.
