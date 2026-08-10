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
closes the application. Up and Down are intentionally unsupported.

## Guarantees and limits

Input decoding is incremental across fragmented terminal chunks. The editor is
bounded and Unicode-code-point aware. The vertical framework allocates header,
transcript, status, one generic component stack, and prompt without product
logic entering the generic TUI package. Untrusted text is normalized and
sanitized before the frame performs a final control-character check. Rendering
is serialized, differential, and commits its snapshot only after a complete
successful write.

The visual language is deliberately small. Cyan marks product identity and the
focused input row, dim text marks passive status and the current phase, yellow
marks approval-sensitive tool state, and ordinary conversation remains plain.
One row may contain multiple immutable semantic spans, so the product name and
its quieter phase remain a single stable header. Empty spans are removed,
adjacent equal roles are merged, and each row is bounded before composition.
These are semantic roles, not model-controlled colors. Only the renderer creates
ANSI sequences and it resets style after each emphasized span and before
terminal ownership is returned.

Tool activity uses one quiet vertical rail for every registered tool. Newest
activity appears first. The header shows the canonical tool name, risk, and
explicit lifecycle state; the optional line below shows only the descriptor-
declared safe approval scope. In a short viewport the scope collapses before the
header. The current turn remains visible after settlement until the next turn is
accepted. Call identifiers, raw arguments, output, provider data, credentials,
and failure causes are never displayed.

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
synchronized redraw and the reusable scroll foundation. Product keyboard
navigation is not connected in this first foundation increment. Decision
[0021](../decisions/0021-owned-structured-terminal-rows.md) governs the one
canonical structured-row representation, its bounds, clipping, and removal.
Decision [0022](../decisions/0022-owned-tool-activity-surface.md) governs the
generic component stack and the CLI-owned activity surface.

## Evidence

- Input protocol: `packages/agent-tui/src/input-decoder.ts`
- Generic layout: `packages/agent-tui/src/vertical-layout.ts`
- Generic component stack: `packages/agent-tui/src/component-stack.ts`
- Semantic tones: `packages/agent-tui/src/tone.ts`
- Structured rows: `packages/agent-tui/src/rich-row.ts`
- Tone contract: `docs/decisions/0019-owned-semantic-terminal-tones.md`
- Scroll contract: `docs/decisions/0020-owned-scrollable-screen-foundation.md`
- Structured-row contract: `docs/decisions/0021-owned-structured-terminal-rows.md`
- Tool-activity contract: `docs/decisions/0022-owned-tool-activity-surface.md`
- Final renderer: `packages/agent-tui/src/renderer.ts`
- Scroll state: `packages/agent-tui/src/scroll-state.ts`
- Generic scroll view: `packages/agent-tui/src/scroll-view.ts`
- Terminal host: `packages/agent-cli/src/node-terminal-host.ts`
- Product view composition: `packages/agent-cli/src/chat-view.ts`
- Tool-activity lifecycle: `packages/agent-cli/src/tool-activity-log.ts`
- Slash-command classifier: `packages/agent-cli/src/commands.ts`
