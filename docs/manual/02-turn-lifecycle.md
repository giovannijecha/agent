# 02 - Turn lifecycle

## Submit a task

Enter one nonblank request in the composer. Agent accepts one active turn at a
time and keeps the submitted text and streamed answer provisional until the turn
settles. The fixed runtime limits are listed in
[Architecture](../ARCHITECTURE.md#composition-and-turn-lifecycle).

## Follow progress

Assistant text appears as it streams, but partial text is not conversation
history. The contextual activity area shows only the current tool step and its
written state. A moving footer pulse means autonomous work is advancing; it
stops while Agent waits for a permission decision.

## Tool checkpoints

Agent validates a complete model-selected tool batch before planning or
permission. Each plan receives its own decision in provider order. Effects and
dependent reads run one at a time. A batch of two to four independent sibling
inspection calls may start together only after every permission settles; their
completion is reported in provider order. See
[Tools and permissions](04-tools-and-approval.md) for the available actions.

After one serial attempt or the complete read cohort settles, its ordered calls
and results become one truthful conversation checkpoint before the model
continues. A later failure or cancellation cannot erase that completed truth.

## Complete or continue

After a checkpoint, the same model receives the result and reassesses the
remaining task. A final assistant response enters the transcript only after the
runtime prepares it and the CLI acknowledges the commit. If no runtime is
configured, submitted text is discarded and no turn starts.

Every settled turn becomes one bounded timeline node. After runtime and display
settlement, the serialized controller appends that complete node to the local
session journal. While idle, `/timeline` can select the root or an earlier
settled node; an accepted selection also updates the durable head. The transcript
then shows only that root-to-node path, and the next submitted task creates a
new child there without deleting the former continuation. Selecting history
does not rerun tools or restore old workspace state; mutations still plan and
request permission against current state.

## Cancel or exit

During active work, Ctrl+C requests cancellation and keeps Agent open. Only
state newer than the last completed tool checkpoint is discarded. At idle,
Ctrl+C exits. `/exit`, Ctrl+D, and terminal EOF exit in every phase and still
attempt terminal and runtime cleanup. If shutdown settles a completed tool
checkpoint, Agent journals that settled turn before closing the session; it
does not rerun the tool or retry a journal append already attempted.

## Failures

A failed turn discards partial assistant text and reports one content-free code:

- `model/...` means opening or reading the model response failed;
- `tool/...` means tool validation, availability, limits, or engine settlement
  failed; and
- `runtime/failure` is the closed residual runtime classification.

Invalid calls are rejected before planning and permission as
`tool/invalid-call/name`, `tool/invalid-call/input`, or
`tool/invalid-call/identity`. A failure after a checkpoint keeps the completed
tool result in conversation and marks only the later continuation as failed.
Check the code before retrying so an already completed effect is not repeated.
Cleanup failures remain separate from the primary failure.

## References

- [Current runtime architecture](../ARCHITECTURE.md#composition-and-turn-lifecycle)
- [Runtime and application maintenance](../MAINTENANCE.md#streaming-runtime)
- [Tool-call batch decision](../decisions/0029-canonical-tool-call-batches.md)
- [Checkpointed failure decision](../decisions/0052-owned-checkpointed-turn-failure-classification.md)
- [Convergent turn decision](../decisions/0061-owned-convergent-tool-turns.md)
- [Tool-call interoperability decision](../decisions/0069-owned-tool-call-interoperability.md)
- [Deterministic read-overlap decision](../decisions/0074-owned-deterministic-read-overlap.md)
- [Branching conversation-tree decision](../decisions/0075-owned-branching-conversation-tree.md)
- [Durable-session decision](../decisions/0076-owned-bounded-session-journal.md)
