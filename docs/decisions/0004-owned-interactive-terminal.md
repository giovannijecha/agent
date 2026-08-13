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
- an initially single-line bounded editor using Unicode code-point boundaries,
  later extended by decision 0035 through the same editor contract;
- validated viewports and atomic frames with an optional caret;
- asynchronous ordered text output;
- differential alternate-screen rendering and idempotent cleanup.

`@agent/cli` owns:

- the exact `/help`, `/providers`, and `/exit` terminal commands; decision 0008
  later adds contextual `/approve` and `/deny` application commands. Decision
  0028 later removes the duplicated `/help` surface;
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

Decision 0028 later selects a steady block cursor for the interactive session.
The renderer emits the closed standard cursor-shape command only while it owns
the alternate screen and restores the terminal-default shape during the same
idempotent cleanup that restores visibility. Unsupported terminals may ignore
the shape command; no custom glyph enters editor or frame content.

The milestone deliberately did not add a workspace, model, provider adapter,
history, multiline editing, pasted-text batching, completion, mouse support,
persistence, colors, or tool execution. Decision 0035 later adds bounded
multiline projection and atomic bracketed paste without changing this terminal
ownership boundary.

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

Width calculation initially remained conservative: printable ASCII and the
exact closed framework-owned box glyph set `─│┌┐└┘` occupied one cell and every
other code point occupied two. Decision 0044 later admits one exact
precomposed-Latin prose profile through the same shared function; all remaining
unregistered non-ASCII scalars retain the two-cell fallback. Editing never
splits UTF-16 surrogate pairs, but full grapheme-cluster and Unicode-width
tables remain deferred until they can be implemented and maintained as an
owned capability.

## Update, rollback, and removal

Update terminal sequences only with contract tests for fragmented input,
rendered bytes, cursor style, partial failures, and cleanup. Remove a custom
cursor style by deleting its selection and default-style restoration sequences
together. Roll back by restoring the
one-shot renderer and plain startup behavior together; do not retain dormant
interactive modules.

To remove the interactive terminal, delete the decoder, editor, viewport,
session, view, and Node host modules; restore the plain CLI entry point and
synchronous renderer contract; remove this decision from the ownership registry;
then regenerate derived artifacts and run the canonical verifier.
