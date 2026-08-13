# 0045: Owned terminal interaction

- Status: accepted
- Date: 2026-08-13

## Context

The conversation TUI already owns the alternate screen, raw input, bracketed
paste, cell measurement, scrolling, differential rendering, and cleanup. The
terminal host could still select only the current screen buffer. Long messages
therefore could not retain one selection while the transcript scrolled, the
composer offered no pointer editing, and visible references were not explicit
terminal hyperlinks.

Adding a terminal framework, foreign clipboard library or executable, browser
launcher, or separate Windows and Linux UI would violate the owned zero-
dependency boundary. Storing selection as screen coordinates would also make it
incorrect after scrolling or wrapping. The feature needs one logical selection
contract, with generic VT transport and a narrowly owned platform clipboard
boundary where the terminal cannot confirm OSC 52.

## Decision

The interactive renderer owns DEC button-event tracking mode 1002 and SGR
mouse mode 1006 for the same alternate-screen lifetime as bracketed paste. It
enables both before interactive input can be handled, marks them as possibly
active before the initial write settles, and disables both during every
successful cleanup. Windows and Linux use this same VT contract. No platform
mouse hook, global desktop capture, terminal-specific package, or parallel
input path is introduced.

The incremental TUI decoder accepts only bounded SGR reports of the form
`CSI < button ; column ; row M` or `m`. It converts one-based cells to
zero-based immutable pointer events and exposes only closed button, motion,
wheel, modifier, press, and release values. Malformed, overlong, zero,
out-of-range, unsupported-button, and non-SGR mouse reports become the existing
content-free unsupported event. Mouse syntax never enters the editor or CLI as
text.

The CLI single writer routes a pointer event against the exact latest planned
frame. Transcript hit testing uses renderer-bound semantic text references,
not copied product coordinates. Each selectable Markdown document receives one
CLI-owned stable numeric identity. The shared display compiler assigns
monotonic offsets to visible content before wrapping; wrapping, surfaces,
horizontal insets, component stacks, scrolling, frames, and clipping preserve
those references. Layout-only padding and continuation indentation remain
unselectable. A selection stores two logical document offsets, so scrolling
does not change its meaning. Resize clears the selection because it replaces
the wrapped projection rather than guessing across changed geometry.

A left press starts a linear selection, reported motion extends it, and release
settles and copies it. Wheel input over the transcript reuses its one
`ScrollState`; there is no second scrollbar or offset. A second left press on
the same logical position within 500 milliseconds selects the maximal
whitespace-delimited word defined by the existing editor rule. Holding that
second press and moving extends the range by complete whitespace or non-
whitespace runs; release settles and copies the resulting range. Any
intervening non-pointer input, resize, different position, or expired interval
breaks the double-click candidate. Selection rendering is one independent
closed span dimension and never changes foreground tone, slant, semantic
surface, retained text, or model state.

The same generic `LineEditor` owns composer anchor, focus, and replacement.
Pointer hit testing converts the latest exact `InputArea` projection to a code-
point boundary. A press moves the caret, a drag selects, and a double click
selects through the editor's existing whitespace word rule. Holding the second
press and moving extends through complete word runs through that same editor.
Typed text, paste, Backspace, Delete, and word deletion replace or remove the
active range through that one editor. Submission still requires a separately
decoded Enter and clears the draft selection.

Settling a non-empty selection creates one bounded clipboard operation. Copy
text is reconstructed from logical offsets: soft wrapping adds no newline,
source logical breaks add one, and layout padding is excluded. The request is
limited to 65,536 UTF-16 code units.

On Windows x64, the CLI invokes one generated C17 clipboard broker by its exact
package-relative path with no arguments, shell, PATH lookup, inherited
environment, or retained service. The broker accepts one versioned bounded
UTF-16LE frame on stdin, rejects malformed scalars, trailing bytes, extra
arguments, and oversized input, creates one hidden owned window, and calls
`OpenClipboard`, `EmptyClipboard`, and `SetClipboardData(CF_UNICODETEXT)` with
`GMEM_MOVEABLE` memory. Clipboard contention receives only a fixed bounded
retry. Exit success confirms that Windows accepted the data and transferred
memory ownership; only then does the CLI settle the existing ephemeral notice
as `Copied!`.

On platforms without an admitted native clipboard broker, the serialized
renderer emits the existing owned UTF-8/Base64 OSC 52 request terminated with
ST. Output success confirms only that terminal bytes were accepted, so the
truthful notice is `Copy requested!`; it does not claim host acceptance.
Unsupported hosts may ignore it. Failure shows `Copy failed!` and keeps the
application open. No copy path claims success before its authoritative boundary
settles.

Clipboard settlement presentation uses the notice system's closed `composer`
placement without adding a row between transcript and composer. Confirmed,
requested, and failed outcomes become `Copied!`, `Copy requested!`, and `Copy
failed!` respectively. The generic input area paints the status at its right
edge only when it fits after the draft; it never reserves width, changes editor
projection, moves the caret, changes composer height, or displaces transcript
content. Expiry and input dismissal reuse the one existing notice generation
and scheduler.

Exact visible ASCII `https://` references are split by the display compiler
and carry one validated destination equal to their rendered text. The renderer
emits OSC 8 only around those spans and closes it before any style reset or
different span. Markdown labels, hidden destinations, non-HTTPS schemes,
control characters, credentials in the URI authority, model-selected styling, and browser process
launch are excluded. The terminal host owns the activation gesture and its
security UI.

While mouse mode is active, `agent` receives ordinary pointer reports inside
its alternate screen. Application selection and automatic copy are the primary
path. The host-documented Shift modifier remains an optional native-selection
escape hatch and is documented rather than intercepted; it is not required for
application copy and does not change Ctrl+C from the agent interrupt. Terminal
hyperlink gestures also remain host-owned. `agent` never claims global mouse
priority outside its alternate screen.

## Bounds, security, and failures

Coordinates cannot exceed the existing 16,384-column and 4,096-row TUI limits.
Document identities and offsets are non-negative safe integers. Hyperlinks are
printable ASCII HTTPS targets no longer than 2,048 code units. Selection and
copy operate only over already validated visible spans; they do not retain
terminal input, rejected targets, hidden Markdown, credentials, ANSI, or an
unbounded screen transcript.

Pointer timestamps originate at the CLI platform boundary from one monotonic
clock value carried with the host input event. Pure reducers receive that value
explicitly. They do not consult ambient time or schedule a private timer.

Only the renderer emits terminal control sequences. Partial initialization and
write failure leave mouse modes marked for retryable cleanup. The Windows
clipboard broker is the sole admitted platform-native copy executable and
receives no model-controlled field, path, argument, environment, or limit.
Launch, timeout, protocol, operating-system, and renderer failures collapse to
content-free copy failure and do not exit the application. An over-limit
selection remains visible but produces one bounded notice instead of truncating
copied personal content. Unknown terminal support never causes a shell, foreign
helper executable, network request, environment probe, or silent fallback that
claims success.

## Verification

Focused TUI tests prove fragmented and coalesced SGR reports, every closed
button/modifier/motion form, coordinate and sequence limits, interaction
metadata validation and preservation, soft-wrap offsets, padding exclusion,
hyperlink validation, exact OSC 8 closure, selection styling, owned UTF-8 and
Base64 vectors, OSC 52 bounds, renderer initialization failure, cleanup retry,
and idempotent finish.

Editor tests prove click positioning, drag ranges, whitespace word selection,
word-wise double-click drag, replacement, deletion, paste, multiline wrapping,
wide cells, empty drafts, and caret-visible projection. CLI tests prove exact
planned hit geometry, persistent selection through transcript wheel scrolling,
double-click timing, resize reset, cross-message copy order, composer routing,
link spans, Shift escape-hatch documentation, confirmed, requested, and failed
composer-edge feedback without layout movement, and serialized copy output.
Native tests prove exact frame validation, hidden-
window implementation contract, contention bounds, no-argument invocation, and
backend handoff without touching the operator clipboard. Manual Windows review
proves the real clipboard result. Existing terminal, Markdown, scroll, renderer,
privacy, and application tests remain required. The canonical Windows and Linux
verifier is the release gate, followed by manual review in Windows Terminal and
one SGR/OSC-capable Linux terminal.

## Update, rollback, and removal

Changing a mode, report grammar, coordinate bound, timestamp rule, word rule,
logical-offset mapping, link grammar, clipboard frame, native API, retry or
timeout, copy limit, host fallback, notice truth or placement, or cleanup order requires this
decision, native and TypeScript protocol tests, editor and display tests, CLI
integration, manual, architecture, maintenance, privacy, and ownership policy
to change together.

To remove Windows clipboard integration, remove its CLI boundary and native
build target together, then retain the truthful OSC 52 requested path. To
remove all clipboard copy, remove application settlement and notices before the
OSC 52 renderer operation while retaining logical selection. To remove
hyperlinks, delete the HTTPS splitter and OSC 8 span metadata together. To
remove composer selection, delete its pointer routing before removing editor
ranges. To remove all pointer interaction, disable modes 1002 and 1006 first,
remove the SGR decoder events, logical references and selection state, then
remove this decision and its registrations. Keyboard editing, transcript
navigation, Markdown, rendering, raw-mode lifecycle, and native Shift selection
remain independently usable.
