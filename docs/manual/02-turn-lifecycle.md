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

Agent validates a model-selected tool request before planning or permission.
Valid calls run in provider order, one at a time, and each planned call receives
its own permission decision. See [Tools and permissions](04-tools-and-approval.md)
for the available actions.

After a tool attempt settles, its structured call and result become a truthful
conversation checkpoint before the model continues. A later failure or
cancellation cannot erase that completed effect.

## Complete or continue

After a checkpoint, the same model receives the result and reassesses the
remaining task. A final assistant response enters the transcript only after the
runtime prepares it and the CLI acknowledges the commit. If no runtime is
configured, submitted text is discarded and no turn starts.

## Cancel or exit

During active work, Ctrl+C requests cancellation and keeps Agent open. Only
state newer than the last completed tool checkpoint is discarded. At idle,
Ctrl+C exits. `/exit`, Ctrl+D, and terminal EOF exit in every phase and still
attempt terminal and runtime cleanup.

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
