# 05 - Providers and authentication

## Purpose

Use this chapter to configure the admitted OpenCode Go and OpenCode Zen
adapters inside one running `agent` process, select one provider and one model,
and understand why the four requested subscription OAuth providers remain
blocked.

## Operator workflow

Create OpenCode API keys only on the provider's official site. Start `agent` in
the exact workspace directory. The terminal UI opens immediately and does not
ask for credentials before it owns the screen.

Run `/providers`. The transparent selection list always contains OpenCode Go
and OpenCode Zen. Up and Down move without wrapping. Enter on an unconfigured
provider opens one concealed credential editor inside the TUI; paste the exact
provider key and press Enter. Its one-line transparent context says `Connect`
plus the provider name and `process only`; the composer says `Enter API key ·
Ctrl+C cancels`. No key, mask character, length, or validation detail is
projected. Ctrl+C cancels credential entry and clears the draft. Enter on a configured provider
selects it. Configuration alone does not select a provider, and selection does
not create a usable model.

Run `/models` after selecting a configured provider. `agent` performs one
public unauthenticated model-catalog request, intersects the returned IDs with
the provider adapter's owned Chat Completions allowlist, and shows only that
intersection. Up and Down move without wrapping; Enter selects and constructs
the exact model. The row also states `Go plan`, `Zen balance`, or `free` from
the maintained registry. Treat that label as routing guidance, not a billing or
retention guarantee. A normal prompt is accepted only after provider and model
selection are both complete.

All keys, catalog results, provider selection, and model selection live only in
the current `agent` process. `/exit` releases them. Controlled automation may
preload either exact documented environment variable before starting. A
preloaded key marks only that provider configured; it never auto-selects a
provider or model and never changes the interactive selection contract.

## Guarantees and limits

Keys are accepted only through the zero-projection TUI credential editor or the
exact `AGENT_OPENCODE_GO_API_KEY` and `AGENT_OPENCODE_ZEN_API_KEY` environment
variables. They are never accepted as command-line arguments, written by
`agent`, copied between provider slots, or sent with a model-catalog request.

The fixed public catalog endpoints are
`https://opencode.ai/zen/go/v1/models` and
`https://opencode.ai/zen/v1/models`. Model discovery accepts one bounded strict
OpenAI-style JSON list and fails closed on unknown shape, duplicate or hostile
IDs, invalid UTF-8, status, content type, timeout, or size. A remote ID alone
cannot become executable authority: it must also exist in the matching owned
allowlist registered in `tools/provider-policy.json`.

Selected Go model requests go only to
`https://opencode.ai/zen/go/v1/chat/completions`; selected Zen model requests go
only to `https://opencode.ai/zen/v1/chat/completions`. There is no arbitrary
endpoint or model alias, automatic router, default selection, fallback
provider, shared credential slot, SDK, OpenCode executable, credential-file
reader, redirect, cookie, or telemetry path.

When ready, each turn sends the lean system instruction, bounded conversation,
current owned tool schemas, user input, and required checkpointed tool calls
and results to the selected provider and model. The API key is sent only in that
adapter's fixed Chat Completions request authorization header. The OpenCode Go
page currently states zero-day retention and no training for Kimi K2.7 Code.
OpenCode documents Zen models as hosted in the United States and temporary free
models as eligible for data collection used to improve the model. Do not submit
secrets, personal data, or confidential content to a free model. Provider terms
can change and remain outside `agent`'s guarantees.

Both adapters request at most one tool call per model response. After a result
is checkpointed, the next bounded request asks the same selected model to
reassess the unfinished goal. The decoder still accepts one complete bounded
batch if a compatible service returns one, but handlers remain sequential and
completed effects are never retried implicitly.

ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code credential login, and Grok
subscription OAuth remain blocked. Kimi Code Team confirmed on 2026-08-11 that
it does not currently offer a public OAuth flow for third-party clients; the
other three submitted inquiries remain pending. Neither state authorizes
product code.

## Failure behavior

Without one configured provider, selected provider, and selected model, normal
text is discarded after one generic notice and never enters transcript or
conversation state. Invalid credentials remain content-free failures and leave
the provider unconfigured. A catalog failure clears prior catalog authority, so
a stale list cannot authorize a later model selection.

DNS, TLS, connection, timeout, HTTP status, content type, UTF-8, JSON, SSE,
stream-shape, finish-reason, tool-call, and size failures terminate only the
affected operation or active turn through bounded errors. Underlying causes,
response bodies, keys, prompts, and model content are never printed as
diagnostics. An admitted provider failure may refine `model/open` or
`model/read` with one shared content-free family: `cancelled`, `connectivity`,
`lifecycle`, `limit`, `protocol`, `rejected`, `request`, or `timeout`. An
uncheckpointed open failure also states that no usable response stream opened
and no tool ran. These families never reveal provider identity, HTTP status,
response text, or provider-specific reason names. Cancellation closes the active stream. Neither catalog nor model
transport retries or switches provider automatically. Canonical verification
uses injected deterministic transports and never consumes an account or makes
a live request.

## Maintenance and removal

Recheck the corresponding official OpenCode pages before changing an origin,
catalog path, model allowlist, cost class, privacy statement, limit, or wire
behavior. Update decisions 0017, 0067, and 0068 as applicable, the provider
registry and scanner allowlists, adapter and CLI contract tests,
privacy/security documents, ownership evidence, and this chapter together.
Never broaden an origin or place a second backend behind either registered
provider identity.

To remove one integration, remove its CLI composition, fixed HTTPS transports,
credential slot, model definitions, provider workspace and dependency edges,
policy admission, source allowlists, governing decision references, and
documentation. Preserve the other provider in `/providers`. Removing both
leaves the immediate provider-unconfigured TUI path. Keep the four blocked OAuth
records unchanged and prove the remaining graph offline.

## Evidence

- Eligibility and official references: `docs/PROVIDERS.md`
- Go provider decision: `docs/decisions/0017-owned-opencode-go-provider.md`
- Provider selection and Zen decision: `docs/decisions/0067-owned-opencode-provider-selection.md`
- Ephemeral provider and model selection: `docs/decisions/0068-owned-ephemeral-provider-and-model-selection.md`
- Convergent tool-turn decision: `docs/decisions/0061-owned-convergent-tool-turns.md`
- Provider authentication boundary: `docs/decisions/0003-owned-provider-authentication.md`
- Registration-request decision: `docs/decisions/0011-verified-provider-registration-requests.md`
- Go provider adapter: `packages/agent-provider-opencode-go/src/index.ts`
- Go model allowlist: `packages/agent-provider-opencode-go/src/models.ts`
- Zen provider adapter: `packages/agent-provider-opencode-zen/src/index.ts`
- Zen model allowlist: `packages/agent-provider-opencode-zen/src/models.ts`
- Go Chat Completions boundary: `packages/agent-cli/src/node-opencode-go-transport.ts`
- Zen Chat Completions boundary: `packages/agent-cli/src/node-opencode-zen-transport.ts`
- Public catalog boundary: `packages/agent-cli/src/node-opencode-model-catalog.ts`
- Strict catalog decoder: `packages/agent-cli/src/provider-model-catalog.ts`
- Provider identities: `packages/agent-cli/src/provider-identity.ts`
- Session selector: `packages/agent-cli/src/provider-session.ts`
- Provider presentation: `packages/agent-cli/src/providers-view.ts`
- Model presentation: `packages/agent-cli/src/models-view.ts`
- Concealed credential presentation: `packages/agent-cli/src/provider-credential-view.ts`
- Credential validation: `packages/agent-cli/src/provider-configuration.ts`
- Executable startup decision: `docs/decisions/0018-owned-executable-startup.md`
- Composition root: `packages/agent-cli/src/main.ts`
- Machine-readable gate: `tools/provider-policy.json`
- Gate implementation: `tools/lib/provider-policy.mjs`
- Gate regression tests: `tools/test/provider-policy.test.mjs`
- Registration dossier: `docs/OAUTH-REGISTRATION.md`
- Submitted subscription requests: `docs/PROVIDER-APPLICATIONS.md`
