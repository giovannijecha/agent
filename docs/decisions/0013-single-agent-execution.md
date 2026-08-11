# 0013: Single-agent execution

- Status: accepted
- Date: 2026-08-08

## Context

The product name does not by itself define whether it represents one agent or a
coordinated collection. Multi-agent delegation would introduce a scheduler,
agent identities, inter-agent messages, shared-state arbitration, nested
cancellation, compounded tool authority, and new privacy and failure boundaries.
Those costs conflict with the intended lightweight personal agent unless the
product explicitly earns them.

Model providers, tools, runtime modules, TUI components, and verification jobs
are capabilities used by the product; they are not separate agents.

Treating single-agent as single-threaded would unnecessarily prevent independent
immutable computations or side-effect-free I/O waits from overlapping even
though none of those mechanics owns a decision or identity.

## Decision

`agent` is a single-agent product. One agent identity and application controller
own one active runtime session and one active model decision loop. A configured
provider is an interchangeable model backend for that same agent, not an agent
identity.

Mechanical concurrency does not create another agent. The sole controller may
schedule bounded controller-internal mechanics concurrently only during a
read-only phase and over immutable snapshots. They cannot enter the model,
runtime, or tool engine or own context, plans, conversations, follow-up
decisions, or authority. Their outcomes return to that controller and are
reduced in a deterministic order. Any mutation excludes concurrent mechanics.
Model turns and mutations remain serialized. Approvals, process execution, and
terminal output remain serialized. Current runtime remains sequential until a
measured non-mutating optimization is earned.

A bounded ordered tool-call batch selected by one model response remains one
decision by this same agent. The controller validates the complete batch and
reduces its results deterministically; batch members do not own identities,
plans, conversations, follow-up decisions, or authority. Handler execution is
sequential under decision 0029.

The product will not create sub-agents, delegate tasks to hidden workers, run an
agent swarm, or merge concurrent agent conversations. UI panels may present
tools, status, and provider selection, but they do not imply additional actors.
Provider adapters remain replaceable at composition and must preserve the same
single-agent runtime contract.

## Consequences

Conversation order, cancellation, approvals, tool effects, and resource bounds
remain attributable to one execution path. Independent non-mutating work may
improve responsiveness without gaining authority or becoming an actor. This
keeps the security and privacy model understandable and the TUI lightweight. It
deliberately excludes parallel agent specialization even if a provider exposes
such a feature.

## Update, rollback, and removal

New runtime, provider, tool, persistence, and UI work must preserve the
single-agent invariant in contracts, tests, and documentation. Any mechanical
concurrency must prove independence, non-mutation, bounded resource use,
deterministic reduction, cancellation, and cleanup. Removing a provider or tool
does not affect the invariant.

Supporting multiple agents would be a replacement architecture, not an additive
flag. It requires a superseding decision, explicit identity and authority models,
bounded scheduling and messaging, deterministic cancellation and cleanup,
privacy analysis, migration and removal plans, and end-to-end tests before any
multi-agent code is admitted.
