# 0026: Owned responsive conversation shell

- Status: accepted
- Date: 2026-08-10
- Current stage and rhythm refined by: decisions 0039 and 0040
- Notice placement and lifetime refined by: decision 0041
- Palette refined by: decision 0031, updated 2026-08-13

Decisions 0035, 0039, and 0040 replace the original `InputLine` panel, fixed
144-column inset, bordered role treatment, textual footer phase, and no-motion
constraints below. Decision 0031's current fixed RGB mapping supersedes the
original increment's no-true-color constraint. Those clauses remain historical
context; the current contract is the stage-wide `InputArea`, borderless
surfaces, compact factual footer, and bounded active-work pulse.

## Context

The first interactive interface proves terminal ownership, streaming, Markdown,
tool activity, and transcript navigation, but presents them as mostly unframed
rows. The result is operationally correct and deliberately small, yet its
information hierarchy is too weak for a complete coding agent. Maintainer
mockups establish a clearer direction: a black terminal canvas, restrained
semantic accents, a dominant conversation, contextual information blocks, a
rectangular composer, and a quiet bottom status line.

The product must not become a permanent dashboard. Empty metrics, speculative
task state, and decorative panels would compete with the conversation and
expand the model-facing harness without adding capability. New tools also need
one shared visual path instead of tool-specific cards.

## Decision

Adopt one responsive conversation shell in `@agent/cli`. In current vertical
order it contains the flexible scrollable transcript, one contextual activity
surface, one latest ephemeral notice, completion, a rectangular composer, and a
compact status line.
Decision 0027 removes the initial static identity line after visual review. The
transcript remains the primary surface. Activity, changed-file,
approval, or future integration blocks appear only when authoritative
application state exists; an absent block consumes no row.

`@agent/tui` adds exactly four agent-agnostic composition primitives:

- `Panel` decorates one ordinary component with an owned one-cell border and
  optional one-cell horizontal padding. It preserves structured spans, clips
  through the child component contract, and translates at most one caret.
- `SplitLine` composes left and right structured text on one row. One caller-
  selected side has retention priority when the viewport cannot hold both;
  otherwise the right group is right-aligned with a bounded gap.
- `HorizontalInset` centers one component inside a bounded working column with
  an optional one-cell minimum margin. It delegates at full width when the
  margin cannot fit and translates at most one caret.
- `SideRail` adds one open vertical guide and optional one-cell padding without
  changing the child's row count. It delegates when the rail cannot fit and
  translates at most one caret.

The composer is one `Panel` around the existing `InputLine`; it does not create
another decoder, editor, input state, or submission path. The existing
`ComponentStack` remains the single tool-activity document. The CLI may place it
inside a `Panel`, but tools never select their own panel, icon, wording, color,
or layout. Markdown todo notation remains conversation content, not a second
planner or agent loop.

The CLI keeps transcript roles and content as separate bounded entries. User
requests render inside one `Panel`; assistant responses render behind one
`SideRail`. Neither entry gains a visible `you` or `agent` prefix. Every shell
region passes through the same `HorizontalInset`, capped at 144 columns, so a
wide terminal retains quiet outer space without changing child behavior.

The visual vocabulary stays semantic. Terminal typography and the canvas are
owned by the operator's terminal. Closed tones continue to describe meaning
rather than arbitrary color values; decision 0027 owns the current seven-tone
state mapping.
The interface is designed for a dark terminal and remains legible when color or
weight is unavailable. No true-color, mouse, animation timer, image, shadow, or
theme engine enters this increment.

The CLI status line displays only facts already held by the application: the
configured provider/model when present, the current application phase, and the
history marker while detached from follow-end. Context percentages, file
counts, durations, token counts, and progress fractions remain absent until an
authoritative bounded source is designed. Labels do not imply unavailable
capabilities.

## Responsive contract

The composer is the highest-priority slot and always degrades to the existing
one-row prompt when a border cannot fit. Approval-sensitive notice and current
tool state follow. Transcript content receives every remaining flexible row.
The status line collapses before required interaction rows.

`Panel` draws its `┌─┐`, `│`, and `└─┘` border only when at least three rows and enough columns for
one inner cell plus its configured padding are assigned. Otherwise it delegates
the complete viewport to its child without a border. A full panel adds exactly
two rows and two border columns; horizontal padding adds zero or one cell per
side. It never draws a partial box.

`SplitLine` occupies one natural row. When both groups fit, it keeps the declared
gap and right-aligns the right group. Under pressure it retains the priority
group, clips the other group to the remaining cells, and omits a gap that cannot
fit. An empty group is valid; two empty groups measure zero rows.

`HorizontalInset` subtracts its minimum margins only when both fit, caps the
remaining child width, and divides spare columns deterministically with the
extra cell on the right. It adds only a left printable-space prefix because row
fragments do not require trailing padding. `SideRail` consumes one column plus
its configured padding and otherwise preserves the child's measurement,
anchoring, spans, and rows.

## Bounds, failures, and security

All four primitives reuse the existing component, span, row, fragment, viewport,
frame, and renderer bounds. Panel and rail padding are closed zero-or-one values;
split priority is `left` or `right`; the gap and maximum inset width are bounded
integers. Every child call passes through the hostile-component boundary.
Construction snapshots validated children and structured rows. Invalid geometry,
style metadata, component callbacks, rows, padding, priority, or caret
translation returns a content-free `ComponentError`.

Borders, rails, padding, gap text, and status labels are owned printable glyphs.
The cell-width contract grants one cell only to printable ASCII and the exact
closed structural set `·•→─│┌┐└┘`; all other non-ASCII text remains conservatively
two cells. The owned footer separator and activity bullet joined that set under
decisions 0038 and 0040 so their layout widths match their terminal cells. Model
text, tool output, provider content, paths, errors, and callbacks cannot emit
ANSI, choose geometry, create panels, or select semantic tones. Only the
renderer emits terminal controls. Non-interactive output remains unchanged and
escape-free.

## Verification and visual review

Focused tests must prove measurement, full borders, border elision, padding,
centering, inset degradation, open rails, structured-span preservation, right
alignment, both retention priorities, empty groups, hostile child containment,
exact caret translation, the closed structural-width set, multiple viewport
sizes, one-row and one-column behavior, and content-free failures.

CLI tests must prove the dominant transcript, role-separated label-free entries,
contextual activity visibility, approval-command retention, rectangular
composer, truthful provider/model status, phase/history status, empty-state
omission, and responsive priority order. Existing input, scroll,
Markdown, activity, runtime integration, renderer, cleanup, and non-interactive
tests remain release gates. The maintainer reviews idle, streaming, tool,
approval, completed, history, narrow, and short states before publication.

## Update, rollback, and removal

Changing border or rail glyphs, structural width, padding, maximum working
width, collapse thresholds, slot priorities, split retention, role treatment,
status facts, or composer composition requires framework, CLI, renderer,
tiny-viewport, manual, privacy, and policy regressions together.
Future tool or integration panels must reuse these primitives and authoritative
CLI state; a new presentation path requires a replacing decision.

To roll back, first restore the direct `InputLine`, unframed activity stack,
direct inline status, and labelled transcript in `chat-view.ts`. Then remove
`Panel`, `SplitLine`, `HorizontalInset`, and `SideRail`, their exports and focused
tests, remove this decision from policy, and update the manual. Transcript state,
Markdown, scrolling, input decoding, tool lifecycle, runtime, providers, core,
renderer, and terminal host remain independently buildable.
