# 0032: Owned transcript visual refinement

- Status: accepted
- Date: 2026-08-11
- Surface, footer, and palette refined by: decision 0040 and the 2026-08-13
  update to decision 0031

The exact separator and compact-fence padding below remain current. Decision
0040 later makes structured regions transparent and removes the history footer
label, while decision 0031 now owns the fixed RGB palette. The original inset,
history-label, and indexed-SGR descriptions remain historical baselines.

## Context

Human review accepted the conversation grammar, technical inset, and syntax
palette introduced by decisions 0028 through 0031, then identified four small
sources of avoidable visual noise: a Markdown `---` appeared as literal text,
the detached-scroll label did not indicate direction, one- and two-row fences
carried the same padding as larger regions, and reference accents competed with
the brighter blues used inside code.

These refinements must strengthen the existing system rather than create a
second Markdown path, a theme registry, a block variant hierarchy, or new
application state.

## Decision

The closed Markdown subset recognizes an exact logical line containing `---`
as a horizontal separator. The parser emits one internal semantic separator
line. The shared display layout expands it to the available component width
with the muted box-drawing glyph `─`; model text cannot select the glyph, tone,
or width. Longer, shorter, spaced, or otherwise unsupported forms stay literal.

Complete fenced regions continue to use the same `inset` surface group and
surface painter. A fence whose visible logical region is one or two rows uses
zero horizontal padding; larger fences retain one cell on each side. The
classification includes a visible language-label row. It is determined before
layout from the bounded complete fence, not from terminal width, and therefore
does not add a second wrapping or rendering path. Strict tables retain their
existing padding.

The CLI footer renders `↑ history` only while the immutable transcript scroll
state is detached from follow-end. The arrow is navigation truth, not a new
counter or scroll model, and disappears immediately when follow-end resumes.

The renderer-owned `accent` role becomes restrained steel blue (`38;5;67`) for
inline references and fence labels. The lighter `syntaxKeyword`
(`38;5;75`) and `syntaxName` (`38;5;117`) roles remain code-only. Lifecycle
green, yellow, and red mappings are unchanged.

This decision amends decisions 0023, 0024, 0030, and 0031.

## Bounds, fallback, and security

Separator expansion is bounded by validated component columns and creates one
validated structured row. It performs no I/O and cannot emit ANSI. Fence
density changes only the existing closed `horizontalPadding` value and remains
subject to the same sanitizer, cell-width, wrapping, clipping, surface, span,
fragment, and frame checks. Incomplete fences remain literal. Unsupported
separator forms remain ordinary Markdown text.

## Verification

Focused tests prove exact and non-exact separator behavior, responsive width,
head and tail clipping, compact short fences, retained padding for larger
fences, narrow viewports, the directional history cue and its removal at
follow-end, and exact renderer bytes for the revised accent. Existing Markdown,
syntax, surface, scroll, resize, runtime, provider, privacy, and terminal
cleanup regressions remain required. The canonical verifier is the release
gate.

## Update, rollback, and removal

Changing the exact separator form, glyph, tone, fence density threshold,
history wording, or accent mapping requires this decision, parser, shared
layout, footer, renderer tests, manual, architecture, policy, and removal
guidance to change together.

To remove the separator, delete its parser case and semantic display-line role;
`---` returns to literal prose. To remove compact fences, set every structured
fence group back to one-cell horizontal padding. To remove the directional
history cue, restore the previous passive label without changing scroll state.
To restore the earlier accent, change only the renderer mapping and exact byte
tests. Markdown, surfaces, syntax highlighting, scrolling, CLI state, runtime,
tools, and providers remain independently buildable.
