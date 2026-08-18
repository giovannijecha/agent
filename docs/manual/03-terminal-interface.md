# 03 - Terminal interface

## Write and edit

Type printable text in the composer. Left and Right move one code point;
Ctrl+Left and Ctrl+Right move by whitespace-delimited words. Backspace and
Delete remove one code point. Ctrl+Backspace, Ctrl+W, and Ctrl+Delete remove one
word. Home and End move to the draft boundaries. Enter submits a nonblank
draft.

The composer grows from one to six visible rows and keeps the caret in view.
Typing or deleting replaces an active composer selection. Ctrl+C cancels
active work and exits while idle; it is not a copy shortcut.

## Paste text

A bracketed paste is one atomic edit. Newlines and tabs remain draft content,
and control-looking bytes inside the paste are not interpreted as commands or
keys. Paste never submits: type Enter separately after reviewing the draft.

An incomplete, malformed, or oversized paste is discarded as a whole. It
cannot leave a partial draft or start a turn.

## Run commands

Type `/` or a partial exact command name to open completion. The maintained
commands are `/providers`, `/models`, `/permissions`, `/timeline`, and `/exit`.

While completion is visible:

- Up and Down move the selected row without wrapping;
- Tab places the selected command in the composer without running it; and
- Enter runs the selected exact command through the normal dispatcher.

Unknown commands produce a short warning. Command feedback is contextual and
does not enter the transcript.

## Use selectors

`/providers` and `/models` use the same list controls: Up and Down move without
wrapping, and Enter selects the current row. Selecting an unconfigured provider
opens a concealed credential editor. Its context identifies the provider and
marks the credential as process-only; the composer prompt reads
`Enter API key · Ctrl+C cancels`. Enter accepts the key and Ctrl+C cancels the
credential edit. See [Providers and authentication](05-providers-and-authentication.md)
for provider and model rules.

`/permissions` lists the six tools. Up and Down choose a tool, Left and Right
change its `Deny`, `Ask`, or `Allow` mode, and Enter closes the editor. A pending
tool decision instead shows `Allow once`, `Allow for session`, and `Deny`; Up
and Down choose an action and Enter resolves it. See
[Tools and permissions](04-tools-and-approval.md) for the authority each choice
grants.

`/timeline` is available only while idle. It lists the root and every retained
settled turn in insertion order, with indentation for depth and markers for the
active path tip, checkpoints, and alternate children. Up and Down move without
wrapping, Enter selects, and Ctrl+C closes the selector. Selecting the root
makes the next task a new root branch. Timeline state is process-only and is
not session persistence.

## Navigate and copy

Use Up and Down to scroll the transcript by one row. Page Up and Page Down move
by one visible page with one row of overlap. Reaching the newest row restores
automatic follow; submitting a new task also returns there. Transcript
navigation never changes the draft or caret.

In an interactive terminal, left-drag selects conversation or composer text
and copies it on release. Double-click selects one whitespace or non-whitespace
word; holding the second press and dragging extends the selection by whole word
runs. Copied text omits soft wrapping and layout padding while preserving
source line breaks and message order. Selection is bounded to 65,536 UTF-16
code units; a larger range remains selected and produces a warning instead of
being truncated.

Windows x64 reports `Copied!` only after the owned clipboard transfer succeeds.
Other platforms report `Copy requested!` after writing a bounded terminal copy
request, which the terminal may still ignore. `Copy failed!` is nonfatal. Hold
Shift while selecting to use the terminal's optional native selection path.
Resizing clears selection because wrapping geometry changed.

Exact visible ASCII text beginning with `https://` may be exposed as a terminal
hyperlink to that same address. The terminal controls the activation gesture
and confirmation; Agent never launches a browser.

## Read the interface

The transcript is the dominant region. User requests use italic steel-blue
text, assistant prose is neutral, and neither carries a role label or box. The
composer remains fixed between two light-blue rules. The footer shows the
workspace and selected provider/model; its right edge contains a small moving
pulse only while autonomous work advances. Permission waiting is not active
motion.

Only the latest tool activity appears near the composer during an active turn.
Its mark and written state carry success, attention, or failure color. Pending
patch permission may show bounded red removed rows and green added rows. Tool
activity disappears when the turn settles and never becomes transcript
history. Details and approval behavior are documented in
[Tools and permissions](04-tools-and-approval.md).

The latest informational or warning notice appears contextually and is replaced
by newer feedback. It expires after five seconds or on the next editor
interaction. Empty sessions do not add a welcome panel or embedded help.

Conversation text recognizes a bounded Markdown subset: headings, one-level
lists and quotes, matched code fences, same-line code and emphasis, strict pipe
tables, and an exact `---` separator. Unsupported or malformed syntax remains
literal. Recognized fenced languages may receive bounded lexical highlighting;
display styling never executes code or changes model text.

## Recover from terminal problems

- A copy warning or failure does not close Agent; retry with a smaller range or
  use Shift with the terminal's native selection.
- If input and output stop matching after a resize, release the pointer and
  create a new selection from the current layout.
- During active work, Ctrl+C requests cancellation and keeps Agent open. At
  idle, Ctrl+C exits. `/exit`, Ctrl+D, or EOF also closes the application.
- Display, layout, or output failures stop through a bounded failure path.
  Shutdown still attempts to restore raw input, mouse and paste modes, cursor
  style and visibility, and the previous screen.

## References

- [Current TUI and CLI architecture](../ARCHITECTURE.md#terminal-boundary)
- [Interactive terminal maintenance](../MAINTENANCE.md#interactive-terminal)
- [Vertical TUI maintenance](../MAINTENANCE.md#vertical-tui-framework)
- [Current terminal authority](../decisions/README.md#current-authority-by-domain)
- [Slash completion decision](../decisions/0034-owned-slash-command-completion.md)
- [Composer and paste decision](../decisions/0035-owned-multiline-composer-and-paste.md)
- [Terminal interaction decision](../decisions/0045-owned-terminal-interaction.md)
- [Conversation focus decision](../decisions/0059-owned-accented-conversation-focus.md)
- [Branching conversation-tree decision](../decisions/0075-owned-branching-conversation-tree.md)
