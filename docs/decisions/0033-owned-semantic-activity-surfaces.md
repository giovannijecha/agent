# 0033: Owned semantic activity surfaces

- Status: accepted
- Date: 2026-08-11
- Density amended by: decision 0043

Decision 0034 refines foreground contrast without changing these semantic
backgrounds: tool identity, written state, safe detail, and approval actions use
neutral plain or emphasized foregrounds so they remain legible on every closed
activity surface.

Decision 0043 removes the surface's vertical padding and anchors constrained
activity at its head so tool identity and written state survive before optional
detail. The semantic background and lifecycle contract below remain current.

The 2026-08-14 lifecycle-density refinement reserves the complete bounded
effect preview for the `approval` state. Queued, running, cancelling, and
terminal snapshots retain only the risk class below the authoritative identity
and written state. An approval remains the sole point where the operator must
inspect and authorize the exact effect; replaying that potentially large
preview after the decision adds no authority and can displace the conversation.

## Context

The contextual activity slot already keeps only the latest tool call while its
model turn is active. Its visual treatment remained split: ordinary activity
used an open side rail, while approval used a complete bordered panel. Human
review showed that both treatments belong to the earlier shell grammar and add
visual weight beside the newer borderless transcript surfaces.

Tool execution and approval are one lifecycle. Their presentation should make
state immediately visible without creating tool-specific components, relying
on color alone, or adding another activity retention path.

## Decision

Every contextual tool state uses one generic borderless `Surface`. The closed
surface vocabulary adds `success`, `attention`, and `failure` backgrounds. The
renderer maps them to restrained dark green, ochre, and red terminal colors.
These values are generic semantic surfaces: they contain no tool, approval, or
provider knowledge.

The CLI owns one activity presenter for all registered tools. It maps
`succeeded` to the success surface; `failed`, `denied`, and `cancelled` to the
failure surface; and approval, queued, running, and cancelling states to the
attention surface. The tool name is neutral italic text, the authoritative
state remains written explicitly. As refined by decision 0034, bounded risk and
preview detail use neutral foregrounds that preserve contrast on every semantic
background. Color reinforces lifecycle truth but never replaces the state label.

Approval uses the same surface and hierarchy. Its first row contains the tool
name and `approval required`; its second row contains bounded risk and preview
detail plus the exact `/approve` and `/deny` actions. It gains no dedicated
panel, border, rail, icon, component, or state path.

Every non-approval snapshot keeps the same two-row hierarchy but projects only
its validated risk class as optional detail. It never replays mutation content,
digests, process arguments, or approval excerpts after approval or terminal
settlement. This is a presentation projection only: the lifecycle log retains
the immutable preview while the call is current so approval identity and
runtime invariants remain unchanged.

The existing lifecycle and retention contract does not change: the latest
activity replaces its predecessor, turn settlement removes it, and no tool
activity enters the transcript.

The CLI shell places one generic one-row `Spacer` before non-empty activity. Its
layout slot has zero minimum height and one preferred row. It separates a
model-first tool request from the preceding user surface while collapsing before
required activity or interaction rows in constrained viewports. Activity stays
directly adjacent to completion or the composer below, matching the established
completion-to-composer rhythm. The activity presenter itself owns no margin,
padding exception, or adjacency knowledge.

## Bounds, security, and failure behavior

Surface values are closed framework values selected only from validated CLI
state. Tool names, previews, model text, provider data, and external values
cannot select terminal bytes or arbitrary colors. All visible text continues
through the structured row, fragment, frame, and renderer validation path.

The presenter remains content-free on failure. Narrow viewports prioritize the
tool name and approval state before optional detail. The written state and
actions preserve meaning in terminals that do not distinguish the background
colors.

## Verification

Focused TUI tests prove the three new closed surfaces, style composition,
viewport painting, rejection of unknown surfaces, and exact renderer-owned SGR
bytes. CLI view tests prove one presenter, italic tool identity, semantic
background selection, explicit state text, approval actions, narrow clipping,
absence of activity rails and borders, collapsible leading rhythm, direct
following adjacency, latest-only replacement, transcript exclusion, and
turn-settlement removal. The canonical Windows and Linux verifier remains the
release gate.

## Update, rollback, and removal

Changing state-to-surface mapping, color bytes, typography, detail order,
adjacent rhythm, or approval actions requires this decision, TUI and CLI tests,
architecture, manual, maintenance guidance, and policy evidence to change
together.

To roll back, map the activity presenter to `none` while retaining explicit
state labels, then remove the three semantic surface values and renderer
mappings. To remove contextual activity entirely, follow decision 0022: remove
the single CLI slot, leading rhythm slot, and lifecycle log before removing
generic framework primitives that no other surface uses.
