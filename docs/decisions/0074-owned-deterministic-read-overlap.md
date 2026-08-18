# 0074: Owned deterministic read overlap

- Status: accepted
- Date: 2026-08-18
- Domain: architecture
- Supersedes: none
- Superseded by: none

## Context

The runtime already accepts one bounded ordered tool-call batch, but decision
0029 requires every handler to run sequentially. That rule is necessary for
mutations and execution because a later operation may depend on state produced
by an earlier one. It also makes independent repository inspection slower than
necessary: reading several files or combining a directory listing with a text
search has no owned effect to serialize.

The `read` risk label alone is not a sufficient concurrency proof. A future
read-classified integration could retain hidden state, depend on another call,
or require exclusive access. Model-selected sibling calls also cannot be
trusted to establish independence. Overlap therefore needs a separate owned
registration contract, a fixed cohort bound, a mutation barrier, deterministic
reduction, and complete cancellation settlement.

A filesystem-wide atomic snapshot would add a second storage authority and is
not available portably without copying or platform-specific snapshot services.
Sequential reads do not provide such a snapshot either because external actors
may change the workspace between observations. The truthful contract is a
bounded observation cohort under the agent's own mutation barrier: every result
describes its individual read, while no owned write or process may overlap it.

This decision narrows the sequential-execution clauses of decisions 0013,
0029, 0055, and 0061 without replacing their broader single-controller,
checkpoint, permission, and convergence contracts.

## Decision

Tool registration gains one optional `independentRead` scheduling declaration.
The tool engine accepts it only for a direct `read` handler with no planner and
projects the declaration through prepared and planned calls. Absence means
`serial`. The three built-in inspection tools, `read_file`, `list_directory`,
and `search_text`, are the initial and only enrolled handlers.

The runtime may form one parallel-read cohort only when a complete provider
batch contains between two and four calls and every prepared call declares
`independentRead`. Any mixed batch, single call, oversized batch, unregistered
read, write, or `shell` call follows the existing sequential path. The runtime
does not split or reorder a batch to manufacture parallel work.

Before any enrolled handler starts, the sole controller:

1. validates the complete ordered batch and reserves every output budget;
2. plans every call serially in provider order;
3. emits and resolves one exact permission request per call in provider order;
4. stops without invoking a handler if cancellation wins before cohort start;
   and
5. starts all allowed calls as one cohort only after every permission settles.

Denied calls receive the existing truthful `denied` result and do not enter the
cohort. Allowed handlers share the turn cancellation signal and run with a
fixed maximum width of four. No model read, permission decision, mutation,
`shell` execution, conversation commit, or terminal write overlaps the cohort.

The runtime awaits every started handler even after cancellation or a handler
contract failure. It buffers settlements, then emits completion events and
results in provider order. It constructs one complete ordered `ToolExchange`
and checkpoints that exchange once. Completion timing never changes
conversation order. An ordinary read failure remains one structured result.
Any handler contract
failure is checkpointed with the rest of the cohort and then terminates the
turn as `toolEngine`. Cancellation after cohort start checkpoints the actual
settled results and then terminates the turn as cancelled.

This is not an atomic multi-file filesystem snapshot. It is one causal model
checkpoint containing individually truthful observations made while the owned
controller excluded every owned effect. Later effect planning still observes
the checkpoint and retains its existing stale-state and containment contracts.

The provider-neutral instruction permits one batch of two to four independent
sibling inspection calls. It continues to require at most one call for every
mutation, `shell` execution, dependent read, or other case, followed by
reassessment after the checkpoint. Provider decoding stays bounded and accepts
ordered batches defensively.

## Bounds and security

Four is the immutable read-cohort width. The existing per-turn, argument,
output, conversation, and provider bounds remain independent. Registration
fails closed when `independentRead` is applied to a planner, a write, execution,
or a missing handler. Hostile or malformed handler settlement remains
content-free at the error boundary.

Every call retains its exact permission identity. No permission covers a cohort
and no later call starts while an `Ask` decision is pending. The shared
workspace boundary and read-disclosure policy remain unchanged. Overlap never
widens readable paths, follows a symlink, exposes a credential, creates ambient
network access, or admits a second controller.

Externally initiated workspace changes may still produce observations from
different filesystem moments. The product makes no transaction-snapshot claim
and does not retry or conceal that fact. Owned mutations and process execution
cannot create that drift because they remain outside the active cohort.

## Verification

Tool-engine tests prove valid enrollment, serial defaulting, and fail-closed
rejection for every non-read or planned registration. Built-in composition
tests prove that exactly the three inspection tools enroll.

Runtime tests use controlled deferred handlers to prove that two through four
allowed reads start before any sibling settles; planning and permissions remain
ordered and finish events and `ToolExchange` results retain provider order.
They also prove serial fallback for mixed and oversized batches, denial without
invocation, cancellation before and after cohort start, all-handler settlement,
contract-failure checkpoint truth, one model continuation after the complete
checkpoint, and one active runtime event reader.

Instruction and documentation-policy tests bind the bounded sibling-read rule.
The canonical Windows and Linux verifier remains the release gate.

## Update, rollback, and removal

Changing the cohort width, enrollment meaning, permission barrier,
cancellation, settlement, event order, or checkpoint reduction requires this
decision, tool engine, runtime, CLI composition, instructions, architecture,
engineering and maintenance guidance, operator manual, policy registrations,
and contract tests to change together.

Rollback first restores the one-call instruction, then removes
`independentRead` from built-in registrations and returns every batch to the
sequential runtime path. Keep the ordered batch decoder and `ToolExchange`
shape so existing history remains readable. Only after no handler can start in
a cohort may the scheduler state and overlap tests be removed.

Removing one enrolled read tool requires removing its declaration in the same
change as its handler. Removing concurrency entirely does not require removing
the inspection tools or the defensive batch protocol.
