# 0028: Owned conversation visual grammar

- Status: accepted
- Date: 2026-08-10
- Amended by: decisions 0030, 0031, 0033, 0035, 0038, 0039, 0040, and 0043

Decision 0033 later replaces the unboxed-activity and approval-panel
distinction with one borderless semantic surface for every activity state.
Decision 0040 later keeps user and composer surfaces neutral subtle, makes
completion, code, and table regions transparent, and reserves green, ochre, and
red backgrounds for authoritative tool lifecycle state.
Decision 0043 later removes vertical padding from activity surfaces while
retaining one vertical padding row around user text and focused composer text,
plus the external rhythm.
Decisions 0035, 0038, and 0039 replace the original `InputLine` panel, textual
footer lifecycle, role-local width, and bordered geometry below with the
stage-wide multiline composer, bounded pulse, and one responsive stage. Those
original component descriptions remain historical rather than current UI
requirements.

## Context

The responsive conversation shell proved scrolling, Markdown, streaming, tool
approval, resize, and a fixed composer/footer. Human review and five visual
references then exposed a deeper problem: the shell still expressed ordinary
messages and tool truth as generic bordered boxes. That made the interface feel
dense, reduced useful transcript space, and gave one conversation several
unrelated visual dialects.

The desired interface is quiet rather than empty. It needs generous rhythm,
strong scan paths, one obvious input location, and immediate operational truth
without becoming a dashboard. The same grammar must support an empty session,
conversation, streaming tools, and approval without duplicating product
components or letting model text choose layout or color.

## Decision

The CLI adopts one conversation-first visual grammar derived from the reviewed
references. It is a structural target, not a pixel claim: terminal fonts,
glyph rasterization, and cell metrics remain controlled by the user's terminal.

The grammar has five canonical regions:

1. a scrollable conversation document;
2. an optional contextual activity document;
3. one bounded rectangular composer containing a focused input row;
4. one factual three-zone footer immediately below it; and
5. no permanent product header or decorative dashboard chrome.

User turns use one content-fit borderless surface with a closed subtle-gray
background, one cell of horizontal padding, italic text, and the existing
Markdown foreground tones. Under decision 0030, assistant prose is unboxed and
only fenced code and strict pipe tables use one content-fit dark `inset`
surface under decision 0031.
Neither role uses labels or a complete panel. Adjacent turns receive one blank
row. Markdown is still parsed independently at each message boundary.

Ordinary tool activity is one compact structured status. Tool name and scope
remain neutral or muted; only the authoritative state uses semantic color.
Successful states are green, active or approval states yellow, and failed,
denied, or cancelled states red. The same presenter serves every tool. The
contextual region beside the composer contains at most the latest tool while
its model turn remains active. Approval, execution, and terminal outcome update
that one surface in place. The next tool replaces it, and turn settlement
removes it. Tool activity never enters the scrollable conversation document.
An approval is the only activity that earns a complete panel because it is a
decision boundary; its summary, bounded scope, and `/approve` and `/deny`
actions live in one yellow-accented component.

The composer is one generic `Panel` around the existing `InputLine`. It has one
muted complete rectangular border, one cell of horizontal padding, no prompt
marker, and a plain draft. It creates no second editor, decoder, or submission
path. The footer follows directly without a second decorative separator. It
contains only authoritative working-folder, provider, model, history, and
lifecycle facts. Working folder is left-aligned, provider/model is physically
centered, and history plus lifecycle is right-aligned. The lifecycle remains on
the right edge and is never duplicated above the composer.

The renderer selects the standard steady-block cursor shape when it first takes
interactive terminal ownership. Cursor shape remains terminal chrome rather
than editor content or application state. Cleanup restores the terminal-default
shape before showing the cursor and leaving the alternate screen. Terminals
that do not implement the shape command may keep their native cursor; input
geometry and cleanup remain valid.

An empty transcript renders no guidance, branding, suggestions, provider
prompt, or embedded reference. The operator already chose to start the program;
the composer and factual footer are sufficient. Commands and input bindings
remain in the maintained operator manual instead of a duplicated `/help`
surface.

This decision supersedes the embedded `/help` command and reference-surface
parts of decisions 0004, 0007, and 0027. Their terminal ownership, event-loop,
and semantic-state decisions otherwise remain in force.

The generic TUI framework gains only five reusable composition capabilities:

- a bounded borderless surface with content-fit or viewport extent;
- independent closed foreground-tone, slant, and surface dimensions;
- an explicit bounded vertical spacer;
- independent semantic tones for an input prefix and projected draft; and
- one three-column row with independent left, physical-center, and right
  anchors.

Product words, command knowledge, tool semantics, provider identity, and
application phase stay outside `@agent/tui`. The renderer remains the only ANSI
owner. No theme engine, arbitrary color input, tool-specific component, or
second render path is introduced.

## Bounds, security, and responsive behavior

All new glyphs, tones, slants, and surfaces are closed framework values. Prefix,
user, model, tool, scope, provider, and command text pass through structured
row, component, fragment, frame, and renderer validation. Callback access is
contained and external values cannot select ANSI bytes or arbitrary styles.

The user surface measures its child, caps itself to the assigned viewport, and
applies optional padding only when geometry permits. Narrow viewports drop that
padding before content and retain the closed style. The prompt-free input
reserves no marker width. The three-column row measures terminal cells, retains
right before center before left when width is scarce, and never overlaps zones.
Tiny viewports retain a valid focused composer first;
the footer, contextual activity, and transcript collapse
according to the existing planned layout. Narrow layouts clip structured rows
deterministically and never introduce a second horizontal viewport.

The shell retains one scroll state and one caret. Activity projection is
derived from the one authoritative bounded log: no contextual snapshot is
copied into a second lifecycle or transcript state.
Activity previews remain bounded and content-safe, and private tool call
identifiers remain absent from display state.

## Verification

At acceptance, deterministic component tests proved compact and viewport surfaces, style
composition, panel caret translation, split input tones, malformed callback
containment, one-cell fallbacks, and exact structured rows. Renderer byte tests
prove closed foreground/slant/surface composition, steady-block selection,
default-style restoration, partial-write recovery, and idempotent cleanup. CLI
tests prove an empty initial document,
conversation documents, turn rhythm, unboxed tool activity, one contextual
focus, replacement by the next tool, removal at turn settlement, transcript
exclusion, the single approval panel, traffic-light truth, one lifecycle
location, footer facts, history navigation, streamed Markdown, and narrow
viewport priorities. Existing terminal, renderer, runtime, provider, privacy,
and non-interactive tests remain required. The canonical Windows and Linux
verifier is the release gate.

Decision 0033 replaces the unboxed activity and approval-panel assertions with
one shared borderless semantic surface and owns the current regressions.

## Update, rollback, and removal

Changing the visual grammar, surface, spacing, activity hierarchy, approval
boundary, composer, or empty state requires this decision, component tests,
CLI view tests, manual, architecture, privacy, policy, and removal guidance to
change together. Footer changes also require wide, narrow, physical-center, and
authoritative-source regressions. Cursor changes require exact renderer
initialization and cleanup byte regressions.

To remove this grammar, first replace the CLI document builders with one plain
transcript component and one plain input row. Then remove the activity document,
surface, text-style, spacer, panel, and three-column-line uses, and finally their
generic TUI exports and tests. Runtime, tools, providers, core, terminal host, Markdown,
scrolling, frame validation, and renderer remain independently buildable.
