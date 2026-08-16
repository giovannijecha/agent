# 0017: Owned OpenCode Go provider

- Status: accepted
- Date: 2026-08-09
- Amended: 2026-08-16 by decision 0061 for convergent tool turns

## Context

The four requested subscription OAuth integrations remain blocked because no
provider has yet authorized `agent` as an independent client. OpenCode Go is a
different integration class: its official documentation issues subscribers an
API key and publishes direct model endpoints for third-party clients. It does
not require an OpenCode binary, SDK, client registration, credential file, or
borrowed application identity.

The first provider must preserve the existing single-agent architecture. It
must not introduce a generic provider framework before a second concrete
protocol earns one, move ambient networking into the Node-free runtime, or make
the provider responsible for terminal, tool, or application policy.

## Decision

Add one concrete Node-free workspace named `@agent/provider-opencode-go`. It
implements the existing `StreamingModel` port for the officially documented Go
Chat Completions endpoint and the fixed initial model `kimi-k2.7-code`. It uses
only an injected provider-specific byte transport. It does not read process
state, open sockets, retain a credential, invoke OpenCode, read OpenCode
configuration, or depend on a vendor SDK.

The CLI remains the only platform and network boundary. Its owned HTTPS
transport is fixed to `opencode.ai`, TLS port 443, and
`/zen/go/v1/chat/completions`. The API key is read once from the exact
`AGENT_OPENCODE_GO_API_KEY` environment variable, validated without exposing
its value, retained only in process memory, and sent only in the authorization
header for that fixed origin. A missing variable preserves the current
providerless startup. An invalid configured value fails startup with a fixed
content-free diagnostic. No command-line secret, disk store, fallback origin,
proxy setting, redirect, cookie, telemetry, or persistent login is added.

The provider package owns an independently written strict UTF-8 decoder, SSE
framer, Chat Completions request encoder, streamed response validator, tool-call
assembler, and content-free error vocabulary. It sends one small
provider-neutral system instruction authored in this repository, the immutable
conversation snapshot, the exact owned tool descriptors, `stream: true`, and
`parallel_tool_calls: false`. Decision 0061 restores a one-call request policy so
each new model decision observes the prior checkpointed result before authoring
another call. The instruction requires the model to reassess remaining work and
finish every requested part or explain one blocker. Decision 0029 still governs
defensive compatibility: the strict decoder accepts one choice and one bounded
ordered call batch, assembles indexed fragments, and emits it atomically if the
service returns several calls despite the request. Handlers remain sequential
under the sole runtime controller. Unsupported finish reasons, multiple choices,
malformed JSON, invalid UTF-8, unknown tool-call structure, excessive data,
wrong status, and wrong content type fail closed.

The transport exposes a pull-based response with one-reader semantics. The
Node adapter pauses the incoming response between reads, retains at most one
bounded byte chunk, applies an inactivity timeout, limits response headers, and
settles pending work during cancellation or close. The provider parser retains
only bounded undecoded bytes, one bounded SSE frame, bounded per-call and
aggregate tool arguments, and a constant-size pending event list. Runtime response, event, conversation,
and tool bounds remain authoritative after protocol validation.

OpenCode Go is a model backend, not another agent. It cannot start a second
runtime, delegate, create a swarm, add tools, approve mutations, or write to the
terminal. The existing `AgentRuntime`, single application controller, tool
engine, approval boundary, and serialized renderer remain unchanged.

## Security and privacy contract

The key and authorization header never enter errors, logs, notices, tests,
documentation examples, conversation state, tool results, or terminal output.
Transport failures discard underlying exception text. Non-success response
bodies are not retained or displayed. Model and user content is transmitted
only after the user configures the key and submits a turn; the manual must state
the provider's current retention terms and that those terms can change.

Tests use synthetic non-secret values and deterministic in-memory transports.
They cover fragmented UTF-8 and SSE data, text streaming, tool calls, malformed
and oversized input, cancellation during open and read, concurrent reads,
unexpected status and content type, transport failure, idempotent close, exact
origin and headers, missing configuration, and proof that diagnostics retain no
credential or model content. No live request or paid account is required by the
canonical verifier.

## Consequences

`agent` gains one usable provider without weakening the four OAuth blocks or
adding a foreign runtime. The package graph becomes:

```text
@agent/cli -> @agent/provider-opencode-go -> @agent/runtime
                                           -> @agent/tools
                                           -> @agent/core
@agent/cli -> @agent/runtime -> @agent/tools -> @agent/core
@agent/cli -> @agent/tui
```

The initial model is intentionally fixed. Model discovery, aliases, automatic
routing, balance fallback, and a generic provider registry are deferred. A
future model choice must be explicit, documented, bounded, and tested; a second
protocol may justify extracting shared primitives only after duplication is
measured.

## Update, rollback, and removal

Update the endpoint, model, wire contract, limits, privacy statement, or header
policy only from current official documentation and with matching offline
contract tests, provider-policy changes, and a replacing decision when the
trust boundary changes. Never silently follow redirects or endpoint aliases.

Roll back by removing the CLI composition and HTTPS transport, deleting the
provider workspace and its TypeScript references, restoring the providerless
command notice, removing the enabled-provider registry entry and allowlists,
and retaining the four blocked subscription requests unchanged.

To remove OpenCode Go completely, also delete this decision, its manual and
maintenance sections, its tests and declarations, and the exact environment
variable documentation. Canonical verification must then prove that all five
foundation workspaces and the providerless CLI behave exactly as before.
