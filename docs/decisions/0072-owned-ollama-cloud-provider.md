# 0072: Owned Ollama Cloud provider

- Status: accepted
- Date: 2026-08-16
- Domain: providers
- Supersedes: 0017, 0067, and 0068
- Superseded by: none

## Context

OpenCode Go and OpenCode Zen are no longer maintained integrations for
`agent`. The maintainer cancelled those services, so retaining their origins,
credentials, catalogs, model allowlists, or adapters would preserve authority
that the product no longer needs.

Ollama publishes a direct cloud API for independent API-key clients. Its
native API provides an authenticated model catalog, bounded chat requests,
streaming responses, and function-tool calls without an Ollama executable,
SDK, local daemon, OAuth identity, or compatibility protocol. That contract can
replace both OpenCode adapters while preserving one runtime and one active
model loop.

## Decision

`Ollama Cloud` is the only admitted model provider. Its closed provider identity
is `ollamaCloud`. The CLI owns exactly these HTTPS boundaries:

- `GET https://ollama.com/api/tags` for the authenticated model catalog;
- `POST https://ollama.com/api/chat` for native Ollama chat turns.

Both requests send one process-memory API key as `Authorization: Bearer
<credential>`. The exact optional automation preload is
`AGENT_OLLAMA_API_KEY`. `/providers` remains the sole interactive credential
and provider-selection path. `/models` performs one authenticated catalog read
and selects an exact identifier from that most recent bounded snapshot. No
credential, catalog, provider, or model choice survives process exit.

The catalog decoder accepts only one bounded JSON object containing a bounded
nonempty `models` array. Every row must contain equal `name` and `model`
identifiers. Identifiers use Ollama's bounded lowercase name syntax, including
optional namespace separators and one optional tag. Duplicate or malformed
rows fail closed. The catalog has availability authority only: it cannot change
the origin, paths, authorization scheme, chat protocol, tool schema,
permissions, workspace boundary, or runtime lifecycle.

The model adapter uses the native Ollama Chat request and response contract. A
request contains the selected model, the acknowledged conversation, the exact
registered tools, `stream: true`, and `think: false`. Responses must use
`application/json`, including when `stream: true` produces successive JSON
objects. The adapter incrementally decodes those bounded UTF-8 objects from
complete logical lines, emits assistant content, and converts each native
function call into one bounded runtime tool call in provider order. Because
Ollama does not return a portable call identifier, the adapter assigns a
content-free identifier from the response-local ordinal. Tool results return
as native `role: "tool"` messages with the exact corresponding `tool_name`.
Any malformed line, unexpected role or model, duplicate tool ordinal,
unsupported finish reason, limit breach, transport failure, or incomplete
terminal response fails closed. The request advertises only the same documented
JSON response media type; the line-oriented decoder does not invent a second
wire media type.

The adapter never enables or exposes model reasoning output. It does not use
Ollama's OpenAI-compatible endpoint, local daemon, CLI, SDK, model pull, local
model execution, fallback origin, redirect, retry through another provider, or
ambient network discovery. Tool batches, approvals, effects, checkpoints, and
terminal output retain their existing serialized owned authorities.

The OpenCode Go and Zen packages, Node transports, catalog paths, credentials,
model inventories, policy entries, active documentation, and tests are removed
in the same change. Their decisions remain as superseded design history.

## Security and privacy contract

The API key is validated without normalization, concealed during entry, held
only by the selected provider session and transport, and discarded on
reconfiguration, cleanup, or process exit. It never enters source, fixtures,
frames, transcripts, notices, errors, receipts, documentation examples, or
provider-returned diagnostics.

The Node composition boundary fixes hostname `ollama.com`, TLS port 443, method,
path, headers, request limits, response limits, inactivity timeout, and an
independent wall-clock deadline. Redirects are not followed. Status,
media-type, encoding, protocol, and provider errors remain content-free.

## Verification

Provider tests cover request history, tools, native tool results, content
streaming, ordered tool-call batches, model mismatch, malformed streamed JSON
objects,
unsupported completion, cancellation, cleanup, and every bound. Catalog tests
cover the fixed authenticated request, exact JSON media type, equal model names,
Ollama identifier syntax, duplicates, deadlines, destruction, and inert late
events. Session and CLI tests cover concealed configuration, authenticated
catalog selection, no implicit default, reconfiguration invalidation, and
secret-free projections.

The canonical verifier uses only synthetic credentials and transports. It does
not contact Ollama, read a real key, enumerate a live account, or persist
provider state.

## Update, rollback, and removal

An Ollama API change requires updated official-contract evidence, adapter and
transport tests, provider policy, operator documentation, and one explicit
maintainer-operated live evaluation. A changing catalog needs no source edit
unless its shape or identifier contract changes.

Rollback restores the last verified repository revision; it does not silently
reactivate superseded OpenCode authority. Removing Ollama deletes its package,
transport, catalog client, provider composition, credential input, provider and
model commands, policy entry, tests, and operator documentation together. The
provider remains one removable outer adapter around the unchanged runtime.
