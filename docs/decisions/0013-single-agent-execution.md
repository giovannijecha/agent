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

## Decision

`agent` is a single-agent product. One application controller owns one active
runtime session, the runtime permits one active model turn, model/tool steps are
sequential, and only one tool approval can be pending. A configured provider is
an interchangeable model backend for that same agent, not an agent identity.

The product will not create sub-agents, delegate tasks to hidden workers, run an
agent swarm, or merge concurrent agent conversations. UI panels may present
tools, status, and provider selection, but they do not imply additional actors.
Provider adapters remain replaceable at composition and must preserve the same
single-agent runtime contract.

## Consequences

Conversation order, cancellation, approvals, tool effects, and resource bounds
remain attributable to one execution path. This keeps the security and privacy
model understandable and the TUI lightweight. It deliberately excludes parallel
agent specialization even if a provider exposes such a feature.

## Update, rollback, and removal

New runtime, provider, tool, persistence, and UI work must preserve the
single-agent invariant in contracts, tests, and documentation. Removing a
provider or tool does not affect the invariant.

Supporting multiple agents would be a replacement architecture, not an additive
flag. It requires a superseding decision, explicit identity and authority models,
bounded scheduling and messaging, deterministic cancellation and cleanup,
privacy analysis, migration and removal plans, and end-to-end tests before any
multi-agent code is admitted.
