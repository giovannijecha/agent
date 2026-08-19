# Provider eligibility

This reference separates direct API-key access from subscription OAuth client
registration. Status is current as of 2026-08-19.

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
| Tool selection | One call requested by the owned instruction; model-neutral native normalization into bounded ordered batches |

The implementation is independent. It does not install or invoke Ollama, use an
Ollama SDK or CLI, contact a local daemon, read Ollama configuration, discover
origins, follow model aliases, or persist the key. The CLI owns the fixed HTTPS
boundary and bearer header. The provider workspace is Node-free and sees only
bounded response bytes and metadata.

The native adapter accepts only provider-documented representation variance.
A missing, null, or empty `tool_calls` member contributes no call. A non-empty
member must contain bounded function calls with object arguments; documented
optional function type and index fields are validated when present, and absent
indices are inferred from provider order. Settled assistant history is emitted
with the canonical native function type and response-local index. Serialized
argument objects, malformed indices, unknown call types, and partial messages
fail closed. This one normalization contract applies to every catalog model;
there is no model-specific decoder.

The native stream completes after one valid `done: true` record or after a
clean HTTP end that follows at least one fully validated non-empty thinking,
content, or tool-call contribution. A clean empty stream remains a `terminal`
protocol failure. Partial UTF-8 or NDJSON, malformed native records, and an
aborted or errored transport are not promoted to success.
When present and non-null, `done_reason` is validated before any contribution:
only `stop` on the same `done: true` record is admitted. Non-terminal finish
metadata and truncation reasons fail closed for every catalog model.

`/providers` enters or selects the process-local Ollama Cloud credential.
`/models` performs one authenticated fixed-origin catalog request and exposes
only the exact current model identifiers that pass the bounded decoder. Neither
provider nor model has an automatic default. Environment input may preload the
credential but never selects the provider or model.

A catalog row proves only that the exact identifier is currently advertised by
the authenticated API. It does not prove account entitlement, available credit,
quota, or per-request capacity. A non-successful chat response is classified
from its ephemeral HTTP outcome into the existing content-free `request`,
`rejected`, `limit`, `timeout`, `connectivity`, or `protocol` family. Agent does
not retain the status, read the error body, vary the request by model, retry, or
substitute another identifier.

An opened stream that violates the native contract retains the `protocol`
family and adds exactly one content-free phase: `transport`, `framing`,
`envelope`, `message`, `tool-call`, `finish`, or `terminal`. The phase names the first
owned boundary that rejected the response, not a provider cause, and never
contains response text, tool arguments, or model output.

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

ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code, and Grok subscription are not
admitted providers. The [OAuth registration dossier](OAUTH-REGISTRATION.md)
owns their current registration conclusions and required written evidence. The
[provider request ledger](PROVIDER-APPLICATIONS.md) owns inquiry lifecycle
metadata. A submission, silence, or negative response does not grant runtime
authority.

This policy owns the admission consequence: a blocked candidate exposes no
provider workspace, credential path, endpoint, model, or runtime composition. A
candidate can be enabled only through a replacing decision after the OAuth
dossier records complete registration evidence, the decision fixes the exact
identity and wire boundary, and the same change supplies the adapter, threat
model, offline contract tests, revocation path, rollback, and removal procedure.

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
- [Ollama API errors](https://docs.ollama.com/api/errors)
- [Ollama model catalog API](https://docs.ollama.com/api/tags)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama streaming](https://docs.ollama.com/api/streaming)
- [Ollama OpenAPI contract](https://github.com/ollama/ollama/blob/main/docs/openapi.yaml)
