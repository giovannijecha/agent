# 0082: Owned Ollama tool-stream normalization

- Status: accepted
- Date: 2026-08-19
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

Ollama Cloud exposes one native chat protocol across an interchangeable model
catalog, but individual model families can exercise different valid shapes of
that protocol. The existing adapter treated an empty `tool_calls` array as a
malformed call batch, omitted the documented function type and ordinal when it
replayed settled calls, and collapsed every malformed response into one
`protocol` outcome. A conforming response could therefore fail before tool
execution, while the operator could not distinguish transport, framing,
envelope, message, tool-call, or terminal-contract failure.

Model-specific exceptions, alternate endpoints, compatibility routing, retries,
or permissive coercion would hide the boundary violation and fragment one
provider into several private dialects. The integration instead needs one
closed native normalizer that accepts documented representation variance,
produces one canonical internal batch, and rejects everything else before the
runtime observes a partial assistant turn.

## Decision

The Ollama Cloud adapter owns one model-neutral native stream normalizer. A
missing, null, or empty `tool_calls` member contributes no calls. A non-empty
member is one bounded ordered batch: every entry is a `function` call, every
name is a non-empty bounded string, every argument value is an object, and an
optional non-negative safe integer function index must equal the response-local
ordinal. An absent index is inferred from provider order. Mixed indexed and
unindexed entries remain valid when every present index agrees with that same
order. Gaps, duplicates, wrong call types, scalar or serialized arguments,
unknown message shapes, and partial calls fail closed.

Settled assistant history is encoded in one canonical native form containing
`type: "function"`, the response-local function `index`, name, and object
arguments. The decoder accumulates bounded thinking, content, and tool-call
contributions across chunks without allowing an empty member to erase prior
work. It emits a completed assistant message or one complete tool batch only
after either a terminal record validates the selected model and finish contract,
or the owned transport reports a clean HTTP end after at least one fully
validated non-empty thinking, content, or tool-call contribution. A clean end
without such a contribution, an incomplete framed record, and an aborted or
errored transport remain distinct failures. This completion rule is shared by
every catalog model and introduces no retry, replay, or inferred provider state.
Any non-null finish reason is validated before thinking, content, or tool calls
can mutate decoder state. It is admitted only as `stop` on the same record that
declares `done: true`; a non-terminal record cannot carry terminal metadata.
Thinking, content, and the complete tool-call member of one native record are
validated against staged decoder state and committed together. Rejection of any
field leaves all contribution counts, call identities, and completion evidence
unchanged and terminalizes the decoder. Later records and a clean transport end
cannot recover the stream, add contributions, or settle it successfully.

Protocol failures use a closed content-free phase classification:
`transport`, `framing`, `envelope`, `message`, `tool-call`, `finish`, or
`terminal`. `finish` identifies rejected completion metadata; `terminal`
identifies a clean end without a validated contribution.
Provider-specific reasons from an admitted stream map once at the CLI boundary
to `model/read/protocol/<phase>`. An unexpected non-successful HTTP class occurs
before a stream is admitted and maps to unphased `model/open/protocol`.
Existing non-protocol families remain unchanged. Raw status text, headers,
response bodies, model output, tool
arguments, and credentials never enter the code, journal, terminal, logs, or
fixtures. The phases add diagnosis only: they do not authorize retry, fallback,
replay, alternate origins, model aliases, or model-specific behavior.

This decision amends the normalization and failure contracts in decisions
0029, 0052, 0069, 0072, and 0080 without superseding their ownership.

## Bounds and failures

All existing request, stream, string, object-depth, call-count, and batch bounds
remain mandatory. Empty arrays are accepted only as absence of a contribution;
they never complete a turn or clear accumulated calls. Optional type and index
members are validated when present. JSON strings containing encoded argument
objects are not parsed a second time, null content is not coerced to text, and
unknown enum values do not become generic success.

A clean HTTP end can settle only contributions already accepted by the native
decoder. It cannot complete an empty stream, repair partial UTF-8 or NDJSON,
convert a transport interruption into success, or authorize a partially
validated call. It also cannot settle after any record rejection, even when an
earlier record contributed valid content. An explicit valid terminal record
retains its documented meaning even when the runtime later classifies the
settled response as empty.

The normalizer remains Node-free and provider-local. The CLI remains the sole
HTTPS, credential, terminal, journal, and provider-composition boundary. A
failure before a complete checkpoint commits no conversation change and runs
no tool. Cancellation and bounded transport failures retain their existing
families; only native protocol violations receive one exact protocol phase.

## Verification

Provider contract regressions cover missing, null, empty, indexed, unindexed,
and mixed tool-call members; multiple calls; interleaved stream contributions;
canonical history replay; wrong types; malformed indices; gaps; duplicates;
serialized arguments; invalid envelopes and messages; mismatched terminal
records; record-atomic rejection after thinking or a valid call; non-terminal
finish reasons before contributions; irreversible record rejection across
later records and clean end; clean ends after
text and tool calls; empty clean ends; abrupt transport failures; truncation;
and content-free reasons. CLI regressions bind every provider reason to one
immutable public classification, distinguish unphased open-status protocol
failures from phased read failures, and reject unknown or malformed phase
codes.

Documentation-policy tests bind this record, its metadata, provider-domain
membership, current-authority route, and complete record digest. The canonical
Windows and Linux verification gates remain mandatory and perform no live
provider request.

## Update, rollback, and removal

Changing an admitted wire variant, canonical history shape, phase vocabulary,
completion rule, or provider-reason mapping requires this decision, provider implementation,
adapter declarations, focused contract tests, architecture, engineering,
provider policy, operator guidance, privacy boundary, maintenance runbook,
provenance inventory, decision index, documentation policy, and ownership
inventory to change together.

Rollback restores the previous decoder, encoder, reason union, classifier,
tests, and documentation as one reviewed change. Removing the normalizer is
valid only when Ollama Cloud or native tool calling is removed from the product;
remove its phase mappings and regressions in the same order. Never leave a
model-specific branch, secondary parser, compatibility endpoint, implicit
retry, or permissive fallback behind.
