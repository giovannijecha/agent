# 0067: Owned OpenCode provider selection

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0017, 0018, 0029, and 0061

## Context

Decision 0017 admitted OpenCode Go as the first concrete direct-API provider
and intentionally deferred provider selection until a second current backend
earned that complexity. OpenCode now documents two relevant direct API
services under the same account system. Go remains the subscribed service and
continues to expose the fixed `kimi-k2.7-code` model at its Go endpoint. Zen
separately exposes `deepseek-v4-flash-free` through its ordinary Chat
Completions endpoint.

The free Zen model is useful for maintained interactive evaluations, but it is
available only for a limited period. During that free period, collected data
may be used to improve the model. Replacing Go would remove an already admitted
stable backend, while silently routing Go requests to Zen would merge distinct
usage and privacy contracts. Keeping two initialized runtimes or switching a
model while a turn is active would violate the single-agent controller.

## Decision

Retain `@agent/provider-opencode-go` and add the independently removable
`@agent/provider-opencode-zen` workspace. Both implement the existing
Node-free `StreamingModel` port with independently owned limits, errors, wire
validation, deterministic tests, and injected byte transports. Go remains
fixed to `kimi-k2.7-code` and `/zen/go/v1/chat/completions`. Zen is fixed to
`deepseek-v4-flash-free` and `/zen/v1/chat/completions`. Neither adapter accepts
a model name, endpoint, origin, redirect, or fallback from configuration.

The CLI owns one bounded `ProviderSession` containing only successfully
configured concrete backends. It is both the single model port presented to
the one `AgentRuntime` and the exact session selection authority. Its closed
identities are `opencodeGo` and `opencodeZen`; it admits each identity at most
once, retains one selected index, and delegates each model open to exactly that
selected backend. Go is selected initially when both are configured so adding
Zen does not silently change established behavior. Zen is selected initially
only when it is the sole configured backend.

`/providers` becomes the sole session selection command. With configured
backends it opens one transparent generic `SelectionList` showing each exact
provider and fixed model. Up and Down move without wrapping, Enter selects and
closes, and other editor interaction closes the menu. Selection is accepted
only while the application is idle. The single-writer reducer emits one exact
selection effect, the CLI applies it to `ProviderSession`, and the application
updates its footer only after successful settlement. With no configured
backend, the command reports the existing content-free notice.

The credentials remain independent, memory-only startup inputs:
`AGENT_OPENCODE_GO_API_KEY` and `AGENT_OPENCODE_ZEN_API_KEY`. Interactive
startup offers one hidden prompt for each missing value; Enter skips that
backend. Although one OpenCode account key may be valid for both services,
`agent` never copies, aliases, or falls back from one credential slot to the
other. A configured invalid value fails startup. No credential or selected
provider is persisted.

Both adapters retain the decision 0061 convergent request contract:
`parallel_tool_calls: false`, one provider-neutral instruction, bounded ordered
batch decoding for defensive compatibility, and sequential runtime execution.
Provider selection changes only which backend receives the next immutable
conversation snapshot. It does not create another agent, runtime,
conversation, tool engine, permission policy, or concurrent model decision.

## Security and privacy contract

Each HTTPS transport retains its own exact origin path and sends only the
credential configured for that backend. Selection never widens the origin
allowlist and failure never tries the other backend. A Go limit, Zen model
withdrawal, provider status error, malformed stream, or transport failure is
reported through the existing content-free failure path.

OpenCode documents current Go model-specific retention separately. It
documents Zen models as hosted in the United States and identifies
`deepseek-v4-flash-free` as an exception whose collected data may be used to
improve the model during the temporary free period. The manual and privacy
policy must warn operators not to submit secrets, personal data, or
confidential content to that free model. These provider terms can change and
must be rechecked before any model or endpoint update.

Provider keys, authorization headers, candidate conversations, selection
state, and provider failure bodies never enter notices, logs, receipts,
fixtures, documentation examples, or persisted state. Offline verification
uses only synthetic credentials and deterministic transports. A live request
remains a maintainer-operated post-integration evaluation, never part of the
canonical verifier.

## Verification

Contract tests cover both fixed endpoints, models, headers, cancellation,
cleanup, strict stream validation, and credential isolation. Pure
`ProviderSession` tests cover empty and duplicate rejection, deterministic
initial selection, closed identities, unavailable selection, and delegation
only to the selected model. CLI tests cover both hidden prompts, independent invalid
configuration, providerless startup, the contextual selection menu, idle-only
switching, footer settlement, and absence of implicit fallback.

The package graph, ownership policy, provider allowlist, TypeScript references,
manual, maintenance guidance, privacy policy, lockfile, Windows verifier, and
Linux verifier change together. No canonical test contacts OpenCode or reads a
real credential.

## Update, rollback, and removal

If the free Zen identifier, availability, endpoint, or privacy terms change,
fail closed until this decision, provider policy, documentation, and offline
contracts are deliberately updated. Never substitute paid
`deepseek-v4-flash`, the Go endpoint, Zen balance, or another free model
automatically.

Zen can be rolled back independently by removing its CLI transport, provider
workspace, credential input, provider-session entry, policy registrations,
tests, documentation, and package references. Go then becomes the sole
selection and existing provider behavior remains unchanged. Go can likewise be
removed only through a replacing decision that selects Zen by construction and
removes every Go credential and origin reference. Removing both restores the
providerless CLI. In every case the canonical verifier must pass before the
change is complete.
