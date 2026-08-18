# 0075: Owned branching conversation tree

- Status: accepted
- Date: 2026-08-18
- Domain: architecture
- Supersedes: none
- Superseded by: none

## Context

The runtime currently retains one linear conversation. That is sufficient for
continuing from the latest turn, but it forces an operator who wants to revisit
an earlier decision either to discard later context or to restate the earlier
state in a new process. The transcript can scroll through old text, yet scrolling
does not change the context sent to the model and therefore is not branch
navigation.

An owned coding agent benefits from keeping alternate reasoning paths without
creating another agent, controller, model loop, or concurrent conversation. The
tree must therefore be deterministic domain state, expose exactly one active
path, preserve checkpointed tool truth, remain bounded, and change only while
the runtime is idle. Display state must follow the runtime selection without
becoming a second conversation authority.

Public documentation for Pi was previously inspected only for the observable
value of retaining alternate paths and rebuilding one active context. No source,
prompt, schema, identifier, test, fixture, serialization format, or
implementation structure was inspected or reused. This decision defines an
independent design under the repository ownership policy.

This decision narrows the linear-history assumptions of decisions 0005, 0007,
0013, 0024, 0052, and 0061 without replacing their streaming, single-controller,
terminal-navigation, checkpoint, or convergence contracts.

## Decision

`@agent/core` owns an immutable bounded conversation tree. Node zero is the
content-free root. Every non-root node represents exactly one settled turn and
contains only that turn's ordered conversation-entry delta, its parent identity,
depth, settlement classification, and deterministic insertion identity. A turn
delta starts with one user message, contains zero or more complete tool
exchanges, and either ends with one final assistant message or is classified as
a checkpointed incomplete turn. Nodes never move, mutate, or acquire a second
parent.

The tree exposes one active node. Materializing model context walks the unique
parent chain from that node to the root and returns one immutable linear
`Conversation`. Selecting a node changes only the active identity and succeeds
only for an existing node. Appending after an earlier selection creates a new
child while retaining every prior descendant as an alternate branch.

The runtime owns the authoritative tree and one prospective turn based on its
active node. A successful prepared turn appends one completed node. A failed or
cancelled turn appends one checkpointed node only when at least one complete
tool exchange was already committed; an uncheckpointed failure leaves the tree
unchanged. Runtime results expose the new node identity so the serialized CLI
reducer can update its display projection after the authoritative transition.

`/timeline` is the sole operator path for tree navigation. It is available only
while idle and shows the root plus every retained settled turn in deterministic
insertion order. Each turn row uses its process-local node number, depth,
alternate-child count, and a bounded sanitized preview of the originating user
text. Up and Down move without wrapping, Enter selects, and Ctrl+C closes the
selector. Selection replaces the visible transcript with the selected root-to-
node path. The next submitted task branches from that node. Transcript scrolling
remains presentation-only and never selects a node.

There is still one agent, controller, runtime session, active path, and model
loop. Alternate branches are inert retained data; they cannot run, receive tool
events, ask permission, or emit terminal output. Selection and conversation
commit remain serialized and cannot overlap a turn, permission decision,
read cohort, mutation, process execution, model event, or terminal write.

This module is process-memory only. It does not add session files, resume,
import, export, compaction, automatic summaries, branch names, deletion, merge,
retry, or replay. Persistent append-only journaling requires a separate accepted
decision with explicit privacy, filesystem, recovery, schema, migration, and
removal evidence. Existing publication policy continues to state that session
persistence is disabled.

## Bounds and security

The root plus at most 128 settled turn nodes may be retained. All node deltas
together may retain at most 1,048,576 code units and 256 provider-message units,
independent of the existing per-active-conversation limits. Starting another
turn fails content-free when the tree cannot admit one more node or the selected
path cannot admit the prospective user and assistant pair.

Node identities are positive safe integers assigned monotonically; zero is
reserved for the root. Selection accepts only an exact retained identity. The
runtime never accepts caller-supplied entries, parents, depths, settlement
states, or identities. The CLI never sends personal preview text back across
the runtime selection boundary.

All retained content remains process-only and is released during normal
cleanup. Tree navigation does not widen the workspace, read policy, tool
permission, provider, model, credential, network, or shell boundary. Selecting
an old checkpoint may expose the model to an earlier filesystem observation;
it never re-executes that observation or claims that the workspace still
matches it. The next mutating tool must plan and authorize against current
state under its existing stale-state contract.

## Verification

Core tests prove root behavior, immutable append, path materialization,
alternate-child retention, deterministic ordering, invalid delta rejection,
hostile public-array containment, selection failure, and all aggregate bounds.
Runtime tests prove successful and checkpointed node creation, uncheckpointed
failure rollback, model input from the selected path, branching after selection,
idle-only selection, exact node identities, and cleanup.

CLI tests prove the `/timeline` command catalog, selector controls, safe bounded
labels, root and branch transcript projection, serialized runtime-first
selection, cancellation behavior, and no tree change on rejected selection.
Documentation policy tests bind the command surface and process-memory posture.
The canonical Windows and Linux verifier remains the release gate.

## Update, rollback, and removal

Changing node granularity, identity, bounds, settlement classification,
selection timing, path materialization, or visible command requires this
decision, core, runtime, CLI reducer, TUI projection, manuals, policies, and
contract tests to change together.

Rollback first removes `/timeline` from completion and input routing, then
restores the CLI display to one linear list, then returns the runtime to one
linear `Conversation`. Keep all existing checkpoint and cancellation semantics
while converting the active root-to-tip path; never silently choose an
alternate branch.

Removal deletes the command, selector, display projection, runtime selection
port, tree domain type, tests, documentation references, and policy entries in
that order. Persistence work must not reuse or silently extend this in-memory
contract: it first records a separate accepted format and migration decision.
