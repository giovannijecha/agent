# Provider eligibility

This reference separates direct API-key access from subscription OAuth client
registration. Status is current as of 2026-08-21.

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
| Credential input | Zero-echo `agent auth`, or temporary `AGENT_OLLAMA_API_KEY` when no record exists |
| Persistence | Exact provider-specific owned plaintext record, with a process-memory startup snapshot |
| Origin | `https://ollama.com` |
| Chat path | `/api/chat` |
| Authenticated catalog path | `/api/tags` |
| Model authority | Current bounded catalog entries whose exact non-empty `name` equals `model` |
| Cost class | `cloud` |
| Wire mode | Native Ollama `application/json` stream of line-delimited JSON objects |
| Tool selection | One call requested by the owned instruction; model-neutral native normalization into bounded ordered batches |

The implementation is independent. It does not install or invoke Ollama, use an
Ollama SDK or CLI, contact a local daemon, read Ollama configuration, discover
origins, follow model aliases, or read foreign credential stores. The CLI owns the fixed HTTPS
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
After any native record is rejected, the decoder remains rejected. It does not
accept later records or promote a later clean HTTP end to success, even when an
earlier record made a valid contribution.
When present and non-null, `done_reason` is validated before any contribution:
only `stop` on the same `done: true` record is admitted. Non-terminal finish
metadata and truncation reasons fail closed for every catalog model.

`agent auth` is the sole interactive credential lifecycle and runs outside the
alternate-screen TUI. `/models` first stages one authenticated provider, then
performs one authenticated fixed-origin catalog request and exposes only the
exact current model identifiers that pass the bounded decoder. Accepting one
model atomically selects both provider and model. Neither has an automatic
default. Environment input may provide a temporary credential only when the
durable record is absent and never selects the provider or model.

A catalog row proves only that the exact identifier is currently advertised by
the authenticated API. It does not prove account entitlement, available credit,
quota, per-request capacity, ordinary text completion, or native tool-call
interoperability. Those are independent observations. A selected model may
complete ordinary assistant text while contributing no provider-native
`message.tool_calls` when tools are advertised. Tagged, serialized, or
otherwise call-shaped assistant content remains assistant content and is never
executed. Neither outcome removes or rewrites the authenticated catalog row.

A non-successful chat response is classified from its ephemeral HTTP outcome
into the existing content-free `request`, `rejected`, `limit`, `timeout`,
`connectivity`, or `protocol` family. Agent does not retain the status, read the
error body, vary the request by model, retry, or substitute another identifier.
Every pre-stream protocol rejection, including an unexpected non-success
status, invalid content type, or malformed transport opening, maps to the
unphased `model/open/protocol` outcome because the adapter did not admit a
stream.

An opened stream that violates the native contract retains the `protocol`
family and adds exactly one content-free phase: `transport`, `framing`,
`envelope`, `message`, `tool-call`, `finish`, or `terminal`. The phase names the first
owned boundary that rejected the response, not a provider cause, and never
contains response text, tool arguments, or model output.
The first admitted read failure terminalizes the stream before it is returned.
Later reads cannot consume another response record or clean end and expose only
the closed terminal failure.

Catalog discovery sends the API key to Ollama Cloud but sends no conversation,
workspace path, file content, tool schema, or tool result. Chat requests send
the selected conversation and advertised tools to the exact `/api/chat` path.
Provider availability, model availability, pricing, retention, and data use are
Ollama terms rather than `agent` guarantees and may change. Recheck the official
terms before submitting sensitive material.

### Native thinking boundary

The admitted native contract carries reasoning separately from assistant
content. `/thinking` explicitly sets session-only Effort to `Off`, `Low`,
`Medium`, or `High` and Stream display to `Off` or `On`. The adapter maps effort
only to native `think: false`, `"low"`, `"medium"`, or `"high"`, validates the
complete record, and emits native reasoning through the separate
provider-neutral event. Effort is fixed across a turn and its tool
continuations. The editor requires a configured provider and selected model;
both values then remain unchanged through later model selections in that
process. A model that rejects the retained effort fails explicitly without a
retry, fallback, or settings mutation.

Native reasoning is never reconstructed from assistant text, tags, or
call-shaped content, and it cannot activate through a catalog entry or
model-specific compatibility rule. Decisions 0086 and 0085 own its independent
bounds, settled selected-path continuity, exact journal migration, privacy,
rollback, and removal.

## Inactive subscription OAuth providers

A maintainer-requested Pi and OpenCode source inspection is recorded as
discarded because it occurred before the repository recorded a concrete stale-
documentation prerequisite. It supplies no feasibility, protocol, identity,
policy, or implementation input to `agent`. Decision 0090 is derived only from
the official OpenAI authorities in its provenance record.

Decision 0091 records a later, separate clean-room inspection performed only
after the ownership log named the exact public-documentation gaps and bounded
the allowed material. It admits provider-owned non-secret public-client
compatibility as a policy category for ChatGPT, Kimi, and xAI while requiring
every controllable caller-identity field to remain truthfully `agent`. It does
not revive the discarded inspection or authorize foreign code, credentials,
runtime, caller identity, or product structure.
The machine state is an `accepted-runtime-inactive` compatibility policy.

ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code, and Grok subscription are not
admitted providers. The [OAuth registration dossier](OAUTH-REGISTRATION.md)
owns their current registration conclusions and required written evidence. The
[provider request ledger](PROVIDER-APPLICATIONS.md) owns inquiry lifecycle
metadata. A submission, silence, or negative response does not grant runtime
authority.

Decision 0090 records the OpenAI contract so its public device,
token, catalog, Responses, future record, admission, and removal boundaries are
reviewable before implementation. Decision 0091 permits provider-owned public-
client compatibility, and decision 0092 records OpenAI's exact non-secret
public client, device request, callback, pending statuses, and truthful caller
rule. Decision 0093 implements the exact OpenAI record and private native
lifecycle. Decision 0094 activates its fixed-origin device login, serial poll,
PKCE exchange, account and expiry validation, sign-in-again, and local removal
through `agent auth`. Device success requires the three registered fields and
may contain only bounded optional `expires_at` metadata, which is discarded;
every other member fails closed.
The ceremony deadline and terminal cancellation bound challenge presentation;
a stalled or late presenter cannot retain the exclusive mutation.
Poll success requires the authorization code and verifier and may contain one
interpreted optional challenge, which must match the verifier when present.
After bounded decoding and duplicate-name rejection, every other member is
discarded without timing, authorization, projection, or persistence effect.
Decision 0095 installs the independently authored Node-free catalog and
Responses adapter and the exact CLI HTTPS transport. OpenAI transport is
`transport-compatible-inactive`: auth can create or replace the owned record
and the code can be verified through injected doubles, but there is still no
runtime snapshot, refresh, revocation, provider/model row, transport
construction, or conversation-runtime composition.
The inactive CLI transport reads the access-token and account-ID properties
exactly once during construction, validates those snapshots, and retains those
same frozen values; accessor or proxy failure rejects the configuration.
The Node-free adapter admits every injected transport result through one shared
no-throw snapshot boundary. It reads the `ok` discriminant once and then the
matching value or error object once; an error's kind and cleanup flag are each
read once, validated, and retained from those same snapshots. Catalog, open,
read, and close therefore cannot validate one accessor-backed result and later
publish another; malformed, throwing, or array-shaped results fail as protocol.
Its strict decoder requires exact empty output arrays on pre-terminal response
snapshots and exactly one `response.in_progress` immediately after
`response.created`; every other lifecycle or terminal event before that gate
fails closed. It accepts null usage only before completion and keeps each added
function-call item as the name authority even when the argument-done event
omits its redundant name. The argument-done event itself is mandatory and its
complete argument string must pass the batch call-count and aggregate argument
bounds before retention, then match the completed function-call item. Argument
deltas remain as bounded per-item chunks under one aggregate code-unit budget;
they are joined exactly once at the done event and are never re-copied as one
growing string for each delta. Answer, reasoning-summary, and reasoning-content
deltas use the same shared chunk primitive: answer retention is bounded by the
canonical runtime response limit, reasoning retains its combined provider
budget, and each item is joined only at its text-done event. An added
reasoning item admits only absent or exact
empty initial content, so later streamed projections cannot suppress or replace
pre-populated state. Reasoning items, summaries, and content fail closed when
the captured thinking effort is off. A completed output message binds its sole
output-text part to streamed content index zero before the item or terminal
response can be accepted. Its tool projection preserves owned code-
unit, UTF-8,
projection, NUL, and aggregate-text constraints as explicit annotations: every
non-literal string exposes its exact minimum and maximum code-unit bounds even
when it owns no auxiliary string constraint, and every projected object exposes
the exact ordered field names, field modes, and aggregate maximum. The provider-
neutral validator remains the sole argument-admission authority.
It treats `response.completed` as provisional: the complete provider-ordered
output must match the accumulated completed items, and `done` or `toolCalls` is
published only after clean SSE and transport EOF with no trailing frame.
Closing a Responses stream destroys its exact request and response once and
combines either cleanup failure. Catalog and Responses callbacks that arrive
after an earlier settlement destroy their response inside the content-free
cleanup boundary and cannot escape a private cause or reopen the operation.
Each callback that arrives before its request factory returns or while request
setup is still running is held as the sole bounded staged response. Agent does
not inspect its metadata, wire response listeners, or settle the operation until
the exact returned request is retained and its error listener, inactivity
timeout, body write when applicable, and `end` have all completed. A second
staged response, a setup throw, or a synchronous request error fails closed,
stops the remaining setup, and destroys the retained request and every staged
response while combining cleanup failure.
After a Responses stream is published, a duplicate response callback remains a
protocol conflict: Agent destroys the extra response, carries any cleanup
failure into the stream result, and terminates the active stream with paired
request-response cleanup. It cannot leave the first stream authoritative.
Every rejected catalog response also destroys both its request and response and
combines cleanup failure from either handle before publishing its empty capture.
Each catalog and Responses callback snapshots status and content type once
inside callback-local containment. Throwing or malformed metadata produces a
content-free protocol failure, destroys both request and response, and combines
either cleanup failure; admitted metadata is never reread at catalog EOF or
inside the Responses stream constructor.
A content-type header array is valid only with exactly one string member; a
non-string member is never coerced and rejects the complete response admission.
Listener registration and initial flow control form the same atomic response-
admission transaction. Any throw rolls back every partially registered
listener, destroys both handles, and settles one content-free protocol result.
After admission, read, data, EOF, failure, and close contain every flow-control
and listener-detachment throw; teardown still attempts every detach and both
idempotent destructions and combines cleanup failure without exposing a cause.
The catalog adapter reads every returned capture property once, validates those
local snapshots, and copies only the same bounded body snapshot; an accessor or
proxy cannot replace validated metadata or bytes through a later read. The copy
uses a fresh typed-array destination without consulting the source iterator.
Catalog cancellation likewise snapshots `requested` once, requires a boolean,
and rejects malformed state before transport.
After a transport reports a successful stream open, the adapter retains valid
close authority first and closes through it if any other stream property is
malformed; the protocol failure records whether that cleanup failed.
Before opening that transport, the model snapshots the cancellation `requested`
property once inside containment, requires a boolean, and rejects a throwing or
malformed getter without encoding or sending a request.
Catalog and Responses HTTPS chunks, and injected Responses chunks, must contain
1 through 65,536 bytes. Each is copied into a fresh typed array with `set`
before retention or UTF-8 decoding; a source iterator is never consulted.
For an injected Responses chunk, the one admitted length controls both the
allocation and exact copy; the UTF-8 decoder receives only that owned snapshot
and never rereads the transport object's length.
The exported catalog decoder likewise snapshots its untrusted byte length once
inside the same no-throw boundary as its bounded copy. A throwing, malformed,
empty, or oversized length returns only the content-free limit result.
SSE boundary discovery examines each new chunk with only the retained three-
code-unit suffix; repeated `needMore` outcomes never rescan the whole partial
frame.
The ordered output projection admits reasoning and message items only before
the function-call phase. A reasoning or message `output_index` after any
function call fails closed at item addition, independent of event arrival
order, before a text delta or tool-call batch can be published.
Within the visible phase, a monotonic output cursor admits deltas only for its
current `output_index` and advances through contiguous completed items. A later
message or reasoning delta fails closed instead of being buffered or emitted
early; function-call completion may remain out of order until the sorted
terminal batch.

OpenAI remains blocked by `runtime-integration-required`. Its refresh lifecycle,
exclusive runtime composition, `/models` integration, and live smoke must
arrive as the remaining serial module required by decisions 0090 through 0095,
with its own threat model, offline contract tests, rollback, and removal path.
Claude remains subject to the original independent-registration gate.

## Machine gate

`tools/provider-policy.json` schema version 15 records the four runtime-inactive OAuth
providers, the one exact enabled direct provider, the accepted-runtime-inactive
compatibility category, and one exact `transport-compatible-inactive` OpenAI
subscription contract. It pins the fixed chat and
authenticated catalog endpoints, bearer authentication, dynamic catalog
authority, cloud cost class, native `application/json` streaming transport,
line-delimited object contract, environment variable, exact owned record,
shared/exclusive admission, external auth command, exact provider workspace,
and the OpenAI decisions, routes, implemented record, authentication and
inactive transport,
exclusive admission, exact provider-owned public client, one-field device
request, closed device-response schema, empty requested-scope set, callback,
bounded projection-only poll-response schema and settlement, public-client token authentication,
claims, limits, truthful `agent` caller
identity, inactive provider runtime, and compatibility disclosure. Canonical verification
rejects unregistered provider workspaces, OAuth identifiers, subscription
endpoints, ambient network capabilities, foreign credential stores, borrowed
product identity, endpoint drift, model-authority drift, and credential-
persistence drift. OpenAI literals and Node network authority are admitted only
in the exact reviewed broker, protocol, command, device adapter, and test files;
they remain forbidden in every other product source. Provider workspaces,
foreign storage, foreign caller identity, ambient network authority, catalog,
and Responses runtime remain forbidden. Reviewed Ollama literals remain
confined to their exact files.

One concrete provider does not authorize a generic provider framework,
arbitrary base URL, unregistered model selector, generic key store, local-server mode,
or additional integration. Each new trust boundary requires its own decision,
policy entry, adapter, tests, documentation, and independent removal path.

## Research rule

Public documentation can lag deployed behavior or omit an exact
interoperability fact. Before inspecting current public source, record that
demonstrated gap, the intended bounded material, pinned commit, and allowed
facts in the [ownership record](OWNERSHIP.md). Never copy, translate, or adapt
source, tests, prompts, protocol fixtures, user agents, foreign caller identity,
or product structure. Decision 0091 permits only a provider-owned non-secret
public-client constant after first-party confirmation; decision 0092 owns the
exact OpenAI constant and its clean-room evidence. Independently derive every
contract and implementation.

## Account and secret boundary

The [privacy policy](../PRIVACY.md) owns project-wide retention, personal-
content, and removal guarantees. This section retains provider-specific account
and credential constraints.

`agent` never creates provider accounts, purchases plans, or asks for passwords,
recovery codes, cookies, or payment details. The OpenAI device ceremony displays
one provider-issued code but never asks the operator to type that code into
Agent. The Ollama API key
may never enter source, tests, logs, errors, documentation values, process
arguments, command history, terminal output, transcript, journal, receipt, or
diagnostic. Zero-echo `agent auth` writes only the exact provider-specific record
under `~/.agent/credentials`; startup holds a shared native admission and keeps
one process-memory snapshot until provider cleanup. Auth mutation holds the
exclusive admission and never waits, polls, steals, or retries. A durable record
and `AGENT_OLLAMA_API_KEY` together fail as dual authority before payload read;
neither source has precedence and neither is imported. Decision 0088 remains
historical and decision 0089 owns the active external-authentication boundary.
Decisions 0090 through 0094 specify and implement the provider-specific OpenAI
OAuth record, provider-owned public-client identity, and device ceremony.
`agent auth` may send the fixed client identity, device identity, displayed
code, authorization code, PKCE verifier, and token exchange directly to the
fixed OpenAI auth origin, then persist only the access token, refresh token,
account ID, and expiry. It stores no ID token. There is no OpenAI environment
authority, runtime credential read, refresh, revocation, catalog, or task-data
request in this module. Local removal does not revoke the provider grant.

## Primary references

- [Ollama Cloud](https://docs.ollama.com/cloud)
- [Ollama API authentication](https://docs.ollama.com/api/authentication)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Ollama API errors](https://docs.ollama.com/api/errors)
- [Ollama model catalog API](https://docs.ollama.com/api/tags)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama streaming](https://docs.ollama.com/api/streaming)
- [Ollama OpenAPI contract](https://github.com/ollama/ollama/blob/main/docs/openapi.yaml)
- [OpenAI subscription OAuth contract decision](decisions/0090-owned-openai-subscription-oauth-contract.md)
- [Provider public-client compatibility decision](decisions/0091-owned-provider-public-client-compatibility.md)
- [OpenAI compatible public-client decision](decisions/0092-owned-openai-compatible-public-client.md)
