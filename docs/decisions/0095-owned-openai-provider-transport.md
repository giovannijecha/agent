# 0095: Owned OpenAI provider transport

- Status: accepted
- Date: 2026-08-21
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

Decision 0090 fixes the complete OpenAI subscription direction and separates
authentication, credential storage, provider transport, and runtime integration
into serial modules. Decisions 0091 and 0092 establish provider-owned public-
client compatibility while preserving `agent` as the caller identity. Decision
0093 implements the exclusive OpenAI credential record, and decision 0094
activates only the bounded device-authentication command. OpenAI is currently
`auth-compatible-inactive`: an operator may register a record, but no product
path can read it for a catalog or model request.

Current official Responses documentation specifies the public input-item,
function-call, reasoning, `store`, streaming, and SSE event families. It does
not publish the subscription catalog projection, account-routing header,
client-version query, or caller-header spellings required by decision 0090. A
pre-inspection ownership row therefore bounded a first-party OpenAI Codex
source inspection to those missing provider-owned wire facts at commit
`93c54bca38996b56d344a2ca65f01627b1953b27`. The completed row records the
facts and exclusions. No foreign implementation, structure, test, fixture,
prompt, default caller value, user agent, model identifier, or product identity
is an input to this implementation.

The public Responses contract also explains that
`reasoning.encrypted_content` enables reuse of provider-private reasoning state
when a client manages a stateless conversation with `store: false`. Agent has
one canonical provider-neutral conversation tree and explicitly forbids a
parallel hidden conversation authority. Adding a durable or process-private
opaque reasoning store here would make history, timeline selection, restart,
cleanup, and provider interchangeability ambiguous. This module therefore does
not request or retain `reasoning.encrypted_content`. It sends the canonical
messages, function calls, and function outputs that Agent owns. If OpenAI later
requires an opaque reasoning item for this flow, the transport fails closed and
a new decision must define its authority before integration.

## Decision

Add an independently authored Node-free provider workspace named
`@agent/provider-openai-subscription` and an exact Node HTTPS adapter owned by
`@agent/cli`. Together they implement one bounded authenticated catalog and one
bounded Responses stream without composing either capability into current
startup, commands, the TUI, or `ProviderSession`.

The OpenAI machine state becomes `transport-compatible-inactive`; its next
blocker is `runtime-integration-required`. Authentication remains active,
provider runtime remains inactive, refresh remains inactive, revocation remains
inactive, and Ollama Cloud remains the sole selectable backend. No current
command, TUI path, startup path, or runtime session constructs the new Node
transport or provider adapter. This module reads no credential record, performs
no current network request, and changes no operator selection behavior.

### Package and authority boundary

The provider workspace depends only on `@agent/core`, `@agent/runtime`, and
`@agent/tools`. It owns request encoding, catalog projection, strict incremental
UTF-8 and SSE decoding, provider event normalization, content-free provider
failures, and fixed protocol bounds. It imports no Node built-in and has no
ambient network authority.

The CLI owns the only `node:https` capability. Its constructor accepts one
already admitted immutable access-token and account-ID snapshot. This module
does not obtain that snapshot; the later integration decision must compose one
decision-0093 exclusive admission, refresh if required, construction, session
use, and release. The transport stores the two strings only for its own process
lifetime and never returns, logs, formats, or includes them in an error.
Construction reads each credential property exactly once, validates those two
local values, and freezes the same values for every later request. An accessor
or proxy failure rejects the configuration without retaining a partial value.
The Node-free adapter admits every injected transport result through one shared
no-throw snapshot transaction used by catalog, open, read, and close. It reads
the `ok` discriminant once, then reads only its matching value or error object
once. An error's kind and cleanup flag are each read once and the same validated
snapshots form the immutable result. Throwing, malformed, or array-shaped
results fail as content-free protocol rather than changing authority across
validation and publication.

No request accepts an origin, host, port, path, method, arbitrary header, proxy,
retry policy, or caller identity from configuration. Node's HTTPS client does
not follow redirects. Every non-success response is closed without reading its
body. There is no retry, replay, fallback, router, discovery, compression,
cookie store, response store, SDK, executable, App Server, WebSocket, hosted
tool, web-search tool, file upload, or browser automation.

### Catalog contract

One catalog operation sends exactly:

- `GET https://chatgpt.com/backend-api/codex/models?client_version=0.1.0`;
- `Accept: application/json`;
- `Authorization: Bearer <admitted access token>`;
- the `ChatGPT-Account-ID` header with the validated account ID;
- `originator: agent`; and
- `User-Agent: agent/0.1.0`.

It sends no body and no conditional cache header. The truthful version is the
current Agent package version and must change in policy, tests, and transport
together. The request has a 30-second wall deadline, a 30-second inactivity
deadline, a 16,384-byte response-header bound, a 65,536-byte chunk bound, and a
1,048,576-byte complete-body bound. Only status 200 and
`application/json` with an optional UTF-8 charset reach the decoder.
The adapter reads each transport-capture body, cleanup flag, content type, and
status property exactly once, validates those local snapshots, and copies only
the same bounded body snapshot into a fresh `Uint8Array` with typed-array `set`;
the source's overridable iterator is never consulted. Catalog list also reads
`CancellationSignal.requested` once inside containment, requires a boolean, and
rejects malformed state before invoking the transport.
The exported decoder reads an untrusted catalog byte length once inside the
same no-throw transaction as its one-megabyte bound and typed-array copy. A
throwing, malformed, empty, or oversized length returns only a content-free
limit result.
The Node catalog transport applies the same bounded typed-array copy to every
HTTPS body chunk before aggregate retention.
Its response callback snapshots status and content type once inside local
containment. Throwing or malformed metadata fails as a content-free protocol
result, destroys request and response, and combines either cleanup failure. An
accepted catalog response retains that snapshot through EOF without rereading
the response object.
A content-type header array is admitted only with exactly one string member.
A non-string singleton is rejected without coercion under the same paired-
cleanup protocol boundary.
Listener registration and initial flow control are one atomic callback-local
admission transaction. Failure rolls back partial registration, destroys both
handles, and settles one content-free protocol result. Later catalog and stream
flow control and listener detachment are individually contained so cleanup
continues after one throw and its combined failure remains explicit.
After every listener registration, the transaction tests whether that newly
registered callback already terminalized the operation synchronously. Catalog
admission stops before any later registration or initial `resume` and preserves
the callback's one settled result. Responses admission never publishes a
terminal stream: it rolls back every listener, destroys the exact request and
response once, and settles one content-free protocol failure before returning.
The request factory and request setup form the preceding atomic admission
barrier. A catalog or Responses callback delivered before that barrier completes
is retained as the sole staged response without metadata access, listener
wiring, or settlement. The barrier completes only after the exact returned
request is retained and its error listener, inactivity timeout, applicable body
write, and `end` complete. A second staged callback, a setup throw, or a
synchronous request error stops later setup and destroys the request and all
staged responses with combined content-free cleanup.
Any response callback delivered after that setup failure or settlement is
destroyed immediately inside the same no-throw cleanup boundary; it cannot
create a new staged owner, alter the settled result, or escape its private
cleanup cause.
A duplicate callback after a Responses stream is published remains a protocol
conflict until transport EOF is delivered through the pending or next `read`.
The response `end` notification records provisional EOF without releasing
callback authority. One bounded promise checkpoint either admits a duplicate
already dispatched after `end` as a protocol failure or atomically delivers EOF
and retires that authority. The conflict destroys the extra response,
propagates its cleanup failure, and terminates the active stream through paired
request-response cleanup instead of allowing the first stream to continue.

The decoder accepts one JSON object containing one `models` array with 1
through 256 entries. Every entry is a bounded object with required `slug`,
`visibility`, and `supported_in_api` members. A slug is 1 through 128 ASCII
letters, digits, dots, underscores, or hyphens, starts with an alphanumeric
character, contains no control character, and is unique. Visibility is exactly
`list`, `hide`, or `none`; `supported_in_api` is exactly boolean. Other entry
members are bounded by the complete body, are never interpreted, and are
discarded after complete decoding. Root members other than `models`, malformed
entries, duplicates, invalid UTF-8, an empty catalog, or a catalog with no
eligible row fail closed.

Only a row with `visibility: "list"` and `supported_in_api: true` is eligible.
The resulting immutable provider-order slug list is availability authority
only. No static model inventory, alias, default, minimum foreign client version,
priority, cost, capability inference, provider selection, or persistence enters
Agent.

### Responses request contract

One model operation sends exactly:

- `POST https://chatgpt.com/backend-api/codex/responses`;
- the same authorization, account, originator, and user-agent headers as the
  catalog;
- `Accept: text/event-stream`; and
- `Content-Type: application/json`.

The provider adapter encodes one immutable candidate conversation and the
current six registered tool descriptors into the public Responses data model.
The root request has exactly `model`, `instructions`, `input`, `tools`,
`tool_choice`, `parallel_tool_calls`, `reasoning`, `store`, `stream`, and
`include`. `tool_choice` is `auto`, `parallel_tool_calls` is false, and the
request uses `store: false` and `stream: true`. `include` is the empty array.
When thinking is off, `reasoning` is null; low, medium, and high map to the same
provider effort and request summary `auto`.
The response decoder admits reasoning items and their summary or content events
only when the captured effort is not off. Any provider reasoning while effort
is off fails closed before reasoning state or text is retained.

User and assistant messages become ordered text input items. A settled tool
exchange becomes its optional assistant preamble, the exact ordered public
function-call items with provider call IDs, and the exact ordered function-call
outputs. Tool output is one JSON string containing only Agent's existing
`status` and `output` projection. Agent's displayed historical reasoning is not
invented as a provider reasoning item. The current response's admitted
reasoning summary is normalized to the existing runtime reasoning stream and
retains decision 0085's normal conversation and journal treatment.

Each tool descriptor becomes one function tool with the existing exact name,
description, independently encoded JSON Schema, and `strict: false`. The schema
encoder preserves current string, integer, boolean, list, literal, union,
closed-object, required-field, and discriminated-object bounds. It adds no
provider tool, alias, hosted capability, namespace, or permissive additional
property.

JSON Schema `minLength` and `maxLength` remain provider-facing character-count
guidance. They are not relabeled as Agent's UTF-16 code-unit, UTF-8 byte, or
structured-projection authorities. Every non-literal string also carries its
exact minimum and maximum code-unit bounds and NUL policy in the closed
`x-agent-constraints` annotation, together with any UTF-8 byte or structured-
projection bounds it owns; NUL rejection is additionally expressed by a
standard pattern when active. A list with aggregate text bounds carries those
exact values in the same annotation. An object with a structured projection
carries the exact ordered field names, each `exact` or `size` mode, and the
maximum projection code units in one nested `projection` member. Because the
function tool remains `strict: false` and the standard schema vocabulary cannot
express all of those units exactly, Agent's existing `ToolSchema` validator
remains the sole argument-admission authority. The annotations preserve the
complete advertised contract for inspection; they do not claim provider
enforcement and never weaken local validation.

Instructions are 1 through 4,096 code units, the model ID obeys the catalog
grammar, and the serialized body is at most 8,388,608 code units. Construction,
conversation projection, schema projection, serialization, or bound failures
are content-free and occur before transport authority.
Model open reads `CancellationSignal.requested` exactly once inside its
containment boundary and requires a boolean snapshot. A throwing or malformed
getter fails content-free before request encoding or transport invocation.

### Responses stream contract

Only status 200 and `text/event-stream` with an optional UTF-8 charset enter the
stream decoder. The Node transport uses a 600-second wall deadline, a 120-second
inactivity deadline, a 16,384-byte header bound, and a 65,536-byte chunk bound.
Cancellation and close destroy the exact request and response idempotently and
combine either cleanup failure in one content-free result. A response callback
that loses the race to cancellation, timeout, or request failure still destroys
its response under a no-throw cleanup boundary; it cannot reopen the settled
operation or escape a private cleanup cause. One read may be pending and a
concurrent second read fails closed.
The first callback claims the sole response before reading status or content
type inside local containment. A callback re-entered by either metadata accessor
is a protocol conflict: it destroys the duplicate response, the claimed
response, and the request before the outer callback can read another property,
wire a listener, or publish a stream. Throwing or malformed metadata likewise
produces a content-free protocol failure with paired request-response cleanup,
and the stream receives only the admitted snapshots rather than reading the
response. The constructed stream candidate becomes the sole cleanup authority
before listener registration can invoke another response callback. It is
published only after all listeners are registered and the response is paused.
A conflict or failure in either step rolls back partial registration and pairs
response destruction with request destruction exactly once. Once published,
every `pause`, `resume`, and listener detach is contained across read, data,
EOF, failure, and close, without skipping any remaining cleanup operation.
A retained `data` listener invoked after EOF, failure, terminal settlement, or
close is inert before flow control, byte copying, pending-read settlement, or
queue retention. It cannot replace EOF or repopulate a released stream.
Each read stages at most one bounded `data` callback produced synchronously by
`resume`. The chunk becomes visible only after `resume` returns successfully;
a throw or intervening terminal callback discards it and preserves the terminal
result. A `data` callback also rechecks terminal authority immediately after its
callback-capable `pause` returns and before it observes or copies the chunk.
Both the Node transport and Node-free Responses adapter snapshot each chunk's
length, require 1 through 65,536 bytes, and copy into a fresh `Uint8Array` with
typed-array `set` before UTF-8 decoding. No source iterator participates in the
copy. The adapter's one validated length controls allocation and copying; its
UTF-8 decoder receives only the owned snapshot and never rereads the injected
transport object's length.
Both boundaries recheck terminal authority immediately after the untrusted
snapshot transaction. The Node transport does so before staging or publishing
the owned chunk; the Node-free stream does so before classifying snapshot
failure, decoding UTF-8, or updating SSE and Responses state. Close, EOF, or
failure raised by an accessor therefore remains authoritative.

The Node-free decoder performs strict incremental UTF-8 and bounded SSE
framing. Boundary discovery inspects only each newly admitted chunk plus the
prior three-code-unit suffix and retains already discovered boundaries; it
never rescans the whole growing partial frame after `needMore`. It admits LF or
CRLF separators, at most one optional `event` field, one or more `data` fields
joined by LF, no `id` or `retry` field, a 1,048,576-code-unit event buffer,
16,384 wire events, 1,048,576 reasoning code units, 1,048,576 argument code
units, and 32 function calls in one batch. An optional SSE event name must equal
the decoded JSON `type`. Empty events, comments, unknown fields, invalid field
order, invalid UTF-8, malformed JSON, and unknown event types fail closed.

The admitted lifecycle is:

1. exactly one `response.created` with an exact empty `output` array starts the
   response; its optional usage is either null or one bounded projection;
2. exactly one `response.in_progress` immediately follows creation, requires an
   exact empty `output` array, and likewise admits only absent, null, or bounded
   usage; every other lifecycle or terminal event before this gate fails closed;
   item, content-part, reasoning-part, and function-argument lifecycle events
   may advance only their declared phase; an added reasoning item requires an
   exact empty summary, absent or exact empty content, and no encrypted content;
   every reasoning or message output index must precede every function-call
   output index regardless of item-addition event order, so post-call visible
   output fails before any delta or call batch can be published;
   a monotonic publication cursor admits visible deltas only for its current
   output index and advances through contiguous completed items; later visible
   output fails rather than being buffered, while function-call completion may
   remain out of order until the sorted terminal batch;
3. non-empty `response.reasoning_summary_text.delta` and
   `response.reasoning_text.delta` values become runtime reasoning deltas before
   answer text starts;
4. non-empty `response.output_text.delta` values become runtime answer deltas;
5. `response.output_item.done` admits only a complete reasoning item, output
   message, or function call; a function call requires a prior
   `response.function_call_arguments.done`, one unique bounded `call_id`, exact
   registered-name grammar, and that done event's identical JSON object argument
   string; an output message requires exactly one completed output-text part
   whose streamed `content_index` is zero and whose text matches that part;
6. `response.completed` requires a completed response object, permits only an
   absent or bounded non-negative integer usage projection rather than null,
   and revalidates its complete
   provider-ordered `output` projection against every accumulated completed
   item before staging exactly one runtime `toolCalls` batch or `done`; and
7. `response.failed`, `response.incomplete`, `error`, transport exhaustion
   before completion, a second terminal event, any frame after
   `response.completed`, or any lifecycle contradiction fails closed without
   exposing the response body or provider message. A staged successful terminal
   event is published only after clean SSE and transport EOF.

Function-argument delta events are validated and bounded. Their done event is a
required lifecycle phase and owns the complete argument string but does not own
the function name: the added item state does. A redundantly repeated done-event
name is optional and must match that item state when present. The complete
`response.output_item.done` item must confirm the exact completed arguments and
is the sole call authority. Provider call IDs remain provider data and pass
through the existing runtime validation, permission, execution, checkpoint,
and provider-order settlement. Usage is validated for protocol integrity but
is not added to the current operator surface by this module. The final response
output is confirmation of the already validated item state, never an
independent or weaker authority.
Function-argument, answer, reasoning-summary, and reasoning-content delta text
uses one shared bounded per-item chunk primitive. The decoder appends each
admitted fragment once and joins one item's fragments exactly once at its
corresponding done event before comparing the provider's complete string; it
never reconstructs a growing string after each delta. Arguments retain their
one-megabyte aggregate budget, answer retention uses the canonical 262,144-code-
unit runtime response bound, and summary plus reasoning content share the
existing one-megabyte provider reasoning budget.
Before retaining each complete done-event argument string, the decoder enforces
both the 32-call batch count and the one-megabyte aggregate completed-argument
budget. Item completion validates the already bounded retained string and does
not defer either admission limit.

### Failure, privacy, and security boundary

HTTP outcomes retain decision 0080's content-free families: request rejection,
authentication or route rejection, limit, timeout, connectivity, and protocol.
Transport open, read, and close remain distinct. Cleanup failure is reported
without replacing the original failure. No error contains a URL with query
data, token, account ID, header, response body, conversation, instruction,
model, tool call, argument, output, usage value, or SSE payload.
Every rejected catalog response destroys both its request and response before
settlement and combines cleanup failures from either handle.
After a nominally successful stream open, the adapter snapshots valid close
authority before inspecting each remaining stream property once. Malformed
metadata or read authority invokes that retained close before protocol failure
is published, including any cleanup failure in the result.
Model-stream close clears queued events and completion, releases every retained
Responses item and text fragment, resets SSE framing and partial UTF-8, and only
then awaits transport cleanup. A read that was already pending checks the closed
state before inspecting or decoding its returned value, so bytes delivered after
close cannot repopulate released state. The closed stream therefore retains no
candidate conversation or partial provider response even while transport close
is pending.

This inactive module transmits nothing in the current product. After later
integration, a catalog request will disclose the access token, account ID,
truthful Agent identity, version, IP and transport metadata to OpenAI; a
Responses request will additionally disclose the selected conversation path,
instructions, tool schemas, tool calls, and tool results. The owned credential
store still does not protect against same-user processes, administrator or root,
malware, backups, snapshots, or privileged offline access. TLS does not make
provider processing private from the provider.

No live provider account or credential is used by canonical verification.
Fixtures use only synthetic domains, identifiers, content, headers, events, and
tokens and assert zero projection into failures and receipts.

## Consequences

Agent now owns a removable, zero-dependency OpenAI catalog and Responses
implementation without claiming that OpenAI is available in the TUI. The
provider workspace and CLI transport can be tested completely through injected
byte transports and HTTPS doubles while remaining unreachable from product
composition.

The explicit omission of encrypted reasoning preserves one conversation
authority and makes a possible future provider incompatibility visible rather
than silently adding opaque state. Runtime integration must prove the exact
current subscription flow with an operator-controlled smoke before enabling
OpenAI.

The new workspace slightly enlarges the maintained build and source-policy
surface. It adds no dependency, no credential reader, and no network call to
startup.

## Verification

Red-green regression must prove:

- decision, provider, ownership, publication, workspace, and Node-authority
  policy reject the unregistered module before accepting it;
- the catalog sends the exact method, origin, path, query, headers, deadlines,
  and no body, and rejects redirect, status, content-type, encoding, size,
  schema, duplicate, and eligibility drift while retaining only once-read
  validated capture fields, containing throwing response-metadata getters with
  paired cleanup, rejecting a non-string singleton content type without
  coercion, ignoring an overridden body iterator, containing a throwing catalog
  byte-length getter, and refusing non-boolean cancellation state before
  transport;
- the request encoder preserves ordered messages, tool calls and outputs,
  provider call IDs, exact tool schemas including owned string and aggregate-
  text annotations, thinking mapping, `store: false`, `stream: true`, and the
  empty include list within fixed bounds, while model open contains throwing or
  malformed cancellation-state access before transport;
- the SSE decoder handles chunk splits, CRLF, optional matching event names,
  reasoning, text, function calls with absent or matching repeated done-event
  names, rejection of a missing argument-done phase, early completed-argument
  call-count and aggregate retention bounds, nullable pre-terminal
  usage, strict terminal usage, completion,
  cancellation, timeout, rejection of visible output indexed after a function
  call in either item-addition order, ordered emission from multiple active
  message items, and one large frame fragmented into single-code-unit chunks
  without whole-buffer rescanning; HTTPS and injected chunks reject the
  65,536-byte bound, ignore overridden source iterators, and consult a changing
  length getter only once before UTF-8 decode;
- HTTPS EOF or failure raised during chunk snapshot prevents staging or
  publication, and model close raised during its snapshot prevents failure
  reclassification, UTF-8 decode, or decoder-state repopulation;
  function-argument fragmentation retains bounded chunks and performs one
  completion join rather than repeated accumulated-string reconstruction;
  answer and both reasoning channels use the same bounded chunk primitive and
  one text-done join under their existing aggregate limits;
  Responses admission contains throwing status and header getters with paired
  cleanup before constructing a stream; catalog and Responses admission roll
  back partial listener wiring and contain initial flow-control throws, while
  admitted stream read, data, EOF, failure, and close contain later flow-control
  and detach throws with paired cleanup;
- a retained Responses `data` callback invoked after EOF or close performs no
  flow control, copying, read settlement, or queue retention, so EOF remains
  authoritative and cleanup cannot be repopulated;
- synchronous Responses data remains staged until `resume` succeeds and is
  discarded when that call throws; EOF or failure raised by `pause` is rechecked
  before chunk observation and remains authoritative;
- synchronous terminal callbacks invoked by response-listener registration stop
  the remaining catalog admission actions, while Responses rejects the
  pre-publication stream and performs its paired rollback exactly once;
- reentrant response callbacks invoked by status or content-type access fail the
  claimed catalog or Responses operation before another metadata read, listener,
  or publication; a Responses stream candidate owns cleanup before listener
  registration can re-enter, and every exact response and request is destroyed
  once;
- an added reasoning item rejects pre-populated or malformed content before any
  later item projection can omit or replace it, and any reasoning item or delta
  is rejected when the captured effort is off;
- stream lifecycle rejects close, concurrent read, malformed framing, unknown
  events, omission or duplication of the required `response.in_progress`,
  contradictory lifecycle, nonempty or malformed pre-terminal output, missing or
  contradictory completed-output projections, a nonzero index for the sole
  message content part, trailing frames before publication, early EOF, and
  post-terminal reads;
- every transport and protocol failure remains content-free; every rejected
  catalog response and failed open close all retained handles; stream close
  destroys both request and response, combines their cleanup failures, and
  contains late-response cleanup throws; valid and rejected synchronous
  callbacks remain staged until complete request setup, and setup throws or
  synchronous request errors destroy both handles without continuing setup;
  callbacks delivered after setup failure are destroyed without becoming staged
  state or changing the settled result; a
  duplicate callback after stream publication, including after response `end`
  but before pending EOF delivery, destroys the extra response, propagates its
  cleanup failure, and terminates the active stream as protocol without changing
  the established settlement timing of non-EOF reads; a
  malformed successful stream is closed through its retained close authority
  before rejection; injected transport results snapshot their discriminant,
  selected payload, error kind, and cleanup flag exactly once through the same
  catalog/open/read/close helper;
- model-stream close releases queued events, staged completion, Responses state,
  bounded text chunks, SSE fragments, and partial UTF-8 before awaiting transport
  cleanup, while a pending read rejects bytes returned after close before decode;
- source policy admits only the new reviewed provider and CLI files and rejects
  another OpenAI origin, identity, credential authority, Node effect, retry,
  redirect, SDK, foreign runtime, or provider composition; and
- the canonical Windows and Linux gates pass offline with no real account,
  credential, catalog, or Responses request.

The later integration module must separately prove exclusive decision-0093
snapshot ownership, proactive refresh, account continuity, `/models` selection,
runtime construction and release, Windows and Linux behavior, and one
operator-controlled live catalog and Responses smoke. This decision is not that
activation evidence.

## Update, rollback, and removal

Recheck the official Responses documentation, the exact public-client
authority, and the ownership log before changing an origin, path, query,
header, catalog projection, request field, event family, limit, timeout, or
identity. Record any missing public fact before bounded source inspection.
Update this decision, provider policy, source authority, tests, privacy,
security, maintenance, and removal guidance in the same change.

Rollback removes the inactive package and CLI transport together, restores the
OpenAI state to `auth-compatible-inactive` with blocker
`transport-implementation-required`, and leaves device authentication and the
durable record intact. No credential migration is required because this module
never reads or rewrites the record.

Removal first prevents any later composition from constructing the transport,
waits for active sessions after a future activation, removes the CLI HTTPS
adapter, removes `@agent/provider-openai-subscription`, unregisters its package,
policy, declarations, documentation, and tests, and reruns the complete gate.
Use decision 0094's local remove action if the operator also wants the OpenAI
record retired. Never recursively delete `~/.agent/credentials`, never remove
the Ollama record or lock, and never claim local removal revokes the provider
grant.
