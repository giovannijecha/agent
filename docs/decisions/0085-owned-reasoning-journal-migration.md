# 0085: Owned reasoning journal migration

- Status: accepted
- Date: 2026-08-20
- Domain: architecture
- Supersedes: none
- Superseded by: none

## Context

Decision 0083 requires settled native reasoning to remain distinct from
assistant content across the selected provider path, runtime, transcript, and
durable recovery. Decision 0076 deliberately fixed the existing session
journal at version one and requires a separate accepted migration decision
before any new retained field can be admitted. Adding an optional property to
the version-one record would silently reinterpret already published storage,
weaken exact-shape rejection, and make rollback ambiguous.

The continuation model already supplies the safe migration boundary. Resume
validates one inactive source journal and creates a different session directory
rather than appending to or rewriting the source. The new capability can use
that boundary without introducing an in-place migration, a second writer, or a
new recovery command.

## Decision

Session journals advance to version two when the bounded thinking stream is
implemented. Every newly created session and every continuation created by
`agent resume --latest` writes an exact version-two header, head, and settled
turn schema. Version-two assistant-message and tool-exchange records each carry
one required `reasoning` member whose value is either `null` or one validated,
non-blank string. Assistant content and reasoning remain separate values;
reasoning never substitutes for the non-blank final assistant answer and never
becomes tool input or presentation text for a permission decision.

The core codec owns two closed decoders selected only by the already validated
session-header version:

- version one continues to accept exactly the published version-one message
  and tool-exchange shapes and rejects every additional field, including
  `reasoning`;
- version two requires the new field on every assistant-message and
  tool-exchange record, rejects it on system and user messages, and rejects a
  missing, blank, malformed, or additional value; and
- unknown versions remain unsupported and fail closed before any turn is
  restored.

The CLI writes only version two. Resume may read an exact inactive version-one
or version-two source, rebuild the same bounded immutable tree through its
matching decoder, and create one new version-two continuation. A version-one
seed therefore receives explicit `null` reasoning values only when its already
validated turns are re-encoded into the new continuation. The old directory is
never appended, rewritten, renamed, or deleted as part of migration. The new
header retains the prior session identity through the existing `resumedFrom`
field, and the active node, parent identities, settlement classifications,
presentations, and insertion order remain unchanged.

The version-two head must name version two and must pass the same exact journal
turn-count reconciliation as its header and records. A head version that does
not match the source header is corruption. Truncated-tail recovery, the sole
one-record append/head gap, workspace admission, locks, synchronization,
retention, and serialized publication keep their decision-0076 semantics.

Reasoning is durable only after it belongs to a settled conversation node. A
completed turn retains final assistant reasoning and reasoning attached to each
settled tool exchange. A checkpointed turn retains only reasoning already
committed with completed tool exchanges. Prospective reasoning from a failed or
cancelled uncheckpointed model segment is discarded. Restored reasoning is
projected as a distinct muted transcript segment and is retained on the exact
selected model path for native request continuity; it is never concatenated
into the assistant answer.

## Bounds and failures

Reasoning code units contribute to the existing 1,048,576-code-unit immutable
conversation-tree bound and the 16,777,216-byte journal bound. The runtime also
applies its independent reasoning-delta and per-response reasoning limits before
staging a value. The provider's native decoder remains responsible for its
wire-level reasoning bound and complete-record atomicity. No migration adds a
new filesystem, record-count, tree, message-unit, or recovery allowance.

Malformed reasoning, a schema/header/head mismatch, an unknown version, an
invalid version-one extension, an invalid version-two omission, or a migrated
tree that fails ordinary append validation is a content-free corruption or
limit failure. There is no schema guessing, best-effort field removal, partial
turn migration, implicit retry, provider request, tool replay, transcript
fallback, or in-place repair.

## Verification

Core red/green tests prove exact version-one rejection remains unchanged,
version-two round trips for final and tool-exchange reasoning, role and blank
rejection, immutable copies, tree accounting, and hostile-record containment.
CLI journal tests prove new version-two creation, exact version-matched heads,
version-one-to-version-two continuation, version-two resume, lineage and active
node preservation, truncated-tail and interrupted-head recovery in both
admitted versions, and fail-closed unknown or mixed schemas. Runtime and CLI
integration tests prove that only settled reasoning reaches the journal and
that selected-path resume replays it separately from assistant content.

Privacy, security, architecture, engineering, provider, operator, maintenance,
decision-index, ownership, documentation, manual, and publication registries
change with the implementation. The canonical Windows and Linux verifier
remains the final gate. Tests use owned synthetic strings and make no live
provider request.

## Update, rollback, and removal

Changing the reasoning record shape, schema selector, accepted source versions,
migration direction, settlement timing, active identity, bounds, or recovery
rules requires this decision, decisions 0076 and 0083, codecs, journal owner,
runtime projection, transcript restoration, privacy disclosures, runbooks, and
tests to change together. A later schema requires another accepted migration
decision; version two must not be silently extended.

Rollback first forces new requests to `think: false` and stops new reasoning
events while leaving version-two decoding and continuation available. It then
removes the `/thinking` activation and display path. Version-two journal support
must remain until an accepted replacement decision defines whether and how
already settled reasoning can be removed; rollback must not rewrite or delete
those journals.

Complete removal follows the same order. Only after the product no longer needs
to read version-two sessions may a separately decided journal version remove
the field. Operators may always remove all local session content through the
documented deletion of the exact per-user `agent/sessions` state root.
