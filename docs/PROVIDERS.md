# Provider eligibility

This reference separates direct API-key access from subscription OAuth client
registration. Status is current as of 2026-08-16.

This document owns provider admission, exact network and wire boundaries, and
provider-specific account and credential constraints. Use the
[operator chapter](manual/05-providers-and-authentication.md) for connection and
recovery steps, [architecture](ARCHITECTURE.md#provider-boundary) for current
composition, and [maintenance](MAINTENANCE.md#ollama-cloud) for update, rollback,
and removal.

## Enabled direct provider

Ollama Cloud is the sole enabled provider. Ollama issues the operator API key
and publishes the native chat and authenticated model-catalog contracts used by
independent clients. Decision 0072 admits exactly:

| Field | Ollama Cloud |
|---|---|
| Authentication | Bearer API key supplied by the operator |
| Credential input | `AGENT_OLLAMA_API_KEY` or the concealed TUI editor |
| Persistence | Process memory only |
| Origin | `https://ollama.com` |
| Chat path | `/api/chat` |
| Authenticated catalog path | `/api/tags` |
| Model authority | Current bounded catalog entries whose exact non-empty `name` equals `model` |
| Cost class | `cloud` |
| Wire mode | Native Ollama `application/json` stream of line-delimited JSON objects |
| Tool selection | One call requested by the owned instruction; bounded ordered native batches decoded defensively |

The implementation is independent. It does not install or invoke Ollama, use an
Ollama SDK or CLI, contact a local daemon, read Ollama configuration, discover
origins, follow model aliases, or persist the key. The CLI owns the fixed HTTPS
boundary and bearer header. The provider workspace is Node-free and sees only
bounded response bytes and metadata.

`/providers` enters or selects the process-local Ollama Cloud credential.
`/models` performs one authenticated fixed-origin catalog request and exposes
only the exact current model identifiers that pass the bounded decoder. Neither
provider nor model has an automatic default. Environment input may preload the
credential but never selects the provider or model.

Catalog discovery sends the API key to Ollama Cloud but sends no conversation,
workspace path, file content, tool schema, or tool result. Chat requests send
the selected conversation and advertised tools to the exact `/api/chat` path.
Provider availability, model availability, pricing, retention, and data use are
Ollama terms rather than `agent` guarantees and may change. Recheck the official
terms before submitting sensitive material.

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

`tools/provider-policy.json` schema version 7 records the four blocked OAuth
providers and the one exact enabled direct provider. It pins the fixed chat and
authenticated catalog endpoints, bearer authentication, dynamic catalog
authority, cloud cost class, native `application/json` streaming transport,
line-delimited object contract, environment variable,
memory-only persistence, and exact provider workspace. Canonical verification
rejects unregistered provider workspaces, OAuth identifiers, subscription
endpoints, ambient network capabilities, foreign credential stores, borrowed
product identity, endpoint drift, model-authority drift, and credential-
persistence drift. Reviewed provider literals are admitted only in their exact
source files.

One concrete provider does not authorize a generic provider framework,
arbitrary base URL, unregistered model selector, key store, local-server mode,
or additional integration. Each new trust boundary requires its own decision,
policy entry, adapter, tests, documentation, and independent removal path.

## Research rule

Public documentation can lag deployed behavior. When it does, inspect current
public source only with an explicit reason and at a pinned commit, then record
observable facts and risks in the [ownership record](OWNERSHIP.md). Never copy,
translate, or adapt source, tests, prompts, registered identifiers, protocol
fixtures, user agents, or product identity. Independently derive the contract
before writing implementation code.

## Account and secret boundary

The [privacy policy](../PRIVACY.md) owns project-wide retention, personal-
content, and removal guarantees. This section retains provider-specific account
and credential constraints.

`agent` never creates provider accounts, purchases plans, or asks for passwords,
one-time codes, recovery codes, cookies, or payment details. The Ollama API key
may never enter source, tests, logs, errors, documentation values, process
arguments, or command history. It is read only from
`AGENT_OLLAMA_API_KEY` or the zero-projection TUI credential editor, remains in
one memory slot, and is released with the process. Persistent storage requires a
separate accepted operating-system vault design.

## Primary references

- [Ollama Cloud](https://docs.ollama.com/cloud)
- [Ollama API authentication](https://docs.ollama.com/api/authentication)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Ollama model catalog API](https://docs.ollama.com/api/tags)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama streaming](https://docs.ollama.com/api/streaming)
- [OpenAI Codex authentication](https://developers.openai.com/codex/auth/)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)
- [Anthropic authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic subscription use in third-party Agent SDK apps](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Kimi Code overview and third-party authentication](https://www.kimi.com/code/docs/en/)
- [xAI Grok Build overview](https://docs.x.ai/build/overview)
- [xAI Grok Build authentication](https://docs.x.ai/build/enterprise)
