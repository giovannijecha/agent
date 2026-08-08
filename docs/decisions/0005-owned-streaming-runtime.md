# 0005: Owned streaming runtime boundary

- Status: accepted
- Date: 2026-08-07

## Context

The synchronous core model contract can return only one buffered response. It
cannot represent streaming, cancellation, cleanup, bounded partial output, or a
complete transactional turn. The CLI currently has no runtime dependency and
must discard ordinary input while no model is configured.

The project requires a rigorous runtime boundary that remains independent from
terminal mechanics, provider identity, network transport, credentials, and
Node APIs. It must be removable without changing conversation or TUI rules.

## Decision

Create the Node-free `@agent/runtime` workspace. Keep `@agent/core` limited to
immutable domain state and explicit results. Runtime owns:

- the streaming model and stream ports;
- an owned cooperative cancellation signal;
- one active turn and one outstanding runtime read;
- bounded delta and response validation;
- atomic preparation and commit of final assistant text;
- typed model, protocol, cancellation, and cleanup outcomes.

The model stream is an explicit pull contract rather than an implicit iterator.
Every read and close operation returns an owned `Result`. Foreign results,
stream methods, and events are reflectively contained and decoded into owned
snapshots before state changes. A turn is constructed locally and its candidate
conversation is visible to the model. A valid non-blank response produces a
`turnPrepared` event but remains uncommitted until `commitTurn` acknowledges the
application's event ordering. Cancellation ordered first makes that acknowledgement
discard prospective text. Decision 0008 later extends this rule with structured
tool checkpoints: completed attempts remain committed, while only newer
prospective text is discarded after failure or cancellation.

A delivered failure or cancellation remains as one terminal receipt until the
application calls `acknowledgeTurn`. Runtime stop consumes any unacknowledged
receipt and reports its cleanup failures, so an arbiter closing over a buffered
event cannot silently erase cleanup state.

Runtime supports one active turn. It does not queue personal input, implement a
clock, invent timeouts, persist data, own platform I/O, or own transport. Under
decision 0008 it orchestrates provider-neutral tool handlers from
`@agent/tools`; all Node execution remains in CLI. A future adapter must satisfy
cancellation and cleanup conformance tests.

While provider eligibility remains blocked, production creates no model or
runtime instance. Deterministic test-local models exercise the complete contract
without adding an adapter, endpoint, credential, or borrowed identity.

## Limits and security

Direct runtime input is bounded to the editor limit. Model deltas, event count,
accumulated response, conversation message count, and conversation content are
bounded independently. Model errors must use content-free adapter values.
Runtime failures never embed submitted or generated text; thrown and rejected
operations become content-free typed categories and are never rendered or logged.

Cancellation is synchronous and idempotent. Runtime rechecks it after every
await and during the explicit commit acknowledgement. Stream cleanup remains
independently observable from preparation or the acknowledged terminal outcome.

## Update, rollback, and removal

Update stream events or limits only with boundary, cancellation, cleanup, and
privacy regressions. Provider adapters depend on the public runtime port and may
be replaced without changing core or TUI.

To remove runtime, first remove CLI composition and restore unconditional
no-model submission handling. Then remove the workspace from npm, TypeScript,
ownership, and provider-policy registries, delete this decision, regenerate
derived artifacts, and run the canonical verifier. Core, TUI, and the plain CLI
must continue to build.
