# 0035: Owned multiline composer, atomic paste, and word editing

- Status: accepted
- Date: 2026-08-11
- Composer surface amended by: decision 0040

Decision 0040 replaces the original enclosing `Panel` below with one
stage-wide borderless neutral `Surface`; `InputArea`, editor ownership, bounds,
paste semantics, and caret behavior remain unchanged.

## Context

The original editor and `InputLine` were deliberately single-line. Human
terminal review found two concrete limits once the conversation surface became
usable: a long draft scrolled horizontally instead of giving the operator room
to read it, and terminal paste containing a newline was decoded as ordinary
`Enter` input. A multiline paste could therefore submit a partial draft and
dispatch following lines as additional turns.

The correction must remain terminal-agnostic above the renderer, bounded at
every layer, and reusable outside the agent product. It cannot depend on a
terminal library, a timing heuristic, or application-side filtering after a
submission has already occurred.

## Decision

The renderer owns terminal bracketed-paste mode for the same alternate-screen
session in which it owns cursor style and synchronized output. It enables the
mode before accepting input and disables it during every successful cleanup.
The incremental input decoder recognizes only the standard bracketed-paste
begin and end delimiters. Bytes inside the delimiters are accumulated as one
bounded payload and emitted as one immutable `paste` event. Carriage-return
forms normalize to line feed. Paste content is never interpreted as keys,
commands, escape sequences, interrupts, EOF, or submission.

The bounded editor accepts a `paste` event atomically. Printable text, line
feeds, and tabs are valid draft content; unsupported controls or an exceeded
code-point limit reject the complete paste without changing the draft. Typed
`Enter` remains the only submission key. Existing left, right, home, end,
backspace, and delete operations remain code-point based over the complete
draft.

The decoder additionally maps the admitted terminal encodings for Ctrl+Left,
Ctrl+Right, Ctrl+Backspace, Ctrl+W, and Ctrl+Delete into semantic word-editing
events. A word boundary is a run of spaces, tabs, or line feeds; every other
code point belongs to the adjacent word. Movement and deletion first cross
immediate whitespace and then one word. The editor owns this rule, so terminal
escape syntax never leaks into the CLI or application reducer.

The TUI adds one generic `InputArea` component beside the retained one-row
`InputLine`. Its synchronous projection contains printable rows and one local
caret. The CLI composer uses `InputArea` inside the existing generic `Panel`.
It grows from one through six content rows, wraps at owned terminal-cell
boundaries, expands tabs through the one display policy, and then retains only
the caret-visible tail window. No prompt marker, scrollbar, modal editor, or
second application state is introduced.

## Bounds, failures, and lifecycle

One terminal input chunk and one paste payload are each limited to 65,536
UTF-16 code units. The editor remains limited to 4,096 Unicode code points.
The composer exposes at most six content rows and never exceeds existing frame,
component, row, span, or line bounds. An over-limit or malformed paste is
discarded through one content-free `unsupported` or `limit` result. An
unterminated paste is reported as unsupported when the input source ends.

The renderer marks bracketed-paste mode as possibly active before the enabling
write settles, so cleanup also disables it after a partial or failed initial
write. Cleanup remains serialized and retryable. It restores styles, cursor
shape, cursor visibility, paste mode, and the alternate screen without
retaining draft or paste content in errors.

## Verification

Decoder tests cover delimiter fragmentation at every split, multiline and
control-looking payloads, normalization, overflow, incomplete input, every
admitted word-editing mapping, and fragmented control sequences. Editor tests
cover atomic insertion, rejection, wrapping, tabs, Unicode cell width, caret
visibility, the six-row window, and word movement or deletion across spaces,
tabs, line feeds, and draft boundaries. Generic component tests cover
measurement, constrained rendering, invalid projection containment, and caret
mapping. CLI tests prove multiline paste creates no submission until a later
typed `Enter`, then creates exactly one action with the complete draft, and
prove composer growth and its cap. Renderer byte-contract tests prove enable,
failure recovery, disable, retry, and idempotent cleanup. The canonical
Windows and Linux verifier remains the release gate.

## Update, rollback, and removal

Changing paste delimiters, normalization, draft bounds, wrapping, row cap,
word boundaries, control mappings, or submission semantics requires this
decision, decoder, editor, component, CLI composition, manual, architecture,
and tests to change together.

To remove multiline composition, replace the CLI `InputArea` with `InputLine`,
remove the area projection and component, and restore rejection of line feeds
and tabs in drafts. To remove paste support, first disable bracketed-paste mode
in renderer startup and cleanup, then remove the decoder event and editor path.
To remove word editing, remove the semantic events and admitted decoder mappings
before removing the corresponding editor branches and focused tests.
The conversation, Markdown, runtime, tool, provider, layout, panel, renderer,
and one-row input primitives remain independently usable.
