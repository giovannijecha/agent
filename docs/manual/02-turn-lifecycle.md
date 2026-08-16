# 02 - Turn lifecycle

## Purpose

Use this chapter to understand what happens to input, streamed model text,
conversation state, cancellation, and truthful tool checkpoints when a runtime
is eventually injected.

## Operator workflow

Submit one nonblank line to start a turn when a runtime is available. Only one
turn may be active. Streamed assistant text is display-only until the runtime
prepares it and the CLI acknowledges an explicit commit. During an active turn,
Ctrl+C requests cancellation and preserves the current draft. Use `/exit` or
Ctrl+D to terminate the application even while work is active.

## Guarantees and limits

Input is bounded to 4,096 Unicode code points; a response to 262,144 UTF-16 code
units; a stream to 4,096 events; a conversation to 256 entries and 1,048,576
code units; and one turn to 32 tool steps. User and assistant text before the
first completed tool attempt is prospective. A completed tool attempt creates a
conversation checkpoint; later cancellation can discard only state newer than
that checkpoint.

## Failure behavior

Blank or malformed deltas, oversized content, invalid model events, tool-loop
limits, transport failures, and hostile boundary values become typed,
content-free failures. Partial assistant text is never committed after a failed
turn. Runtime cleanup errors remain independently observable and cannot replace
the primary failure. Without an injected runtime, submission is discarded
immediately and no turn begins.

If failure occurs after a completed tool checkpoint, completed tool activity
remains in conversation and only newer prospective model text is discarded. A
bounded transcript marker and the latest ephemeral notice expose the same
closed code: `model/...` identifies model continuation, `tool/...` identifies
tool-call, availability, limit, or engine settlement, and `runtime/failure` is
the content-free residual. Admitted provider errors may add one shared
content-free family after `model/open` or `model/read`; an initial open failure
also states that no usable stream opened and no tool ran. A prior green tool
result remains successful; the later classified failure does not rewrite it.
An invalid request is rejected before planning or permission and distinguishes
only `tool/invalid-call/name`, `tool/invalid-call/input`, or
`tool/invalid-call/identity`. These codes identify an unknown canonical name,
invalid structured arguments, or an invalid call identity respectively; they
never reproduce the rejected request.
Provider identity, raw reason names, statuses, response bodies, tool payloads,
paths, content, and call identifiers are never displayed or retained for this
diagnosis. Check the code before retrying because an external effect may already
have completed.

## Maintenance and removal

Change turn ordering only with runtime, reducer, arbiter, cancellation,
checkpoint, privacy, and cleanup regressions. Remove runtime composition before
removing its package so the provider-independent CLI surfaces continue to
discard input safely.
The full rollback order is in [the maintenance runbook](../MAINTENANCE.md).

## Evidence

- Runtime limits: `packages/agent-runtime/src/limits.ts`
- Streaming state machine: `packages/agent-runtime/src/runtime.ts`
- Runtime event protocol: `packages/agent-runtime/src/events.ts`
- Single-writer reducer: `packages/agent-cli/src/application.ts`
- Display-only chat state: `packages/agent-cli/src/chat-state.ts`
- Failure presentation: `packages/agent-cli/src/turn-failure-presentation.ts`
- Classification decision: `docs/decisions/0052-owned-checkpointed-turn-failure-classification.md`
- Tool-call interoperability decision: `docs/decisions/0069-owned-tool-call-interoperability.md`
