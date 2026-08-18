# 0078: Owned interaction dock focus

- Status: accepted
- Date: 2026-08-18
- Domain: terminal
- Supersedes: none
- Superseded by: none

## Context

The conversation shell already renders the multiline composer between two
horizontal rules and routes keyboard input according to one CLI-owned session
context. Provider, model, permission, pending-tool, and timeline selectors are
currently projected as contextual rows above that composer. The editor remains
visible with a terminal caret while a selector owns keyboard input, and pointer
events can still reach the draft. Other editor input can close a selector and
mutate the draft in the same decoded event.

This creates two visible focus owners and makes the selector feel detached from
the place where the interaction began. It also lets a large list consume
unbounded preferred height outside the composer frame. The correction must keep
one application controller, one editor, one generic selection list, one frame
caret, and one serialized input reducer. It must not introduce a modal screen,
component-private command dispatch, another input queue, or a TUI dependency on
agent product meaning.

## Decision

The ruled composer region becomes one generic interaction dock. The dock owns
one active body at a time:

- editor focus renders the existing `InputArea` and requires its one logical
  caret;
- selection focus renders one existing `SelectionList`, permits an optional
  one-row header, and forbids a caret.

The generic `@agent/tui` dock validates and snapshots its components, focus
kind, and maximum content height. It measures no more than six content rows.
When a selection has a header, the header receives one row and the selection
list receives the remaining rows so its selected item stays visible. If only
one content row is available, the header is omitted and the selected item keeps
the row. Additional assigned rows are blank and never widen the content bound.
The existing `HorizontalRules` remains the visual frame and the renderer remains
the sole ANSI and terminal-caret owner.

The CLI application controller remains the sole owner of product focus.
Ordinary composition and concealed provider-credential entry use editor focus.
Provider, model, session-permission, pending-tool, and timeline selection use
selection focus inside the same ruled region. Slash-command completion remains
an editor-owned discovery surface above the dock because its Up, Down, Tab, and
Enter behavior edits or submits the active draft. Provider credential context
may remain above the dock while its concealed editor owns the caret.

While selection focus is active, keyboard actions are reduced only by that
selector or by the existing global transcript and exit routes. An editor action
that closes a selector is consumed; it cannot also edit the retained draft.
Pointer input cannot position, select, replace, or copy composer content until
editor focus returns. Closing or accepting a selector restores the unchanged
draft and its existing caret without creating a second editor or replaying the
closing input.

## Bounds, failures, and security

The dock contains at most one optional one-row header and one active bounded
body. Its content height is one through six rows and remains within existing
component, selection, frame, and terminal-width limits. Invalid focus values,
zero-row bodies, multirow headers, missing editor carets, unexpected selection
carets, hostile components, and inconsistent projections fail through the
existing content-free component error boundary.

The dock owns no command, credential, provider, model, tool, permission,
timeline, draft, or transcript meaning. It performs no I/O, scheduling, ANSI
emission, dispatch, persistence, or hidden state mutation. Selection rows still
use the generic accented-focus contract, and untrusted content cannot choose
focus kind, height, styling, or terminal bytes.

## Verification

Generic TUI tests prove editor and selection focus, exact caret admission,
six-row measurement, header retention, selected-row visibility, one-row
fallback, padding, hostile-child containment, and invalid focus rejection. CLI
view regressions prove every contextual selector appears between the existing
composer rules, never exposes a caret, keeps its selected row visible, and does
not add a second contextual menu slot. Session and application regressions prove
closing input is consumed, drafts remain unchanged, pointer events cannot reach
the editor during selection focus, transcript pointer selection and scrolling
remain active, coalesced close-plus-pointer input is reduced against the focus
stored with its rendered projection, and editor focus returns after close or
acceptance. Existing completion, credential, permission, timeline, terminal,
layout, and renderer tests remain required. The canonical Windows and Linux
verifier is the release gate.

## Update, rollback, and removal

Changing focus kinds, content height, header priority, selector membership,
closing-input consumption, pointer exclusion, caret admission, or dock placement
requires this decision, the generic component, CLI reducer and view composition,
focused tests, architecture, manual, maintenance guidance, and documentation and
ownership policy to change together.

Rollback removes the generic dock wrapper, restores contextual selectors above
the independently rendered composer, and restores the prior input propagation
only with its previous regressions and documentation. To remove selector focus,
remove each CLI selector route before deleting the selection-focus branch. To
remove the dock completely, replace editor focus with the existing ruled
`InputArea`, remove the component export and tests, and update all registrations
in the same change. Command completion, the editor, selection list, horizontal
rules, transcript, renderer, and terminal lifecycle remain independently
removable.
