# 0083: Owned bounded thinking stream

- Status: accepted
- Date: 2026-08-19
- Domain: architecture
- Supersedes: none
- Superseded by: none

## Context

The native provider contract can carry reasoning separately from assistant
content. The current adapter validates and bounds that field as part of an
atomic streamed record, but requests reasoning-disabled responses and does not
expose reasoning to core, runtime, the journal, or the TUI. Turning the field
into ordinary assistant text would make private working data executable,
confuse the public transcript with provisional output, and break the settled
conversation and journal contracts.

The current runtime remains fixed at `think: false`. There is no `/thinking`
command, reasoning event, reasoning transcript block, or persisted reasoning
field in the current product.

## Decision

Reserve one provider-neutral bounded thinking stream for a future complete
implementation. The implementation must satisfy all of these conditions in one
change:

- reasoning remains a distinct optional field from assistant content and tool
  calls from provider decode through core, runtime, persistence, and rendering;
- only a provider's validated native reasoning field is admissible; assistant
  text, XML-like text, tags, and call-shaped content are never reinterpreted as
  reasoning or executable tools;
- reasoning deltas are staged, bounded, ordered, and committed only with the
  complete validated provider record; a rejected record exposes no partial
  reasoning;
- settled reasoning required by the selected provider is retained on the exact
  selected model path for subsequent request continuity, while its presentation
  remains separate from the assistant answer;
- a future session-only `/thinking` interaction-dock selector owns the explicit
  `Off` or `Live` mode, defaults to `Off`, and never persists provider or model
  selection;
- the existing transcript model and renderer own any future reasoning segment;
  no private rendering path, parallel view model, or terminal-only state is
  allowed; and
- reasoning never becomes a tool input, permission decision, retry trigger,
  fallback signal, log value, receipt, diagnostic body, or evaluation fixture.

A separate accepted journal-schema migration decision is required before implementation.
That migration must preserve version-one journal rejection, bounded recovery,
settled-node atomicity, and the active conversation identity rather than
silently extending decision 0076.

## Bounds and failures

The provider adapter remains the sole owner of native reasoning decode. A future
implementation must reject malformed, oversized, duplicated, late, or
post-terminal reasoning before any contribution becomes visible. Clean-end
settlement remains valid only after the entire last record has passed reasoning,
content, tool-call, finish-reason, and stream-phase validation.

Thinking never authorizes implicit retry, replay, compatibility parsing,
model-specific routing, or a second model loop. Provider failures retain their
existing phase and failure family. The mode and all provisional reasoning are
process-only until one settled node is durably admitted by the future journal
schema.

## Verification

While this record is contract-only, verification proves that the current
request remains `think: false`, no public reasoning event exists, and the
operator and privacy manuals make no activation claim. The future implementation
gate must add red/green contract evidence for native request encoding, bounded
stream assembly, record atomicity, selected-path history, runtime sequencing,
journal recovery, TUI focus and rendering, privacy, rollback, and removal.

The canonical verifier binds this record, its domain membership, the living
authority markers, and the ownership inventory so implementation cannot begin
through an isolated provider or renderer edit.

## Update, rollback, and removal

Update this record before changing the reserved mode, data ownership, history,
or persistence contract. Rollback of a future implementation must disable the
request field first, stop emitting reasoning events, and retain any already
settled journal data until the corresponding schema decision defines safe
removal. To abandon the capability before implementation, remove this record,
its living-document markers, ownership row, registry entries, and regressions
together; the runtime remains unchanged.
