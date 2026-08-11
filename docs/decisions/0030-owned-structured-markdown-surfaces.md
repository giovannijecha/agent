# 0030: Owned structured Markdown surfaces

- Status: accepted
- Date: 2026-08-11
- Amended by: decisions 0031 and 0032

Decision 0031 changes the structured surface from `subtle` to dark `inset`,
changes the accent mapping, and permits only its bounded internal lexical
highlighter for complete recognized fences. The grammar and single rendering
path below remain in force.

## Context

Decision 0028 gave user turns one quiet surface and assistant turns one open
rail. Human review proved that the user surface already distinguishes turn
ownership, while the assistant rail consumes horizontal space and makes every
answer look structurally identical. The same review showed the opposite
problem inside answers: prose, code, commands, and tables currently share one
undifferentiated plane.

The conversation must remain quiet and dense with meaning rather than chrome.
Structured model output needs a reusable visual boundary, but model text must
not choose arbitrary colors, surfaces, layout, or renderer instructions. A
second Markdown engine, syntax-highlighting dependency, or product-specific
code panel would violate the owned single-path architecture.

## Decision

Assistant prose renders directly in the conversation document with no
role label, side rail, panel, or background. User turns retain the compact
italic subtle surface from decision 0028. Turn boundaries retain exactly one
blank row.

The owned Markdown compiler gains one syntax-derived structured-region role.
Fenced code and strict pipe tables select that role. `MarkdownBlock` renders
each contiguous structured region through the same generic content-fit
`Surface` painting primitive used elsewhere: dark `inset` background, one cell of
horizontal padding when geometry permits, normal slant, and no border. Prose,
lists, headings, and quotes remain unboxed. Commands are fenced code with a
language label such as `sh`, `powershell`, or `cmd`; they do not create a
second command component or execution path.

The closed Markdown subset adds strict pipe tables. A table begins with a
header row containing at least two non-empty pipe-separated cells followed by
a delimiter row with the same cell count. Every delimiter cell is exactly an
optional colon, at least three ASCII hyphens, and an optional colon. Optional
single leading and trailing pipes are accepted. Body rows continue only while
they have the same non-empty cell count. The delimiter row is structural and
is not displayed. Header cells use `emphasis`, body cells use `plain`, and
owned separators use `muted`. The compiler emits one additional muted rule
between the header and body across the table's exact measured row extent. It
belongs to the same structured surface; there is no outer border or full cell
grid. Alignment markers are validated but do not
select terminal alignment. Escaped pipes, spanning cells, multiline cells,
nested blocks, and full GFM table behavior remain unsupported. A malformed
candidate stays literal prose.

Markdown syntax may now select `accent` only for complete inline-code content
and complete fenced-code language labels. Headings, strong text, and table
headers use `emphasis`; structural markers and table separators use `muted`;
prose and unknown or unlabeled code bodies use `plain`. Recognized complete
fences may use only the five code roles registered by decision 0031. This is a
closed parser-owned mapping, not a theme or model-controlled styling surface.
`attention`, `success`, and
`failure` remain reserved for authoritative application state and never style
model content.

Structured-region painting remains part of the one normalization and layout
pipeline. The display layout reserves optional surface padding before wrapping,
retains the region identity beside bounded rows, and applies the generic
surface painter only after visible rows are selected. Head and tail anchors,
streaming reparsing, Unicode cell width, word wrapping, literal code wrapping,
sanitization, clipping, frame validation, and differential rendering remain
single-path behavior.

Before emitting a strict table, the Markdown compiler measures every accepted
header and body cell, records one maximum visible width per column, and pads all
emitted rows to those shared widths. The resulting background is one
rectangular content-fit surface even when source cells have unequal lengths.
The header rule derives its length from the same column widths and separator
spacing, so it cannot exceed or shorten that rectangle. The generic surface
painter still owns the background and clipping; the table
compiler emits only bounded structured rows, never ANSI or a second renderer.

This decision supersedes decision 0028's assistant side rail and decision
0023's table exclusion, code rail, and three-tone Markdown mapping. Their
remaining conversation and Markdown contracts stay in force.

## Bounds, security, and responsive behavior

The parser stays iterative, bounded by the existing document, text, span, row,
and viewport limits, and performs no I/O or dynamic language dispatch. Region
identifiers are internal safe integers created by the parser. Model text cannot
supply a surface identifier, semantic tone, ANSI sequence, or terminal style.

Structured padding drops before content when fewer than three columns are
available. Only retained visible rows determine a content-fit surface width,
so head and tail clipping do not require buffering an entire large block.
Surface painting preserves span tones and performs final `RichRow` validation.
Malformed tables, incomplete fences, and incomplete inline syntax remain
literal. Control bytes and lone surrogates are replaced before parsing or
painting and are rejected again at the frame boundary.

## Verification

Focused TUI tests prove unboxed prose, surfaced fenced code and strict tables,
inline and language accents, literal malformed tables, document isolation,
padding fallback, wrapping, head and tail clipping, shared column widths, exact
muted header-rule extent and tone, surface width, controls,
and style preservation. CLI tests prove the user surface remains unchanged,
assistant rails disappear, structured assistant regions use the generic
surface, streaming remains safe, and role labels stay absent. Existing
renderer, scroll, resize, runtime, tool, provider, privacy, and non-interactive
tests remain required. The canonical Windows and Linux verifier is the release
gate.

## Update, rollback, and removal

Changing structured syntax, role mapping, padding, surface extent, or fallback
requires this decision, parser, display-layout, surface, CLI view, manual,
architecture, policy, and focused tests to change together. A new structured
construct needs a concrete conversation need and an exact closed grammar; it
cannot arrive through a registry or extension callback.

To remove structured surfaces while keeping Markdown, stop emitting structured
region identities, restore fenced code to ordinary Markdown rows, remove strict
table recognition and its derived header rule, and delete the shared row-paint
integration and its tests.
Delete the internal highlighter and its tests if code highlighting is also
removed; otherwise first define its remaining non-surface consumer.
The generic `Surface`, user-turn composition, Markdown prose, renderer, scroll,
runtime, tools, providers, and core remain independently buildable. To remove
assistant presentation entirely, replace assistant `MarkdownBlock` use in the
CLI conversation builder with the chosen plain component; no TUI framework
module requires a product role.
