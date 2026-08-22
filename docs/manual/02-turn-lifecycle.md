# 02 - Turn lifecycle

## Submit and follow a task

Enter one nonblank request. Agent accepts one active turn at a time. User input,
streamed assistant text, and native reasoning remain provisional until the
owning response segment settles. With no selected runtime, the draft is
discarded after a notice and no conversation entry is created.

The current contextual activity shows only the latest tool step. Footer motion
means autonomous work is advancing and stops while a permission decision is
pending.

## Tool checkpoints

Agent validates a complete provider tool-call batch before planning or
permission. Every valid plan receives its own decision in provider order.
Effects and dependent reads execute one at a time. Two to four independent
sibling inspection calls may overlap only after all their permissions settle;
results still return in provider order.

After one call or read cohort settles, Agent commits its calls, truthful results,
and associated settled reasoning as one checkpoint before asking the model to
continue. Later failure or cancellation cannot erase or implicitly repeat that
completed work.

## Completion and branches

A final assistant response enters conversation only after runtime and CLI
settlement. Every settled turn becomes one timeline node and is appended to the
local journal.

While idle, `/timeline` may select the root or an earlier settled node. The
transcript and next model context change to that root-to-node path. A later task
creates a new child without deleting the former continuation. Selection never
replays a tool or restores filesystem state.

Reasoning Stream `Off` hides separate reasoning documents but does not delete
settled reasoning needed for model continuity or resume. Effort controls whether
later requests ask for native reasoning.

## Cancellation and failure

Ctrl+C during active work requests cancellation and keeps Agent open. Only state
newer than the last checkpoint is discarded. `/exit`, Ctrl+D, and EOF close from
any phase while still attempting cleanup and publication of already settled
truth.

Failure codes are deliberately content-free:

- `model/...` identifies response opening or reading;
- `tool/invalid-call/...` identifies name, input, or identity validation;
- `tool/...` identifies planning, permission, execution, or settlement; and
- `runtime/failure` is the closed residual classification.

A failure after a checkpoint preserves that checkpoint. Inspect the category
before retrying so a completed write, command, or provider-visible effect is not
repeated. Cleanup failure is reported separately from the primary outcome.

See [Tools and permissions](04-tools-and-approval.md) for effect behavior and
[Architecture](../ARCHITECTURE.md) for fixed lifecycle bounds.
