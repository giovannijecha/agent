# 0079: Owned explicit selector dismissal

- Status: accepted
- Date: 2026-08-18
- Domain: terminal
- Supersedes: none
- Superseded by: none

## Context

Decision 0078 gave provider, model, session-permission, and timeline selectors
exclusive selection focus inside the interaction dock. Its initial reducer
closed those selectors for every keyboard event they did not otherwise handle.
Consequently, the first printable character disappeared while closing the menu
and only later characters reached the restored composer. The behavior preserved
the draft but made focus loss implicit, destructive to fresh input, and hard to
distinguish from a failed keystroke.

Cancellation also needs a conventional Escape route. A raw terminal Escape byte
is ambiguous with the prefix of cursor, function, paste, and pointer sequences,
so treating every received Escape byte as immediate cancellation would corrupt
valid sequences split across input chunks. The correction must preserve one
decoder, one serialized application controller, one retained editor, and the
existing global transcript and exit routes. It must not add filtering, hidden
draft editing, replay, a second input queue, or component-owned dispatch.

## Decision

Provider, model, session-permission, and timeline selectors use explicit
dismissal. Up and Down move their selection. Enter keeps its existing acceptance
meaning; Left and Right keep their existing session-permission meaning. Escape
and Ctrl+C cancel the selector and restore editor focus. Each accepting or
cancelling event is consumed exactly once and never edits the retained draft.

Every other keyboard event is inert while one of those selectors owns focus. In
particular, printable text, paste, Tab, Home, End, deletion, and word-editing
events neither close the selector nor mutate, clear, submit, or expose the
retained draft. Page Up and Page Down retain their global transcript-navigation
meaning, and EOF retains the existing application exit route. Pending-tool
permission and concealed provider-credential input remain separate contexts
with their existing blocking and editor contracts.

The generic input decoder owns one explicit `escape` event. The Node terminal
host disambiguates a trailing raw Escape byte for a fixed 30-millisecond bound.
If a continuation arrives within that bound, the bytes remain one ordered input
sequence for the decoder. Otherwise the host publishes that byte as a settled
Escape input through its existing bounded event queue. The settled marker is
content-free, the decoder remains responsible for terminal-sequence meaning,
and the application still reduces one event at a time in source order. Shutdown
cancels the timer and clears any unpublished byte.

## Bounds, failures, and security

At most one trailing Escape byte and one cancellable timer are retained by the
terminal host. The byte remains subject to the existing per-chunk, cumulative
input, event-count, and decoder escape-sequence limits. A continuation that
would exceed those bounds fails through the existing content-free terminal
input failure. The timer creates no concurrent reducer: it can only enqueue one
immutable terminal event for later serialized consumption.

Ignored selector input creates no notice, transcript content, draft content,
provider request, permission decision, journal record, or ambient state. It
cannot reveal the retained draft or credentials. This decision grants no new
command, tool, network, persistence, pointer, or process authority.

## Verification

Decoder regressions prove an explicitly settled bare Escape becomes exactly one
`escape` event while every supported sequence remains valid across chunk
boundaries. Terminal-host regressions prove bounded delayed publication,
continuation joining, ordinary-input ordering, cancellation during shutdown,
and cleanup after failure. Session regressions cover all four contextual
selectors and prove ordinary text and editing events are inert, Ctrl+C and
Escape close once, Enter retains acceptance, global transcript navigation and
EOF survive, and the draft remains byte-for-byte unchanged.

Application and interaction-dock regressions continue to prove focus restoration,
no selection caret, no composer pointer authority, and serialized action order.
The canonical Windows and Linux verifier remains the release gate.

## Update, rollback, and removal

Changing selector membership, accepted keys, ignored keys, the Escape ambiguity
bound, settled-input marker, cancellation meaning, or retained-draft contract
requires this decision, decoder, terminal host, CLI reducer, tests, architecture,
manual, maintenance guidance, and documentation and ownership policy to change
together.

Rollback removes explicit Escape settlement, restores the former selector
closing table and its regressions, and removes this record from current terminal
authority in the same change. To remove Escape cancellation independently,
first remove the selector route, then remove the host timer and settled marker,
then remove the decoder event. To remove a selector, delete its command,
application state, reducer route, projection, manual entry, and tests without
leaving a private fallback path.
