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

## Maintenance and removal

Change turn ordering only with runtime, reducer, arbiter, cancellation,
checkpoint, privacy, and cleanup regressions. Remove runtime composition before
removing its package so the providerless CLI continues to discard input safely.
The full rollback order is in [the maintenance runbook](../MAINTENANCE.md).

## Evidence

- Runtime limits: `packages/agent-runtime/src/limits.ts`
- Streaming state machine: `packages/agent-runtime/src/runtime.ts`
- Runtime event protocol: `packages/agent-runtime/src/events.ts`
- Single-writer reducer: `packages/agent-cli/src/application.ts`
- Display-only chat state: `packages/agent-cli/src/chat-state.ts`
