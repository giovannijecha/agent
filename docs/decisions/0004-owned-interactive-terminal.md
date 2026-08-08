# 0004: Owned asynchronous interactive terminal

- Status: accepted
- Date: 2026-08-07

## Context

The foundation renderer can draw a safe frame, but it has no terminal input,
viewport height, visible editing cursor, resize handling, raw-mode lifecycle, or
honest output-completion contract. Its synchronous `flush` operation cannot
represent Node stream completion. Calling it repeatedly from input and resize
callbacks would also permit overlapping state transitions.

The first interactive milestone must remain useful without pretending that a
model or subscription provider is configured. It must preserve the existing
package direction: generic terminal mechanics belong to `@agent/tui`, product
commands and Node streams belong to `@agent/cli`, and `@agent/core` remains
unchanged.

## Decision

Build an asynchronous, serialized terminal session inside the existing TUI and
CLI workspaces.

`@agent/tui` owns:

- an incremental, bounded key decoder;
- a bounded single-line editor using Unicode code-point boundaries;
- validated viewports and atomic frames with an optional caret;
- asynchronous ordered text output;
- differential alternate-screen rendering and idempotent cleanup.

`@agent/cli` owns:

- the exact `/help`, `/providers`, and `/exit` terminal commands; decision 0008
  later adds contextual `/approve` and `/deny` application commands;
- application notices and frame composition;
- a FIFO terminal-event host over narrow `stdin` and `stdout` capabilities;
- raw-mode, listener, resize, EOF, and shutdown lifecycle;
- plain output with no ANSI when either stream is not a TTY.

`/exit` is the only command that exits. `/quit` is not an alias. Ordinary input
is discarded after a notice that no model is configured; it is never persisted,
logged, or added to a conversation.

One host event and one output write are processed at a time. A resolved output
success means the Node write callback completed without an error. A callback
error settles the write even when the stream emits no separate error event;
settlement never depends on that optional second signal. Shutdown first stops
input and restores cooked mode, then restores the cursor and leaves the
alternate screen. Primary and cleanup failures remain separately observable.

Each write owns a temporary output-error listener for its complete lifetime, so
plain non-TTY output and renderer cleanup remain inside the typed failure
contract. The input queue is bounded by both event count and aggregate payload;
overflow discards queued personal text before returning an owned error.

The milestone deliberately does not add a workspace, model, provider adapter,
history, multiline editing, completion, mouse support, persistence, colors, or
tool execution.

Because the shell no longer imports domain state, its inactive local dependency
on `@agent/core` is removed. Core continues to build and test independently; the
CLI edge is restored only with the first real model-runtime composition.

## Security boundary

Raw terminal bytes are decoded before they can become editable text. Unknown or
incomplete control sequences never enter a frame. Frame validation remains the
last defense against ANSI injection. Input, escape buffering, frames, and
notices are bounded.

The CLI continues to use named `node:process` exports only. It does not receive a
broad process object merely to install signal handlers. Ctrl+C, Ctrl+D, stdin
EOF, input failures, output failures, and `/exit` use the owned cleanup path.
Forced process termination cannot be cleaned up in-process and remains a
platform limitation.

## Consequences

The output contract and renderer become asynchronous, so all current callers and
tests change together. The event queue adds a small amount of owned code but
prevents input, resize, and redraw races.

Width calculation remains conservative: printable ASCII occupies one cell and
other code points occupy two. Editing never splits UTF-16 surrogate pairs, but
full grapheme-cluster and Unicode-width tables are deferred until they can be
implemented and maintained as an owned capability.

## Update, rollback, and removal

Update terminal sequences only with contract tests for fragmented input,
rendered bytes, partial failures, and cleanup. Roll back by restoring the
one-shot renderer and plain startup behavior together; do not retain dormant
interactive modules.

To remove the interactive terminal, delete the decoder, editor, viewport,
session, view, and Node host modules; restore the plain CLI entry point and
synchronous renderer contract; remove this decision from the ownership registry;
then regenerate derived artifacts and run the canonical verifier.
