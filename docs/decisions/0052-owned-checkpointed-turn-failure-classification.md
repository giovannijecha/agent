# 0052: Owned checkpointed turn failure classification

- Status: accepted
- Date: 2026-08-14
- Amended: 2026-08-16 for adapter-neutral provider failure families
- Amended: 2026-08-16 by decision 0069 for content-free invalid-call reasons

## Context

A completed tool batch is checkpointed before the runtime asks the model to
continue. A later model-open, model-read, tool-loop, or runtime failure cannot
erase that completed external-effect truth. The application currently retains
the checkpoint correctly, but collapses every such terminal outcome into the
transcript marker `[turn failed after tool activity]`. Its ephemeral notice
also omits the closed failure classification.

That wording makes a successful tool followed by a transient provider failure
look like a failed tool. It also prevents the operator from distinguishing a
provider continuation failure from a tool limit, invalid tool call, unavailable
tool, or tool-engine invariant. Retrying without that distinction can repeat an
effect that already completed. Persisting provider causes or tool payloads to
improve diagnosis would violate the content-free failure boundary.

## Decision

The CLI owns one pure turn-failure presentation projection. It maps the closed
`TurnFailure` union to the existing bounded content-free classification codes:

- model transport and protocol failures use the `model/...` domain. Exact
  admitted OpenCode errors may add one adapter-neutral `cancelled`,
  `connectivity`, `lifecycle`, `limit`, `protocol`, `rejected`, `request`, or
  `timeout` family after the runtime operation;
- invalid, unavailable, limited, and invariant tool failures use the `tool/...`
  domain. Invalid calls distinguish only `tool/invalid-call/name`,
  `tool/invalid-call/input`, and `tool/invalid-call/identity`; and
- the closed residual runtime failure uses `runtime/failure`.

For a failed turn with no checkpoint, the contextual notice states the exact
closed code and that no conversation changes were committed. A `model/open/...`
notice additionally states that the provider did not open a usable response
stream and that no tool ran. No transcript entry is published.

For a failed turn after a checkpoint, the application publishes the exact
bounded marker `[turn failed (<code>) after completed tool activity]` and the
contextual notice states the same code and that completed tool activity remains
in conversation. The marker describes turn settlement, not tool lifecycle: a
green `succeeded` activity remains authoritative for that tool attempt, while a
later `model/...` classification identifies failure of model continuation.

Cancellation remains distinct and retains its existing marker and notice. A
cleanup failure remains a separate second notice line and cannot replace the
primary failure classification. Tool activity remains ephemeral and never
enters the transcript.

## Privacy, bounds, and failures

The projection accepts only the runtime's closed immutable failure union. One
separate pure CLI classifier recognizes the exact two admitted provider error
shapes and maps their already content-free reasons into the shared families
above. It never includes a provider identity, provider reason spelling,
exception text, status value, response body, tool arguments, tool output,
paths, content, call identifiers, or model text. Unknown, malformed, or
operation-mismatched provider values retain the coarser `model/<operation>`
code. Every code and sentence is a fixed CLI-owned string bounded by the
existing notice and transcript limits.

An unknown runtime variant fails closed to `runtime/failure`; it does not echo
the rejected value. This classification is diagnostic presentation only. It
does not retry a turn, repeat a tool, change checkpoint semantics, widen a tool
limit, alter provider transport, or retain a new log.

## Verification

Pure projection tests cover every admitted failure variant, both provider
identities, every shared provider family, malformed and operation-mismatched
provider values, the residual content-free fallback, immutable results,
checkpointed markers, and checkpoint-free notices. Application regressions
prove that a successful tool followed by a model-read failure retains the tool
checkpoint, removes ephemeral activity, publishes the classified marker, and
exposes the same classified notice without provider-specific data.

The canonical Windows and Linux verification gates remain mandatory.

## Update, rollback, and removal

Changing a runtime failure variant or its public code requires this decision,
the pure projection, reducer tests, turn-lifecycle manual, architecture,
engineering guidance, and maintenance guidance to change together. Provider
adapters may not add private presentation codes; a new provider reason must
join an existing adapter-neutral family or amend this decision and both
admitted adapters in one change.

Rollback removes the pure projection and restores the former generic marker
and notice in one change; it does not alter checkpoint retention. Removing
checkpointed tool turns follows decisions 0005 and 0029 and removes this
presentation contract only after the runtime no longer emits checkpointed
terminal failures.
