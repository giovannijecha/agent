# 03 - Terminal interface

## Purpose

Use this chapter to operate the owned terminal UI and understand its editing,
layout, rendering, input, and cleanup boundaries.

## Operator workflow

Start with `npm start` in a terminal. Type printable text and edit one line with
Left, Right, Home, End, Delete, and Backspace. Enter submits. `/help` shows the
current command reference, `/providers` shows integration availability,
`/approve` and `/deny` resolve one pending write-tool request, and `/exit`
closes the application. Up and Down are intentionally unsupported.

## Guarantees and limits

Input decoding is incremental across fragmented terminal chunks. The editor is
bounded and Unicode-code-point aware. The vertical framework allocates header,
transcript, status, tool status, and prompt without product logic entering the
generic TUI package. Untrusted text is normalized and sanitized before the frame
performs a final control-character check. Rendering is serialized, differential,
and commits its snapshot only after a complete successful write.

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
for framework changes.

## Evidence

- Input protocol: `packages/agent-tui/src/input-decoder.ts`
- Generic layout: `packages/agent-tui/src/vertical-layout.ts`
- Final renderer: `packages/agent-tui/src/renderer.ts`
- Terminal host: `packages/agent-cli/src/node-terminal-host.ts`
- Product view composition: `packages/agent-cli/src/chat-view.ts`
- Slash-command classifier: `packages/agent-cli/src/commands.ts`
