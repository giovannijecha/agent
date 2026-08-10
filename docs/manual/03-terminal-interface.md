# 03 - Terminal interface

## Purpose

Use this chapter to operate the owned terminal UI and understand its editing,
layout, rendering, input, and cleanup boundaries.

## Operator workflow

Start with `agent` in a terminal after the one-time command installation, or use
`npm run dev` while developing. Type printable text and edit one line with
Left, Right, Home, End, Delete, and Backspace. Enter submits. `/help` shows the
current command reference, `/providers` shows integration availability,
`/approve` and `/deny` resolve one pending write-tool request, and `/exit`
closes the application.

Use Up and Down to move the transcript by one row. Use Page Up and Page Down to
move by the visible transcript height minus one row, so adjacent pages retain
one line of context. Reaching the newest row resumes automatic follow. Starting
a new turn also returns to the newest content. Home and End remain editor keys,
and transcript navigation never changes the draft or caret. The bottom status
line adds `history` only while the transcript is detached from follow-end. Its
low-priority row stays geometrically stable during page movement and collapses
behind tool activity, required prompt, and transcript rows on constrained
terminals. `/help` is available on demand and consumes no permanent header row.

## Guarantees and limits

Input decoding is incremental across fragmented terminal chunks. The editor is
bounded and Unicode-code-point aware. The vertical framework allocates a
dominant transcript, transient actionable notice, one generic activity stack,
rectangular composer, and compact footer without product logic entering the
generic TUI package. `Panel` decorates one ordinary component, `SplitLine`
composes two independently retained text groups on one row, `HorizontalInset`
centers a bounded working column, and `SideRail` adds one open guide. Untrusted text is
normalized and sanitized before the frame performs a final control-character
check. Rendering is serialized, differential, and commits its snapshot only
after a complete successful write.

The shell is conversation-first rather than a permanent dashboard. The composer
wraps the existing input component and owns no second editor or submission path.
Contextual activity consumes no rows when absent. A panel draws one complete
printable `┌─┐`, `│`, and `└─┘` border only when its full geometry fits; otherwise the entire
border disappears and the child receives the viewport. On short terminals the
composer survives first, followed by approval-sensitive state and transcript;
the footer collapses before required interaction.

On a wide terminal every shell region is centered in the same bounded working
column. User requests appear inside one complete panel; assistant responses use
one open side rail. Roles remain structured internally, but the transcript does
not repeat `you` or `agent` labels. The exact framework-owned box set `─│┌┐└┘`
measures as one terminal cell; other non-ASCII text keeps conservative width.

The visual language is deliberately small. Ordinary conversation, the composer
arrow, and the draft remain plain. Dim text marks passive structure, bold
default text marks document emphasis, green marks readiness or successful tool
completion, yellow marks active or approval-sensitive state, and red marks
failure, denial, or cancellation. Cyan remains a generic framework tone but is
not used for operational input or state truth.
One row may contain multiple immutable semantic spans. Provider/model and
phase/history share one compact footer, and lifecycle phase appears nowhere
else. The footer displays only authoritative application facts.
Empty spans are removed, adjacent equal roles are merged, and each row is
bounded before composition.
These are semantic roles, not model-controlled colors. Only the renderer creates
ANSI sequences and it resets style after each emphasized span and before
terminal ownership is returned.

Conversation text accepts one original bounded Markdown subset: headings with
one through six `#` markers, one-level `- ` or numbered list items, one-level
`> ` quotes, matched triple-backtick code fences, same-line backtick code, and
same-line `**strong**` text. Headings, strong text, and inline code use bold
default text. Inline delimiters must be exact and cannot be part of a longer run.
List markers, quote rails, and code rails are dim. Missing closing delimiters,
longer delimiter runs, and every unsupported construct stay visible literally.
Links, images, HTML, tables, task lists, syntax highlighting, and extensions are
not interpreted. Markdown shares the plain-text sanitizer, Unicode cell
measurement, wrapping, anchoring, padding, structured rows, and final renderer;
it has no second screen or arbitrary style path.
Each structured conversation entry is a separate parser document. Up to
512 documents share the existing total text bound, with one blank row between
them; a fence or delimiter can never continue into the next message.

Ordinary text wraps at the last space that fits instead of splitting a normal
word. A token wider than the available row still falls back to deterministic
cell wrapping. Wrapped list items use a hanging marker-width indent, quotes
repeat their rail, and fenced code keeps literal cell wrapping with a repeated
rail. The layout performs no language-specific hyphenation or URL rewriting.

Tool activity uses one contextual panel and one generic component stack for
every registered tool. Newest activity appears first. The canonical activity
header shows the canonical tool name and risk. Tool name and authoritative state
share green, yellow, or red according to the same state mapping as the footer.
For approval, the exact
`/approve` and `/deny` commands receive first-row retention priority while the
next row identifies the tool, required state, and risk. The optional line below
shows only the safe approval scope declared by the descriptor. In a short viewport the
scope collapses before the header, and the panel border disappears as one unit
before it could become partial chrome. No empty activity panel is rendered. The
current turn remains visible after settlement until the next turn is accepted.
Call identifiers, raw arguments, output, provider data, credentials, and failure
causes are never displayed.

## Failure behavior

Unsupported or oversized input produces a generic notice. Invalid display text,
layout failure, viewport failure, and output failure stop through typed
boundaries. On every exit path the host restores cooked input, the renderer
restores cursor and screen state, and cleanup failures remain separate. At idle,
Ctrl+C exits; during an active turn it requests cancellation instead.

## Maintenance and removal

Keep terminal decoding, components, renderer, Node host, application view, and
lifecycle tests separated by their package ownership. A TUI feature is complete
only when bounds, controls, resize, one-row viewports, failures, cleanup, update,
and removal are documented. Follow [decision 0006](../decisions/0006-owned-vertical-tui-framework.md)
for framework changes and [decision 0019](../decisions/0019-owned-semantic-terminal-tones.md)
for visual emphasis changes. Decision
[0020](../decisions/0020-owned-scrollable-screen-foundation.md) governs
synchronized redraw and the reusable scroll foundation. Decision
[0024](../decisions/0024-owned-transcript-navigation.md) governs product
navigation, planned geometry, follow recovery, visual review, and removal.
Decision
[0021](../decisions/0021-owned-structured-terminal-rows.md) governs the one
canonical structured-row representation, its bounds, clipping, and removal.
Decision [0022](../decisions/0022-owned-tool-activity-surface.md) governs the
generic component stack and the CLI-owned activity surface.
Decision [0023](../decisions/0023-owned-bounded-markdown.md) governs the closed
Markdown syntax, document-emphasis tone, fallback, tests, and removal path.
Decision [0025](../decisions/0025-owned-word-aware-display-layout.md) governs
word boundaries, literal-code wrapping, continuation prefixes, tests, and
removal.
Decision [0026](../decisions/0026-owned-responsive-conversation-shell.md)
governs the conversation-first shell, generic panel, split-line,
horizontal-inset, and side-rail primitives, responsive priorities, truthful
footer, visual review, rollback, and removal.
Decision [0027](../decisions/0027-owned-semantic-state-chrome.md) governs the
header-free shell, single lifecycle location, neutral composer, semantic state
colors, transcript spacing, tests, rollback, and removal.

## Evidence

- Input protocol: `packages/agent-tui/src/input-decoder.ts`
- Generic layout: `packages/agent-tui/src/vertical-layout.ts`
- Generic component stack: `packages/agent-tui/src/component-stack.ts`
- Generic panel: `packages/agent-tui/src/panel.ts`
- Generic split line: `packages/agent-tui/src/split-line.ts`
- Generic horizontal inset: `packages/agent-tui/src/horizontal-inset.ts`
- Generic side rail: `packages/agent-tui/src/side-rail.ts`
- Shared display layout: `packages/agent-tui/src/display-text.ts`
- Bounded Markdown component: `packages/agent-tui/src/markdown-block.ts`
- Bounded Markdown parser: `packages/agent-tui/src/markdown-parser.ts`
- Semantic tones: `packages/agent-tui/src/tone.ts`
- Structured rows: `packages/agent-tui/src/rich-row.ts`
- Tone contract: `docs/decisions/0019-owned-semantic-terminal-tones.md`
- Scroll contract: `docs/decisions/0020-owned-scrollable-screen-foundation.md`
- Structured-row contract: `docs/decisions/0021-owned-structured-terminal-rows.md`
- Tool-activity contract: `docs/decisions/0022-owned-tool-activity-surface.md`
- Markdown contract: `docs/decisions/0023-owned-bounded-markdown.md`
- Transcript-navigation contract: `docs/decisions/0024-owned-transcript-navigation.md`
- Display-wrapping contract: `docs/decisions/0025-owned-word-aware-display-layout.md`
- Conversation-shell contract: `docs/decisions/0026-owned-responsive-conversation-shell.md`
- Semantic-state contract: `docs/decisions/0027-owned-semantic-state-chrome.md`
- Final renderer: `packages/agent-tui/src/renderer.ts`
- Scroll state: `packages/agent-tui/src/scroll-state.ts`
- Generic scroll view: `packages/agent-tui/src/scroll-view.ts`
- Terminal host: `packages/agent-cli/src/node-terminal-host.ts`
- Product view composition: `packages/agent-cli/src/chat-view.ts`
- Tool-activity lifecycle: `packages/agent-cli/src/tool-activity-log.ts`
- Slash-command classifier: `packages/agent-cli/src/commands.ts`
