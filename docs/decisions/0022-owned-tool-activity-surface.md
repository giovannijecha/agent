# 0022: Owned tool activity surface

- Status: accepted
- Date: 2026-08-10

## Context

The CLI currently renders one transient tool status line and one separate
approval-preview text block. The tool disappears as soon as execution finishes,
state and preview follow parallel presentation paths, and adding another tool
must rely on convention to look identical. Decision 0021 provides the canonical
structured-row carrier, but it intentionally does not define multi-component
document flow or product activity semantics.

A useful coding interface must make one tool request, approval boundary,
execution, and terminal result understandable without exposing call identifiers,
raw arguments, tool output, provider data, or private failure causes. The same
presentation must serve every registered tool and remain independent from the
tool engine and runtime lifecycle.

## Decision

Add one generic `ComponentStack` to `@agent/tui`. It concatenates a bounded
ordered collection of ordinary components and exposes head- or tail-anchored
windows through the existing `Component`, `Fragment`, `Viewport`, and
structured-row contracts. It owns no product words, tool states, terminal
controls, input events, or mutable scroll state.

One stack accepts at most 512 components. Each child is measured and rendered
through the shared hostile-component boundary. Measurement reports at most the
existing 4,096-row frame limit; rendering computes the selected window from
bounded child measurements and invokes only children intersecting that window.
Short content pads on the side opposite its anchor. A visible child caret is
translated exactly once, multiple visible carets fail, and invisible carets are
dropped. Construction, measurement, rendering, geometry, and callback failures
remain content-free typed results.

Add one CLI-owned `ToolActivityLog`. It accepts only the already validated
runtime lifecycle and models every tool through the same closed states:
`approval`, `queued`, `running`, `cancelling`, `succeeded`, `failed`, `denied`,
and `cancelled`. The log is limited to the runtime's 32 tool steps. It retains
the exact private call identifier only for lifecycle matching; immutable view
snapshots expose tool name, risk, safe approval preview, and state but never the
identifier. A new accepted turn clears the prior sequence. The current sequence
remains visible after its turn settles and is scrubbed during application
cleanup.

The CLI maps every activity snapshot through one presentation function. Newest
activity appears first. Within one activity, its header precedes its optional
scope so a one-row allocation retains the header. Its quiet visual signature is
a semantic rail: a muted `U+2502 BOX DRAWINGS LIGHT VERTICAL` prefix plus one
space, accented tool name, muted risk, and an explicit state. Approval-sensitive,
unsuccessful, and cancellation states use the existing attention tone. An
optional descriptor-declared approval preview appears below the header as muted
text. No tool gets a custom component, color, icon, layout, or wording path.

The activity stack replaces the previous tool-status and tool-preview slots.
It is a bounded recent surface, not yet the durable inline transcript. Complete
inline ordering is reserved for the later CLI transcript-block decision so this
change does not introduce a second chat document model before the owned Markdown
subset exists.

## Security and failure behavior

The application reducer remains the sole lifecycle writer. Stale, duplicate,
out-of-order, mismatched, unsafe, or over-limit activity transitions fail as
content-free application invariants. Approval previews retain the existing
descriptor and CLI validation; bidi controls, zero-width format controls,
line separators, and oversized values never reach the view.

Rendering clips only printable owned rows. Model text, tool output, provider
content, call identifiers, structured arguments, credentials, and thrown causes
cannot select state, tone, or terminal bytes. Cancellation changes an active
activity to `cancelling` before the runtime command and to `cancelled` only after
the authoritative terminal event.

## Verification

Focused tests must prove exact state transitions, denial and cancellation,
stale identity rejection, entry bounds before member access, immutable snapshots,
cleanup scrubbing, next-turn replacement, hostile component containment,
head/tail selection, structured-span preservation, narrow viewports, caret
translation, multiple-caret failure, preview sanitization, and removal of the
parallel legacy tool-status path. The canonical verifier remains the release
gate on Windows and Linux.

## Update, rollback, and removal

Changing states, limits, retention, visible fields, tone mapping, stack
selection, padding, or caret rules requires reducer, activity-log, component,
layout, renderer, privacy, and manual regressions in the same change.

To remove the activity surface, first replace its single CLI slot with no tool
presentation, remove `ToolActivityLog` and its application transitions, then
remove `ComponentStack` only if no other component document uses it. Remove its
exports, tests, manual evidence, policy registration, and this decision together.
The runtime tool protocol, approval commands, tool engine, structured rows,
scroll view, text chat, and providerless CLI remain independently buildable.
