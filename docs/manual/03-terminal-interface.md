# 03 - Terminal interface

## Purpose

Use this chapter to operate the owned terminal UI and understand its editing,
layout, rendering, input, and cleanup boundaries.

The contracts in this chapter are the accepted stable TUI baseline. Future
visual work extends or replaces the registered generic components and their
decisions; it must not introduce a parallel composer, transcript, activity, or
rendering path.

## Operator workflow

Start with `agent` in a terminal after the one-time command installation, or use
`npm run dev` while developing. Type printable text into the bounded multiline
composer. Left and Right move one code point. Ctrl+Left and Ctrl+Right move one
whitespace-delimited word. Backspace and Delete remove one code point;
Ctrl+Backspace, Ctrl+W, and Ctrl+Delete remove one word. Home and End move to the
draft boundaries. Enter submits. `/providers` shows integration availability,
`/approve` and `/deny` resolve one pending write-tool request, and `/exit`
closes the application.

A bracketed paste is inserted as one atomic draft edit. Line feeds and tabs
remain draft content, control-looking bytes inside the paste are not interpreted
as keys or commands, and only a separately typed Enter submits the result.

In an interactive alternate screen, left-drag selects visible conversation or
composer text and copies it on release. A second press on the same logical
character within 500 milliseconds selects its complete whitespace or non-
whitespace run; release copies that word. Keep the second press held and drag to
extend the range through complete word runs before release. In the composer,
typing, paste, Backspace, Delete, and word deletion replace or remove the active
range through the same editor path. If a terminal delivers pointer and editor
input together, `agent` preserves their decoded order, so later input uses the
new caret or selection.

Copied logical text excludes soft wrapping and surface padding while preserving
source line breaks and message order. Windows x64 shows `Copied!` only after its
owned native clipboard boundary succeeds within its two-second operation and
250-millisecond post-kill cleanup deadlines. Other platforms show `Copy
requested!` after the bounded OSC 52 request is written; the terminal may still
reject or ignore it. Failure shows `Copy failed!` without closing `agent`. These
short statuses use the composer's right edge and expire normally. They reserve
no row or draft width and collapse when they cannot fit, so copying never moves
the transcript, composer, or caret. Copy is bounded to 65,536 UTF-16 code units;
a larger range remains selected and shows a warning instead of being truncated.
Clicking or dragging in the composer dismisses the current status immediately;
conversation selection and scrolling leave it until replacement or expiry.
If an OSC 8 link or OSC 52 copy write is interrupted, the next serialized
renderer operation first closes the possible terminal string and hyperlink.
Rendering and terminal cleanup do not continue until that recovery write
succeeds.

The mouse wheel over the transcript reuses its normal scroll state. A settled
logical selection survives scrolling, so a long message can be reviewed without
turning the range into screen coordinates. Resize clears transcript and composer
selection because the wrapped geometry has changed. Any intervening keyboard
input breaks a pending double-click sequence. Hold Shift when pressing or
dragging for the terminal's optional native selection behavior. This is an
escape hatch, not the application copy path. Ctrl+C remains cancellation during
active work and exits while idle; it is not a copy shortcut.
If Ctrl+C and `/exit` or EOF arrive in one terminal chunk, cancellation remains
ordered before one exit request; an idle chunk never emits duplicate exits.

Exact visible ASCII text beginning with `https://` is exposed as a terminal
hyperlink with the same visible destination. The terminal chooses the click or
modifier gesture, confirmation, browser, and security UI. `agent` does not
launch a browser. Markdown link labels, hidden targets, non-HTTPS schemes, and
credentials are not admitted as hyperlink destinations.

Type `/` or a non-exact command prefix to open completion above the composer.
The list contains only the four exact commands. While it is visible, Up and Down
move the selection without wrapping and do not move the transcript. Tab copies
the selected command into the composer and moves the caret to its end; it does
not execute anything. Enter runs the highlighted exact command immediately
through the normal command dispatcher and clears the draft. Exact commands,
whitespace, case mismatches, unknown prefixes, `/help`, and `/quit` show no
completion. The menu renders no passive keyboard hint; selection, insertion,
and execution remain the complete interaction contract at every viewport size.

Command feedback appears as one transparent line group below current tool
activity and above completion or the composer. New feedback replaces old
feedback. `/providers` shows display name, model, and authentication in one
muted line; an unknown command shows one short warning. The current notice
disappears after five seconds or immediately when editor interaction resumes.
It never enters transcript history.

Use Up and Down to move the transcript by one row. Use Page Up and Page Down to
move by the visible transcript height minus one row, so adjacent pages retain
one line of context. Reaching the newest row resumes automatic follow. Starting
a new turn also returns to the newest content. Home and End remain editor keys,
and transcript navigation never changes the draft or caret. Detaching from
follow-end changes reducer-owned navigation state without adding footer
telemetry. The low-priority footer row stays geometrically stable during page movement and collapses
behind tool activity, required prompt, and transcript rows on constrained
terminals. This maintained manual is the operator reference; the TUI does not
duplicate it.

## Guarantees and limits

Input decoding is incremental across fragmented terminal chunks. The editor is
bounded and Unicode-code-point aware. Its word operations use one rule: spaces,
tabs, and line feeds delimit words. The composer grows from one through six
content rows and retains the caret-visible window after reaching its cap. The vertical framework allocates one
  dominant document, contextual activity, one latest ephemeral notice, a
stage-wide padded composer, and compact footer without product logic
entering the generic TUI package. `Panel` decorates one decision boundary,
`SplitLine` composes two independently retained text groups, `ThreeColumnLine`
anchors left, physical-center, and right groups, `HorizontalInset` centers a
bounded child, `SideRail` adds an open guide, `Surface` paints one
bounded borderless region, and `Spacer` owns vertical rhythm.
Untrusted text is normalized and
sanitized before the frame performs a final control-character check. Rendering
is serialized, differential, and commits its snapshot only after a complete
successful write.

Cell measurement is shared by the editor, composer, transcript, Markdown,
tables, surfaces, clipping, caret, and renderer. Printable ASCII, interface
glyphs, and the maintained precomposed Latin prose profile occupy one cell;
unknown non-ASCII text remains conservatively two cells. This keeps accents and
typographic quotes physically aligned after paste without claiming complete
Unicode grapheme support or changing retained text.
Decision [0044](../decisions/0044-owned-latin-prose-cell-width.md) defines the
exact admitted profile, fallback, verification, and removal contract.

The shell is conversation-first rather than a permanent dashboard. An empty
session contains no welcome, suggestions, provider prompt, or embedded help.
Only the composer and factual footer remain. Contextual activity, notice, and completion
consume no rows when absent. One shared optional blank row separates every
adjacent lower-shell region: transcript, activity, notice, completion,
composer, and footer. Each instance collapses before required content on a
short terminal.

On a wide terminal every shell region uses one CLI-owned conversation stage
that fills the terminal except for one technical outer column per side when
space permits.
Transcript, activity, notice, completion, and composer use that projection;
resizing recomputes it without changing transcript, draft, or model state and
clears only geometry-dependent selection. The footer uses the
same projection so the pulse ends exactly with the composer surface. User requests occupy one
stage-wide neutral subtle surface with one cell
of horizontal and vertical padding and italic default-foreground text. A
one-line request therefore paints three rows; multiline content adds only its
visible content rows between the shared top and bottom padding. Assistant responses
remain unboxed when they are ordinary prose. Fenced code and strict pipe tables
use one content-fit transparent technical region. Complete fences with one or two
visible logical rows use zero horizontal padding; larger fences and tables use
one cell. Roles
remain structured internally, but the transcript does not repeat `you` or
`agent` labels. User and structured-content surfaces have no border; user
surfaces fill the conversation stage while structured content stays content-fit.
One blank row separates adjacent turns.
The composer is one neutral, borderless, stage-wide subtle `Surface` around generic
prompt-free `InputArea`; it owns no second editor or submission path. One cell
of horizontal and vertical padding separates the draft from the surface edge.
The area wraps the draft, grows from one through six rows, and follows the
caret. The draft stays plain and one optional rhythm row separates the composer
from the footer. The composer survives first, followed by
approval-sensitive state and document content; the footer collapses before
required interaction.

During an interactive session the renderer requests bracketed-paste mode, DEC
button-event tracking, SGR mouse reports, and a steady vertical bar caret. This
is terminal chrome, not a character in the draft. A terminal that ignores the
standard shape command keeps its native caret. On exit or cleanup retry, agent
disables both mouse modes and bracketed-paste mode, then restores the terminal-
default cursor style
before restoring visibility and the previous screen.

The visual language is deliberately small. Ordinary conversation, tool names,
scope, and the draft remain neutral. Dim text marks passive structure, bold
default text marks document emphasis, green marks successful tool completion,
yellow marks active or approval-sensitive state, and red marks
failure, denial, or cancellation. Restrained steel blue marks parser-recognized
inline code and fenced language labels, never model-selected state. Recognized
code may use lighter code-only blues, sand, sage, and quiet-green syntax roles for scan
hierarchy; these roles never represent lifecycle truth. The neutral subtle
background distinguishes user input and the composer; green, ochre, and red
backgrounds are reserved for authoritative tool lifecycle state. The compact footer shows the working folder
at the left edge and provider/model at the physical center. Its right edge shows
only a constant-width active-work pulse whose final cell coincides with the
composer surface's final cell, and otherwise remains empty. Lifecycle
and navigation words stay on their owning interaction surfaces. On narrow
terminals it retains the right group first, the center group second, and the
working folder last. The footer displays only authoritative composition-root or
application facts. Empty spans are removed, adjacent equal roles are merged,
and each row is bounded before composition. These are semantic
roles, not model-controlled colors. Only the renderer creates ANSI sequences
from one fixed closed 24-bit palette; unsupported terminals may degrade color
without changing text or geometry. The renderer performs no palette detection
and resets style after each emphasized span and before terminal ownership is
returned.

While autonomous work is generating, running a tool, or cancelling, the footer
shows one constant-width three-cell pulse as its only right-edge content. Idle
and approval waiting leave that edge empty. Six deterministic phases move one
ochre head through a neutral leading and trailing step at eight frames per
second in interactive terminals. Terminal input, runtime
events, approvals, cancellation, and shutdown take priority over motion. Slow
output cannot accumulate ticks because the scheduler re-arms only after a
successful frame. Only an event that actually redraws rebases pending motion;
retained input fragments do not stop it, and notice expiry discards a cached
tick without resetting the current phase. Non-TTY output and Phase 0 remain
static.

Conversation text accepts one original bounded Markdown subset: headings with
one through six `#` markers, one-level `- ` or numbered list items, one-level
`> ` quotes, matched triple-backtick code fences, same-line backtick code,
same-line `**strong**` text, and an exact `---` horizontal separator. It also
accepts a strict pipe table: one header with
at least two non-empty cells, a same-width delimiter row made from optional
colons and at least three hyphens per cell, then same-width non-empty body rows.
The compiler measures every retained header and body cell before painting and
pads each column to one shared visible width. One quiet divider of that exact
width separates the emphasized header from the body inside the same transparent
content-fit region. Tables do not draw an outer box or a full grid.
Headings, strong text, and table headers use bold default text. Inline code and
fenced language labels use the parser-owned restrained steel-blue accent. List
markers, quote rails, table separators, and the responsive horizontal separator
are dim. Shorter, longer, or spaced horizontal-rule variants remain literal. A complete recognized code fence may
highlight keywords, names, strings, literals, and comments through the bounded
owned line scanner. The registered profiles cover HTML/XML/SVG, JavaScript and
TypeScript, JSON, CSS/SCSS, and common shell dialects; empty or unknown labels
remain plain. Inline delimiters
must be exact and cannot be part of a longer run. Missing closing delimiters,
longer delimiter runs, malformed tables, and every unsupported construct stay
visible literally. Markdown link syntax, images, rendered HTML, escaped pipes,
task lists, and extensions are not interpreted. Exact visible HTTPS text may
carry only the terminal interaction described above. Code highlighting is lexical display assistance,
not compiler semantics, execution, language discovery, or an extension system.
Markdown shares the plain-text sanitizer, Unicode cell
measurement, wrapping, anchoring, padding, structured rows, and final renderer;
it has no second screen or arbitrary style path.
Each structured conversation entry is a separate parser document. Up to
512 documents share the existing total text bound, with one blank row between
them; a fence or delimiter can never continue into the next message.

Ordinary text wraps at the last space that fits instead of splitting a normal
word. A token wider than the available row still falls back to deterministic
cell wrapping. Wrapped list items use a hanging marker-width indent, quotes
repeat their rail, and fenced code keeps literal cell wrapping inside its
declared zero- or one-cell surface padding. The exact horizontal separator is
expanded only after the available width is known. The layout performs no
language-specific hyphenation or URL rewriting.

Tool activity uses one generic document builder for every registered tool. At
most the latest activity remains beside the composer while its turn is active.
Approval, execution, and terminal outcome update that one surface. The next
tool replaces it, and turn settlement removes it. Tool activity never enters
the scrollable conversation. The view derives from the same bounded log.
Every state uses one borderless semantic surface. Its restrained dark green,
ochre, or red background reinforces success, active or approval, and negative
terminal state; the written state remains explicit. The canonical tool name is
neutral italic text. Tool identity, written state, safe scope, and approval
actions use neutral plain or emphasized foregrounds for contrast against every
semantic background. The surface has one horizontal padding cell and no vertical
padding, so the current header plus detail occupies two rows. If only one row
fits, the header retains tool identity and written state before optional detail.
Approval uses the same component. The exact `/approve`
and `/deny` commands receive retention
priority over optional safe detail in a short viewport. No activity rail,
border, private panel, or empty activity document is rendered.
Call identifiers, raw arguments, output, provider data, credentials, and
failure causes are never displayed.

## Failure behavior

Unsupported or oversized input produces one warning notice in the shared
ephemeral slot. It replaces prior feedback and is dismissed after five seconds
or the next editor interaction. An incomplete,
malformed, or oversized paste is discarded atomically and cannot submit a
partial turn. Invalid display text,
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
Decision [0030](../decisions/0030-owned-structured-markdown-surfaces.md)
governs unboxed assistant prose, structured code and table surfaces, the exact
parser-owned accent mapping, responsive padding, tests, and removal.
Decision [0031](../decisions/0031-owned-terminal-palette-and-code-highlighting.md)
governs the steel-blue accent, closed syntax roles,
bounded language profiles, fallback, tests, and removal.
Decision [0032](../decisions/0032-owned-transcript-visual-refinement.md)
governs the responsive separator, compact fence density, navigation state,
restrained reference accent, tests, and removal.
Decision [0025](../decisions/0025-owned-word-aware-display-layout.md) governs
word boundaries, literal-code wrapping, continuation prefixes, tests, and
removal.
Decision [0026](../decisions/0026-owned-responsive-conversation-shell.md)
governs the conversation-first shell, generic panel, split-line,
horizontal-inset, and side-rail primitives, responsive priorities, truthful
footer, visual review, rollback, and removal.
Decision [0027](../decisions/0027-owned-semantic-state-chrome.md) governs the
header-free shell, neutral composer, semantic state colors, transcript spacing,
tests, rollback, and removal.
Decision [0028](../decisions/0028-owned-conversation-visual-grammar.md) governs
the empty state, role markers, ephemeral latest-tool activity,
composer surface, cursor lifecycle, reusable rhythm
primitives, tests,
rollback, and removal.
Decision [0033](../decisions/0033-owned-semantic-activity-surfaces.md) governs
the shared borderless activity surface, semantic backgrounds, italic tool
identity, approval hierarchy, tests, rollback, and removal.
Decision [0034](../decisions/0034-owned-slash-command-completion.md) governs
the canonical command catalog, contextual keys, Tab-without-submit behavior,
generic selection list, contrast refinement, tests, rollback, and removal.
Decision [0035](../decisions/0035-owned-multiline-composer-and-paste.md) governs
multiline composition, atomic bracketed paste, semantic word editing, bounds,
terminal lifecycle, tests, rollback, and removal.
Decision [0045](../decisions/0045-owned-terminal-interaction.md) governs mouse
lifecycle and decoding, logical selection, composer routing, scrolling, exact
visible HTTPS links, bounded clipboard copy, Shift fallback, tests, rollback,
and removal.
Decision [0038](../decisions/0038-owned-deterministic-tui-motion.md) records
deterministic phase ownership, scheduler bounds, terminal-event priority,
the generating pulse, static Phase 0, tests, rollback, and removal.
Decision [0039](../decisions/0039-owned-responsive-conversation-stage.md)
governs the shared fluid stage, stage-wide user regions, tests, rollback, and
removal. Decision [0040](../decisions/0040-owned-quiet-conversation-rhythm.md)
governs neutral input surfaces, transparent technical regions, compact completion, uniform
lower-shell rhythm, physical pulse alignment, tests, rollback, and removal.
Decision [0043](../decisions/0043-owned-conversation-density.md) governs the
frozen CLI density record, breathing user surfaces, compact activity surfaces,
identity-first clipping, focused composer padding, reference viewport matrix,
tests, rollback, and removal.

## Evidence

- Input protocol: `packages/agent-tui/src/input-decoder.ts`
- Bounded editor: `packages/agent-tui/src/line-editor.ts`
- Generic multiline input: `packages/agent-tui/src/input-area.ts`
- Generic layout: `packages/agent-tui/src/vertical-layout.ts`
- Generic component stack: `packages/agent-tui/src/component-stack.ts`
- Generic panel: `packages/agent-tui/src/panel.ts`
- Generic split line: `packages/agent-tui/src/split-line.ts`
- Generic three-column line: `packages/agent-tui/src/three-column-line.ts`
- Generic horizontal inset: `packages/agent-tui/src/horizontal-inset.ts`
- Conversation-stage projection: `packages/agent-cli/src/conversation-stage.ts`
- Conversation-stage tests: `packages/agent-cli/test/conversation-stage.test.ts`
- Generic side rail: `packages/agent-tui/src/side-rail.ts`
- Shared display layout: `packages/agent-tui/src/display-text.ts`
- Interactive Markdown projection: `packages/agent-tui/src/interactive-markdown.ts`
- Logical text interaction: `packages/agent-tui/src/text-interaction.ts`
- Planned-frame hit testing: `packages/agent-tui/src/text-hit.ts`
- Bounded terminal clipboard encoding: `packages/agent-tui/src/clipboard.ts`
- Platform clipboard port: `packages/agent-cli/src/platform-clipboard.ts`
- Platform clipboard protocol: `packages/agent-cli/src/platform-clipboard-protocol.ts`
- Owned native clipboard broker: `packages/agent-cli/native/clipboard`
- Bounded Markdown component: `packages/agent-tui/src/markdown-block.ts`
- Bounded Markdown parser: `packages/agent-tui/src/markdown-parser.ts`
- Bounded code highlighter: `packages/agent-tui/src/syntax-highlighter.ts`
- Semantic tones: `packages/agent-tui/src/tone.ts`
- Structured rows: `packages/agent-tui/src/rich-row.ts`
- Shared cell-width policy: `packages/agent-tui/src/cell-width.ts`
- Pure motion phases: `packages/agent-tui/src/motion.ts`
- Tone contract: `docs/decisions/0019-owned-semantic-terminal-tones.md`
- Scroll contract: `docs/decisions/0020-owned-scrollable-screen-foundation.md`
- Structured-row contract: `docs/decisions/0021-owned-structured-terminal-rows.md`
- Motion decision: `docs/decisions/0038-owned-deterministic-tui-motion.md`
- Motion scheduler: `packages/agent-cli/src/motion-scheduler.ts`
- Generic timer port: `packages/agent-cli/src/timer-clock.ts`
- Node timer adapter: `packages/agent-cli/src/node-timer-clock.ts`
- Ephemeral-notice decision: `docs/decisions/0041-owned-ephemeral-contextual-notices.md`
- Notice scheduler: `packages/agent-cli/src/notice-scheduler.ts`
- Tool-activity contract: `docs/decisions/0022-owned-tool-activity-surface.md`
- Markdown contract: `docs/decisions/0023-owned-bounded-markdown.md`
- Transcript-navigation contract: `docs/decisions/0024-owned-transcript-navigation.md`
- Display-wrapping contract: `docs/decisions/0025-owned-word-aware-display-layout.md`
- Conversation-shell contract: `docs/decisions/0026-owned-responsive-conversation-shell.md`
- Semantic-state contract: `docs/decisions/0027-owned-semantic-state-chrome.md`
- Conversation visual grammar: `docs/decisions/0028-owned-conversation-visual-grammar.md`
- Structured Markdown surfaces: `docs/decisions/0030-owned-structured-markdown-surfaces.md`
- Terminal palette and code highlighting: `docs/decisions/0031-owned-terminal-palette-and-code-highlighting.md`
- Transcript visual refinement: `docs/decisions/0032-owned-transcript-visual-refinement.md`
- Semantic activity surfaces: `docs/decisions/0033-owned-semantic-activity-surfaces.md`
- Slash-command completion: `docs/decisions/0034-owned-slash-command-completion.md`
- Quiet conversation rhythm: `docs/decisions/0040-owned-quiet-conversation-rhythm.md`
- Conversation density: `docs/decisions/0043-owned-conversation-density.md`
- Latin prose cell width: `docs/decisions/0044-owned-latin-prose-cell-width.md`
- Owned terminal interaction: `docs/decisions/0045-owned-terminal-interaction.md`
- Multiline composer, paste, and word editing: `docs/decisions/0035-owned-multiline-composer-and-paste.md`
- Generic surface: `packages/agent-tui/src/surface.ts`
- Composable text styles: `packages/agent-tui/src/text-style.ts`
- Generic spacer: `packages/agent-tui/src/spacer.ts`
- Final renderer: `packages/agent-tui/src/renderer.ts`
- Scroll state: `packages/agent-tui/src/scroll-state.ts`
- Generic scroll view: `packages/agent-tui/src/scroll-view.ts`
- Terminal host: `packages/agent-cli/src/node-terminal-host.ts`
- Product view composition: `packages/agent-cli/src/chat-view.ts`
- Product pointer routing: `packages/agent-cli/src/application.ts`
- Pointer gesture state: `packages/agent-cli/src/terminal-interaction.ts`
- Terminal-interaction regressions: `packages/agent-cli/test/terminal-interaction.test.ts`
- Product density policy: `packages/agent-cli/src/conversation-density.ts`
- Conversation document composition: `packages/agent-cli/src/conversation-view.ts`
- Activity document composition: `packages/agent-cli/src/activity-view.ts`
- Command completion composition: `packages/agent-cli/src/command-completion-view.ts`
- Tool-activity lifecycle: `packages/agent-cli/src/tool-activity-log.ts`
- Slash-command classifier: `packages/agent-cli/src/commands.ts`
- Generic selection list: `packages/agent-tui/src/selection-list.ts`
