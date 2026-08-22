# 03 - Terminal interface

## Composer

Type printable text in the interaction dock. Left/Right move one code point;
Ctrl+Left/Ctrl+Right move by words. Backspace/Delete remove one code point;
Ctrl+Backspace, Ctrl+W, and Ctrl+Delete remove one word. Home/End move to draft
boundaries. Enter submits a nonblank draft.

The composer grows from one to six visible rows and keeps the caret in view.
Typing or deleting replaces an active composer selection. Ctrl+C is cancellation
or idle exit, not a copy shortcut.

A bracketed paste is one atomic edit. Newlines, tabs, and control-looking bytes
remain text; paste never submits. Incomplete, malformed, or oversized paste is
discarded as a whole.

## Commands and selectors

Type `/` or a partial command to open completion. The commands are `/models`,
`/permissions`, `/thinking`, `/timeline`, and `/exit`. Up/Down moves without
wrapping, Tab completes without running, and Enter dispatches the selected exact
command.

Provider/model, permission, pending-tool, thinking, and timeline selectors reuse
the same dock. The draft is retained unchanged and the composer caret is absent.
Ordinary typing and editing are ignored until the selector is accepted or
cancelled. Up/Down navigates, Enter accepts, and Escape or Ctrl+C cancels.
Transcript selection, copying, and scrolling remain available.

`/models` presents two serial lists. The first contains authenticated runtime
providers; accepting one fetches only its fresh catalog. The second chooses a
model. Acceptance replaces provider and model together; cancellation or failure
preserves the prior pair. With no authenticated runtime provider, Agent directs
you to exit and run `agent auth`.

`/permissions` lists the six exact tools. Up/Down chooses a tool, Left/Right
changes `Deny`, `Ask`, or `Allow`, and Enter closes the editor. A pending request
instead offers `Allow once`, `Allow for session`, and `Deny`.

`/thinking` is idle-only after provider/model selection. It contains `Stream`
then `Effort`. Left/Right stages Stream `Off`/`On` and Effort `Off`/`Low`/
`Medium`/`High`; Enter applies both atomically and cancellation discards both.
Settings survive later model selections in the process but are not persisted.

`/timeline` is idle-only. It lists retained nodes in insertion order with depth,
active-tip, checkpoint, and branch markers. Selecting a node changes the visible
and model path, never tool execution or filesystem state.

## Transcript navigation and copy

Up/Down scrolls one row. Page Up/Page Down moves one page with one row of
overlap. Reaching the newest row or submitting a task restores automatic follow.

Left-drag selects conversation or composer text and copies it on release.
Double-click selects a whitespace or non-whitespace word; dragging the second
press extends by word runs. Copied text excludes wrapping padding and preserves
logical line breaks. The copy bound is 65,536 UTF-16 code units; larger ranges
remain selected and produce a warning instead of truncation.

Windows x64 reports `Copied!` only after its owned clipboard helper succeeds.
Other platforms report `Copy requested!` after a terminal OSC 52 request, which
the terminal may ignore. Hold Shift for the terminal’s native selection route.
Resize clears the application selection.

Only exact visible ASCII `https://` text may become a hyperlink to that same
address. Agent never hides a destination or opens a browser.

## Visual behavior

The transcript is the dominant surface. User text is italic steel-blue,
assistant prose is neutral, and native reasoning is a separate muted unboxed
segment. The dock stays between two light-blue rules. The terminal owns the
blinking block cursor in composer focus; selectors hide it.

The footer shows the workspace and selected provider/model. Non-default
thinking adds its current effort and stream state. A small pulse appears only
while autonomous work advances, never while permission is pending.

Only the latest tool activity appears near the composer. Patch permission may
show bounded red removed rows and green inserted rows. Activity and notices are
contextual, replace older feedback, and never enter conversation history.

The renderer accepts a bounded Markdown subset: headings, one-level lists and
quotes, matched code fences, same-line code/emphasis, strict pipe tables, and an
exact `---` separator. Malformed or unsupported syntax remains literal. Model
and tool text cannot supply terminal styling or control sequences.

## Recovery

- Copy failure is nonfatal; select less text or use the terminal’s Shift route.
- After a resize, release the pointer and create a new selection.
- During work, Ctrl+C cancels; while idle it exits.
- `/exit`, Ctrl+D, and EOF close Agent.
- A terminal failure takes the bounded shutdown path and still attempts to
  restore input, mouse, paste, cursor, style, and the previous screen.

See [Tools and permissions](04-tools-and-approval.md) and
[Providers and authentication](05-providers-and-authentication.md) for the
authority behind the selectors.
