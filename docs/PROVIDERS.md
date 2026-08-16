# Provider eligibility

This reference separates direct API-key access from subscription OAuth client
registration. Status is current as of 2026-08-16.

## Enabled direct providers

OpenCode Go and OpenCode Zen are the two enabled providers. OpenCode issues the
operator direct API keys and publishes the Chat Completions and public model
catalog endpoints used by independent clients. Decisions 0017, 0067, and 0068
admit exactly:

| Field | OpenCode Go | OpenCode Zen |
|---|---|---|
| Authentication | Direct API key supplied by the operator | Direct API key supplied by the operator |
| Credential input | `AGENT_OPENCODE_GO_API_KEY` | `AGENT_OPENCODE_ZEN_API_KEY` |
| Persistence | Process memory only | Process memory only |
| Origin | `https://opencode.ai` | `https://opencode.ai` |
| Chat path | `/zen/go/v1/chat/completions` | `/zen/v1/chat/completions` |
| Public catalog path | `/zen/go/v1/models` | `/zen/v1/models` |
| Admitted models | Remote catalog intersection with the owned Go allowlist | Remote catalog intersection with the owned Zen allowlist |
| Wire mode | Streaming Chat Completions over SSE | Streaming Chat Completions over SSE |
| Tool selection | One call requested per response; bounded batches decoded defensively | One call requested per response; bounded batches decoded defensively |

The implementation is independent. It does not install or invoke OpenCode,
read OpenCode configuration, use an OpenCode SDK, reuse another application's
identity, discover origins, follow model aliases, or persist the key. The CLI
owns the fixed HTTPS boundaries; the provider workspace is Node-free and sees
only bounded response bytes and metadata. Public catalog requests carry no
credential. A returned ID is selectable only if it also appears in the exact
owned model registry. Credentials are independent and selection never copies a
key, changes an endpoint, or falls back after failure. `/providers` configures
or selects a backend and `/models` selects one admitted current model, only
while the application is idle. Neither selection has a default.

The OpenCode Go page currently states that Kimi K2.7 Code has zero-day retention
and is not used for training. OpenCode documents Zen models as hosted in the
United States and identifies `deepseek-v4-flash-free` as a temporary free model
whose collected data may be used to improve the model. These are provider terms,
not guarantees made by `agent`, and may change. Do not submit secrets, personal
data, or confidential content to the free Zen model, and recheck the official
pages before sending sensitive material.

## Blocked subscription OAuth providers

Pi `main` at commit
[`e47b8e37a6211ebd0b2942fa87059d64f81eec02`](https://github.com/earendil-works/pi/commit/e47b8e37a6211ebd0b2942fa87059d64f81eec02)
contains direct subscription OAuth implementations for the four requested
providers. That proves technical feasibility. It does not transfer Pi's or a
vendor client's registration, identity, approval, or entitlement to `agent`.

| Provider | Current official route | `agent` eligibility | Blocking evidence |
|---|---|---|---|
| ChatGPT Plus/Pro | OpenAI documents subscription login for its Codex clients and managed browser or device login through Codex App Server. | Blocked | App Server is a foreign executable; no public process registers `agent` as a direct independent client. |
| Claude Pro/Max | Anthropic documents subscription login for Claude Code and subscription-backed third-party use through the Claude Agent SDK. | Blocked | Claude Code and Agent SDK are foreign runtimes; no direct independent-client authorization or registration is documented for `agent`. |
| Kimi Code | Kimi documents device OAuth for Kimi Code CLI and subscription-backed API keys for third-party development tools. | Blocked for credential-only login | Kimi Code Team confirmed in writing that no public OAuth flow is currently offered for third-party clients. The CLI identity and ACP bridge remain foreign. |
| Grok subscription | xAI documents browser and device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path. | Blocked | Grok Build and ACP are foreign executables; no public process registers `agent` for direct subscription OAuth. |

All four independent-client inquiries are submitted. Kimi Code returned a
written negative answer on 2026-08-11; the other three requests remain pending.
Neither submission nor a negative response grants authorization. A blocked
entry can be enabled only after all of the following are recorded in a
replacing decision:

1. The provider authorizes independent clients to use the subscription.
2. The provider registers `agent` or expressly designates a reusable public
   client identity.
3. Authorization, refresh, revocation, entitlement, and model transport are
   documented by the provider.
4. The adapter identifies itself truthfully as `agent` and needs no Pi or vendor
   identity, prompt, header, cookie, credential file, SDK, CLI, or app server.
5. Offline contract tests cover cancellation, expiry, concurrency, malformed
   responses, secret leakage, rollback, and removal.

Use `docs/OAUTH-REGISTRATION.md` as the provider-neutral dossier and
`docs/PROVIDER-APPLICATIONS.md` as the four submission packets. Personal fields
and confidential correspondence stay outside Git.

## Machine gate

`tools/provider-policy.json` schema version 6 records the four blocked OAuth
providers and the two exact enabled direct providers, fixed chat and catalog
endpoints, complete model allowlists, and maintained cost classes. Canonical verification
rejects unregistered provider workspaces, OAuth identifiers, subscription
endpoints, ambient network capabilities, foreign credential stores, borrowed
product identity, endpoint drift, model or cost drift, and credential-persistence drift.
The reviewed direct literals are admitted only in their exact source files.

Two concrete providers do not authorize a generic provider framework, arbitrary
base URL, unregistered model selector, key store, or additional integration. Each new trust
boundary requires its own decision, policy entry, adapter, tests, documentation,
and independent removal path.

## Research rule

Public documentation can lag deployed behavior. When it does, inspect current
public source only with an explicit reason and at a pinned commit, then record
observable facts and risks in `docs/OWNERSHIP.md`. Never copy, translate, or
adapt source, tests, prompts, registered identifiers, protocol fixtures, user
agents, or product identity. Independently derive the contract before writing
implementation code.

## Account and secret boundary

`agent` never creates provider accounts, purchases plans, or asks for passwords,
one-time codes, recovery codes, cookies, or payment details. Neither OpenCode
key may enter source, tests, logs, errors, documentation values, process
arguments, or command history. Each is read from only its exact environment
variable or the zero-projection TUI credential editor, remains in its own memory
slot, and is released with the process. Environment variables preload
configuration but never select a provider or model. Persistent storage requires
a separate accepted operating-system vault design.

## Primary references

- [OpenCode Go](https://opencode.ai/docs/go/)
- [OpenCode Zen](https://opencode.ai/docs/zen/)
- [OpenAI Chat Completions create contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [OpenAI Codex authentication](https://developers.openai.com/codex/auth/)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)
- [Anthropic authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic subscription use in third-party Agent SDK apps](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Kimi Code overview and third-party authentication](https://www.kimi.com/code/docs/en/)
- [xAI Grok Build overview](https://docs.x.ai/build/overview)
- [xAI Grok Build authentication](https://docs.x.ai/build/enterprise)
