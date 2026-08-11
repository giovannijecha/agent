# 0029: Canonical tool-call batches

- Status: accepted
- Date: 2026-08-10

## Context

An OpenAI-compatible model may return several tool calls in one assistant
response even when a client asks it not to. The first OpenCode Go adapter
accepted exactly one call. A request involving two readable files therefore
failed at the provider boundary before either call reached the owned runtime.

Treating each call as an unrelated model event would lose the identity and
ordering of the original assistant response. Executing calls concurrently
would create a different problem: the current `read` risk class does not prove
that a handler observes an immutable snapshot, is independent from its peers,
or is safe to overlap. Model-selected batching and host-side concurrency are
separate contracts.

## Decision

One model response may emit one bounded, non-empty, ordered tool-call batch.
The single runtime controller validates the complete batch before invoking any
handler, then executes its calls sequentially in provider order. A one-call
response uses the same batch contract with one element; no parallel single-call
path remains.

The provider-neutral model port exposes one terminal `toolCalls` event. The
event owns an immutable array of calls with unique call identifiers. Provider
decoders must assemble every indexed call completely, reject gaps, duplicates,
invalid arguments, and all per-call or aggregate limit violations, and emit no
partial batch.

Core stores one complete `ToolExchange` for the original assistant response.
It contains optional assistant text, the ordered calls, and one ordered result
for every call. Call and result identifiers and names must match exactly. This
preserves the wire truth that one assistant message introduced the complete
array, followed by one tool-result message per call. Conversation limits count
those wire-equivalent message units rather than only core object count.

Runtime batch preflight proves, before effects:

- the batch and remaining turn limits;
- unique call identifiers;
- availability, schema validity, and approval preview for every call;
- conversation capacity plus deterministic per-call output budgets that retain
  room for every generic failure result and the final assistant response; and
- closure of the originating model stream, with any cleanup failure retained
  as an independently observable outcome.

Each call retains the existing event lifecycle. Read calls proceed without an
approval. Write and execute calls require an exact, one-use decision scoped to
their turn and call identifiers. Denial records a truthful failure result and
continues the batch. Ordinary handler failure also records its result and
continues. Contract failure records an internal result, marks remaining calls
as not run, checkpoints a complete exchange, and terminates the turn.

Cancellation before any call settles discards the batch. Cancellation after a
settled call, or during a started handler, produces content-free `cancelled`
results for calls that were not invoked, checkpoints the complete exchange, and
terminates the turn. A distinct owned `notRun` tool-engine operation creates
those results without pretending that a handler ran. Stop requests cancellation
and observes settlement and cleanup before returning.

The model stream is reopened only after every call has a result and the complete
exchange is checkpointed. Runtime events remain per call, so the CLI continues
to show only the current contextual activity above the composer and keeps tool
traffic out of the conversation transcript.

OpenCode Go advertises `parallel_tool_calls: true` only after its decoder,
history encoder, runtime, bounds, cancellation, and tests implement this
decision. In this protocol the field permits the model to *select* a batch; it
does not promise simultaneous handler execution.

Actual read-tool concurrency remains deferred. It requires a separate decision
and an explicit snapshot/independence contract, a fixed worker bound,
deterministic reduction, complete cancellation and cleanup, mutation barriers,
and evidence that overlap materially helps. `run_process` remains blocked.

This decision supersedes the one-call-per-model-step clauses of decisions 0008
and 0017. It narrows decision 0013 by confirming that a tool batch is still one
model decision owned by one agent and one controller; its calls remain serial.

## Bounds and security

Batch count, total calls per turn, arguments per call, aggregate arguments,
per-call assigned tool output, aggregate reserved output, conversation message
units, conversation code units, and provider wire events are independently
bounded. All failures remain content-free. No submitted text, tool arguments,
tool output, provider payload, or credential may enter an error, log, or
diagnostic.

The provider rejects malformed or incomplete indexed assemblies before the
runtime can observe them. The runtime snapshots and freezes the batch again at
its trust boundary and preflights every call before effects. Approvals never
cover a batch. Mutation, process execution, model reads, terminal output, and
conversation commits remain serialized.

## Verification

Core tests prove complete exchange construction, order and identifier matching,
immutability, code-unit accounting, and wire-equivalent message units. Provider
tests prove multiple calls in one frame, fragmented/interleaved assembly,
stable order, malformed indices, duplicate identifiers, invalid or excessive
arguments, exact request configuration, and one assistant batch plus ordered
tool-result history messages.

Runtime tests prove one-call compatibility, complete preflight before effects,
serial execution, exact per-call approvals, denial and ordinary failure
continuation, cancellation before and during the batch, content-free not-run
results, contract-failure checkpoint truth, exact and invalid output budgets,
aggregate limits, one stream close,
and one model reopen only after a complete checkpoint. CLI tests prove that
per-call activity replaces the previous contextual surface and disappears at
turn settlement without entering the transcript. The canonical Windows and
Linux verifier remains the release gate.

## Update, rollback, and removal

Changing batch order, limits, approval scope, checkpoint shape, cancellation,
or provider encoding requires this decision, core/runtime/provider contracts,
tests, manuals, architecture, privacy analysis, and removal guidance to change
together.

To remove batching, first configure every provider to request and enforce one
call, retain the one-element `toolCalls` event and `ToolExchange`, and reduce the
public batch bound to one. Only after all histories and tests contain no
multi-call exchange may the aggregate types be collapsed. Removing a provider
does not affect the core exchange, runtime scheduler, tools, CLI, or TUI.
