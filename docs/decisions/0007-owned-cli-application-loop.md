# 0007: Owned single-writer CLI application loop

- Status: accepted
- Date: 2026-08-07
- Provider lifecycle amended by: decision 0068

Decision 0068 keeps provider credentials, catalogs, and selections inside this
single application controller and adds no second runtime or conversation.
- Event sources extended by: decisions 0038 and 0041
- Command and permission lifecycle amended by: decision 0055

Decision 0055 replaces the historical approval commands below with the exact
`/permissions` session editor and contextual pending-call decisions while
retaining this decision's single-writer application loop.

## Context

The runtime and vertical TUI framework are independently complete, but the CLI
still discards every ordinary submission and can consume only terminal events.
Streaming composition introduces two asynchronous sources, cancellation races,
prospective personal content, and cleanup across three owners. Repeatedly racing
fresh reads is incorrect because the losing terminal or runtime read remains
pending and both sources enforce one-reader semantics.

The production executable must remain providerless while eligibility is blocked,
yet the application boundary needs to be real and fully testable with an injected
runtime session.

## Decision

Make `@agent/cli` depend on the public `@agent/runtime` and `@agent/tui` surfaces.
The executable injects no runtime for now. `run` accepts an optional runtime
session so deterministic tests and future eligible adapters use the same complete
composition path.

Split the CLI into these cohesive owners:

- `SessionController` decodes input and emits ordered immutable actions;
- `ApplicationController` is the only writer of phase, notices, display-only chat
  state, active turn identity, and command policy;
- `EventArbiter` retains at most one read per registered terminal, runtime,
  notice-expiry, or motion source, buffers at most one ready event per source,
  and chooses simultaneous readiness by its accepted functional, expiry, then
  cosmetic policy without abandoning promises;
- `ChatState` bounds completed display turns and prospective chunks separately;
- `chat-view` maps an immutable application projection onto generic TUI components;
- `run` alone interprets effects, invokes host/runtime capabilities, renders, and
  coordinates shutdown.

Only one turn may be active. A successful start creates a display-only prospective
turn. A prepared completion emits a synchronous commit effect; only a committed
result publishes its user/assistant pair to the bounded transcript. Failure,
cancellation, or cancellation ordered before commit removes prospective state.
Decision 0008 later introduces truthful tool checkpoints; only state newer than
the last completed tool attempt remains removable.
A second ordinary submission during a turn is discarded with a generic notice
and is never queued.

Failure and cancellation updates emit an acknowledgement effect after display
state changes. Until that effect resolves, runtime retains the terminal cleanup
receipt; shutdown consumes it if the buffered event never reaches the reducer.

Without an injected runtime, ordinary submitted text is discarded immediately.
It never reaches core, transcript, errors, output, or persistence. Commands
remain exact. Decisions 0028 and 0055 reduce the current catalog to
`/providers`, `/permissions`, and `/exit`; `/help` and `/quit` remain unknown.

## Controls and ordering

- active Ctrl+C requests cancellation once, preserves the editor draft, and keeps
  the application open;
- idle Ctrl+C exits;
- `/exit`, Ctrl+D, and terminal EOF exit in every phase;
- exit begins idempotent runtime stop before awaiting terminal restoration;
- host input and runtime events reduce one at a time, followed by at most one
  awaited render;
- a prepared response stays prospective until the reducer's ordered commit
  effect resolves, so simultaneous Ctrl+C can still cancel without a hidden commit;
- terminal failures stay acknowledged end to end, so exit cannot discard cleanup
  failures buffered behind an in-progress render;
- batched Ctrl+C followed by Ctrl+D or `/exit` preserves the draft and still exits;
- turn ids prevent stale runtime events from mutating display state;
- model and cleanup details remain content-free and are never rendered.

The arbiter starts one terminal read immediately. Runtime reads are armed only
after a turn starts and after each accepted delta, so it never performs an idle
read after a terminal turn event. Decision 0041 adds content-free notice expiry
below terminal and runtime priority and above cosmetic motion; identity checks
prevent stale expiry from clearing replacement feedback. Closing wakes its
application waiter, clears ready slots, and observes all late settlements
without mutating state.

Shutdown closes the arbiter, clears draft and display-only transcript references,
starts runtime stop so cancellation is synchronous, stops the terminal host,
finishes the renderer, and finally awaits runtime stop. Primary, terminal,
renderer, and runtime-cleanup failures remain independently observable and no
cleanup failure masks another.

## Bounds and security

Display state holds at most 128 completed turns and 1,048,576 UTF-16 code units,
evicting the oldest complete turns only. The active turn remains separately
bounded by runtime limits. Notices have at most 16 lines of 1,024 code units.
Submitted and generated text never enters error values or logs. Model text passes
through TUI normalization and fragment validation before `Frame` performs the
final terminal-control check.

## Update, rollback, and removal

Change event ordering, controls, display retention, or cleanup only with reducer,
arbiter, integration, tiny-viewport, privacy, and combined-failure regressions.
Provider adapters replace only the injected runtime construction and do not alter
the application loop.

To remove runtime composition, remove the optional runtime argument, arbiter
runtime source, chat prospective effects, the CLI runtime dependency/reference,
and this decision; restore unconditional no-model handling while keeping the
terminal and generic TUI framework. To remove the richer view independently,
replace `chat-view` with direct validated frame construction before deleting its
component use. Never keep dormant parallel paths.
