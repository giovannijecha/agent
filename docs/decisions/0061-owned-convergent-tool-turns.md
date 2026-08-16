# 0061: Owned convergent tool turns

- Status: accepted
- Date: 2026-08-16
- Amended: 2026-08-16 by decision 0067 for the OpenCode Zen adapter
- Amended: 2026-08-16 by decision 0069 for exact required-argument and
  workspace-root guidance
- Amends: decisions 0008, 0017, and 0029

## Context

A user request may contain several dependent goals, such as removing content
from one HTML file and then restyling that same file. OpenCode Go currently
requests parallel tool selection. The model can therefore describe several
mutations in one response before it has observed the first mutation result.

The runtime executes such a batch sequentially and plans every mutation just in
time, as required by decisions 0008 and 0029. That preserves effect truth, but it
cannot make a later model-authored patch reflect a state the model had not yet
seen. The later plan may correctly fail as stale or conflicting. Relying on an
additional recovery response after an avoidable conflict makes ordinary
multi-part work less reliable and consumes tool-step and conversation bounds.

Executing handlers concurrently would worsen this problem and would violate the
single-controller mutation, process, permission, checkpoint, and terminal
contracts. Automatic retry is also invalid: only the model can author a new
patch for the newly observed state, and a completed effect must never be replayed
implicitly.

## Decision

Every admitted OpenCode adapter requests exactly one tool call per model response by encoding
`parallel_tool_calls: false`. The owned provider-neutral instruction tells the
model to issue at most one call, observe its structured result, reassess the
remaining user goal, and continue until every requested part is complete or one
explicit blocker remains. Currently known edits to one file should be
consolidated into one `apply_patch` call rather than split into adjacent patches.
A failed result must be corrected or explained, never repeated blindly. The
same instruction requires every advertised required argument and identifies
`"."` as the exact workspace-root path representation.

This is a model-turn barrier, not a second controller and not a handler retry.
After one tool result is checkpointed, the existing runtime reopens the same
model with the updated complete conversation. The next call is therefore
authored against the latest acknowledged tool truth. The existing per-turn limit
of 32 calls bounds continued work.

The generic model event, core `ToolExchange`, provider decoder, and runtime keep
their bounded ordered batch shapes. A compatible service can return several
calls despite the request field, and old conversation history may contain a
batch. The decoder still accepts one complete valid batch, and the runtime still
validates it before effects, plans just in time, executes sequentially in
provider order, and checkpoints one complete exchange. Ordinary planning or
handler failure remains a structured result visible to the next model decision.
It is not promoted to a turn failure merely because the response contained more
than one call.

No current tool handler runs concurrently. Read overlap remains deferred until
the immutable-snapshot, independence, worker-bound, cancellation, deterministic
reduction, and measured-benefit proof required by decision 0029 exists. The
broad `list_directory`, `search_text`, and line-projected `read_file`
capabilities remain the current way to reduce avoidable model turns without
weakening state observation.

## Bounds and security

The one-call request changes model selection only. It does not widen schemas,
paths, programs, output limits, permission scope, disclosure policy, effect-plan
binding, native commit authority, conversation limits, or cancellation. Every
write and execution still receives one exact decision and crosses its owned
committer or containment boundary at most once.

Provider noncompliance is contained by the existing bounded decoder and
sequential runtime. A later conflict cannot roll back or conceal an earlier
successful effect. No provider payload, tool argument, output, path, content,
credential, or failure cause enters diagnostics.

## Verification

Provider request tests prove the exact false request field with and without
conversation history. Instruction tests prove the bounded convergence clauses.
A concrete provider/runtime integration regression drives a multi-part task
through two separate tool decisions, verifies that the second request contains
the first checkpointed result, and reaches one final assistant completion.
Runtime regressions retain defensive multi-call ordering and prove that an
ordinary later conflict can return to the model for a corrective next step.

The canonical Windows and Linux verifier remains the release gate.

## Update, rollback, and removal

Changing the model-turn barrier requires this decision, provider request and
instruction tests, runtime convergence regressions, architecture, operator
manual, maintenance guidance, privacy analysis, and ownership registrations to
change together. Enabling parallel selection again additionally requires
evidence that dependent mutation and execution calls cannot be authored from a
stale pre-result snapshot.

Roll back only by restoring the earlier request field and instruction together
while retaining the defensive batch decoder and sequential runtime. Remove the
policy completely by deleting this decision and its registrations after all
provider, runtime, manual, architecture, maintenance, and instruction references
have been removed and canonical verification passes.
