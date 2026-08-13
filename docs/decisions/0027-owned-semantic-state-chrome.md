# 0027: Owned semantic state chrome

- Status: accepted
- Date: 2026-08-10
- Amended by: decisions 0028, 0031, 0033, 0038, and 0040

Decision 0028 later supersedes this decision's composer, conversation, and
`/help` presentation details. Decision 0031 later changes the accent mapping
and adds code-only tones without changing traffic-light truth. Decision 0033
adds semantic activity backgrounds and removes the activity rail and approval
panel without changing that truth. The single lifecycle location remains in
force. Decisions 0038 and 0040 replace the footer's textual lifecycle label
with the constant-width active-work pulse and leave the right edge empty while
idle or awaiting approval. They also replace the original indexed palette with
the current closed renderer mapping documented by decision 0031.

## Context

The responsive shell established the correct conversation-first structure, but
visual review found three sources of avoidable noise: a static product header,
lifecycle text repeated above the composer and in the footer, and cyan applied
to operational input and tool names without conveying state. Successful and
failed tool calls were also too similar to scan reliably.

The interface needs stronger truth signaling without becoming a dashboard,
adding arbitrary colors, or creating separate presenters for each tool.

## Decision

The CLI renders no static product or help header. The conversation begins at the
first available row. `/help` remains an explicit command, not permanent chrome;
decision 0028 later removes that duplicated reference surface.

The lifecycle phase has one authoritative visual location: the footer's right
edge. Transient notices are reserved for actionable command, validation, or
cleanup information and never restate the lifecycle phase. Provider and model
identity remain on the footer's left edge when configured. The footer may
collapse before required interaction rows on a constrained viewport.

The composer remains one generic `Panel` around the existing `InputLine`. Its
owned prefix is `U+2192 RIGHTWARDS ARROW` followed by one space. The arrow joins
the closed one-cell structural glyph set. Prefix and draft use `plain`; user and
assistant conversation also remain neutral except for syntax-derived Markdown
hierarchy.

At this stage the renderer accepted exactly seven semantic tones: `plain`, `muted`,
`emphasis`, `accent`, `attention`, `success`, and `failure`. It maps `attention`
to bold yellow, `success` to bold green, and `failure` to bold red. `accent`
remained available as an application-neutral framework role, but the CLI did not
use it for operational input, lifecycle state, or tool truth. Only the renderer
owns ANSI sequences.

The CLI applies one traffic-light state mapping:

- green: idle readiness and successful tool completion;
- yellow: generation, running, cancellation in progress, queued work, and
  approval required; and
- red: tool failure, denial, or cancellation.

Tool name and authoritative tool state use the same semantic tone. Risk and safe
scope stay muted. Every tool continues through the single activity presenter;
no tool-specific color or component path is allowed.

Adjacent transcript entries receive exactly one blank row, with no leading or
trailing decorative gap. User requests keep the shared complete panel and
assistant responses keep the shared side rail. Neither regains a role label.

## Bounds, security, and responsive behavior

The new tones and arrow are closed enum and glyph values. Model, user, provider,
tool, path, argument, and error text cannot choose a tone or terminal byte.
Structured rows, spans, components, frames, and renderer boundaries continue to
validate all metadata independently and return content-free errors.

The change adds no state source, timer, animation, theme engine, model-facing
tool, or application loop. Tiny viewports retain the composer before activity,
transcript, and footer. Removing the static header gives its row back to useful
content at every size.

## Verification

Focused tests must prove the absent header, one lifecycle location, neutral
composer draft, one-cell arrow, green ready and success states, yellow active and
approval states, red failed states, exact renderer SGR sequences, transcript
spacing, narrow retention, one-row fallback, and unchanged non-interactive
output. The canonical Windows and Linux verifier remains the release gate.

## Update, rollback, and removal

Changing tone names, mappings, state classification, arrow, lifecycle location,
or transcript spacing requires CLI view, application reducer, component, cell
width, structured-row, renderer, tiny-viewport, manual, privacy, and policy
regressions in the same change.

To remove this refinement, first replace the footer state with one neutral
inline status, restore the ASCII prompt prefix, and map tool truth to neutral
text. Then remove `success` and `failure` from tone validation and renderer tests,
remove the arrow from the closed glyph set, and remove this decision from policy
and manual evidence. Transcript, Markdown, tool lifecycle, runtime, providers,
core, terminal host, and renderer remain independently buildable.
