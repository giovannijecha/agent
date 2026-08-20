# 03 - Terminal interface

## Write and edit

Type printable text in the composer. Left and Right move one code point;
Ctrl+Left and Ctrl+Right move by whitespace-delimited words. Backspace and
Delete remove one code point. Ctrl+Backspace, Ctrl+W, and Ctrl+Delete remove one
word. Home and End move to the draft boundaries. Enter submits a nonblank
draft.

The ruled interaction dock shows the composer while editor focus is active. It
grows from one to six visible rows and keeps the caret in view. Typing or
deleting replaces an active composer selection. Ctrl+C cancels active work and
exits while idle; it is not a copy shortcut.

## Paste text

A bracketed paste is one atomic edit. Newlines and tabs remain draft content,
and control-looking bytes inside the paste are not interpreted as commands or
keys. Paste never submits: type Enter separately after reviewing the draft.

An incomplete, malformed, or oversized paste is discarded as a whole. It
cannot leave a partial draft or start a turn.

## Run commands

Type `/` or a partial exact command name to open completion. The maintained
commands are `/providers`, `/models`, `/permissions`, `/thinking`, `/timeline`,
and `/exit`.

While completion is visible:

- Up and Down move the selected row without wrapping;
- Tab places the selected command in the composer without running it; and
- Enter runs the selected exact command through the normal dispatcher.

Unknown commands produce a short warning. Command feedback is contextual and
does not enter the transcript.

## Use selectors

Provider, model, permission, pending-tool, thinking, and timeline selectors
replace the composer body inside the same two rules. The dock shows at most six content
rows: an optional header and up to five windowed choices. The current choice
stays visible and accented; the composer caret is absent. The draft remains
unchanged. Printable and editing input is inert while a dismissible selector
owns focus; accepting or cancelling input is consumed without editing the
retained draft. Pointer input cannot edit or copy the draft until editor focus
returns. Transcript selection, copying, and wheel scrolling remain available
while a selector owns the dock. Pointer input is interpreted against the dock
focus that is visible on screen, including when keyboard and mouse bytes arrive
in one input chunk. Clipboard settlement feedback remains visible at the
selector header's right edge until it expires; it does not reveal the retained
draft or restore a composer caret. On a narrow terminal, that feedback takes
display priority over the selector title.

`/providers` and `/models` use the same list controls: Up and Down move without
wrapping, and Enter selects the current row. Selecting an unconfigured provider
opens a concealed credential editor. Its context identifies the provider and
marks the credential as process-only; the composer prompt reads
`Enter API key · Ctrl+C cancels`. Enter accepts the key and Ctrl+C cancels the
credential edit. The caret remains keyboard-owned, but pointer input cannot
position, select, or copy concealed credential text; transcript selection and
copying remain available. Clipboard settlement feedback temporarily replaces
the entry prompt without revealing the credential. See
[Providers and authentication](05-providers-and-authentication.md) for provider
and model rules.

`/permissions` lists the six tools. Up and Down choose a tool, Left and Right
change its `Deny`, `Ask`, or `Allow` mode, and Enter closes the editor. A pending
tool decision instead shows `Allow once`, `Allow for session`, and `Deny`; Up
and Down choose an action and Enter resolves it. See
[Tools and permissions](04-tools-and-approval.md) for the authority each choice
grants.

`/thinking` is available only while idle after a provider and model are
selected, and shows exactly two rows: `Stream` then `Effort`. If the provider is
missing it directs you to `/providers`; if only the model is missing it directs
you to `/models`. Up and Down select a row without wrapping. Left and Right
stage Stream as `Off` or `On`, or Effort as `Off`, `Low`, `Medium`, or `High`,
without wrapping. Enter applies both staged values atomically. Escape or Ctrl+C
discards both staged changes. Both settings default to `Off` and remain
unchanged when another model is selected in the same process.

Effort controls later native thinking requests. Stream only controls transcript
visibility: `Off` hides all reasoning on the selected conversation path without
deleting it, while `On` reveals retained and prospective reasoning separately.
Hidden settled reasoning can still enter provider history and the local session
journal for tool continuation and resume. If a newly selected model rejects the
retained Effort, the turn fails without retry, fallback, or settings mutation.

`/timeline` is available only while idle. It navigates the root and every
retained settled turn in insertion order through a bounded moving window, with
indentation for depth and markers for the active path tip, checkpoints, and
alternate children. Up and Down move without wrapping and reveal earlier or
later rows as needed, Enter selects, and Ctrl+C closes the selector. Selecting
the root makes the next task a new root branch. An accepted selection updates
the active-node pointer in the local session journal; it still does not rerun
tools or restore old workspace state.

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
text, assistant prose is neutral, native reasoning is muted in a separate
unboxed segment, and none carries a role label. The
interaction dock remains fixed between two light-blue rules. In editor focus
its caret uses the terminal's blinking block cursor; in selection focus the
caret is absent and the terminal cursor remains hidden rather than moving onto
the footer or another visible row. Agent does not simulate the blink, and a
terminal that does not support shape selection may retain its native cursor
shape while preserving the same visibility contract.
When a provider, model, permission, thinking, or timeline menu occupies the
dock, Up and Down move its selection and Enter accepts the current choice. Left
and Right change the highlighted permission in `/permissions` or the staged row
value in `/thinking`. Escape or Ctrl+C cancels the menu and restores the
unchanged draft. Cancelling `/thinking` also discards its staged values. Other
typing and editing keys are ignored while the menu remains open, so an
accidental character neither closes the menu nor disappears into the composer.
Page Up and Page Down continue to navigate the transcript.
The footer shows the workspace and selected provider/model. A non-default
thinking pair adds its current effort and stream state. The right edge contains
a small moving pulse only while autonomous work advances. Permission waiting is
not active motion.

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
- [Durable-session decision](../decisions/0076-owned-bounded-session-journal.md)
- [Blinking-block cursor decision](../decisions/0077-owned-terminal-blinking-block-cursor.md)
- [Interaction-dock focus decision](../decisions/0078-owned-interaction-dock-focus.md)
- [Explicit-selector dismissal decision](../decisions/0079-owned-explicit-selector-dismissal.md)
- [Structural manual-policy decision](../decisions/0081-owned-structural-manual-policy.md)
- [Bounded-thinking decision](../decisions/0083-owned-bounded-thinking-stream.md)
- [Thinking effort and display decision](../decisions/0086-owned-thinking-effort-and-display.md)
- [Reasoning-journal decision](../decisions/0085-owned-reasoning-journal-migration.md)
