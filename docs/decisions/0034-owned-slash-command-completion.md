# 0034: Owned slash-command completion

- Status: accepted
- Date: 2026-08-11

## Context

The CLI owns four exact slash commands, but the empty composer gives no local
discovery path. The maintained manual remains authoritative, while ordinary
terminal use benefits from a small completion surface that cannot invent
aliases, execute a partially selected command, or become a second dispatcher.

The transcript already reserves contextual rows above the composer for the
latest tool activity. Completion must remain bounded, keep the composer and
current selection visible on small terminals, and leave transcript navigation
unchanged when no completion is active.

## Decision

The CLI exposes one immutable canonical command catalog containing the exact
command text and one short description. Exact dispatch and completion both use
that catalog. The catalog contains `/providers`, `/approve`, `/deny`, and
`/exit`; it does not restore `/help`, add aliases, or accept command arguments.

Completion is active only when the complete draft is a non-empty, case-sensitive
prefix of at least one command, contains no whitespace, and is not already an
exact command. At most four catalog entries can match. The first match is
selected when the draft changes.

While completion is active, Up and Down move the selection within the bounded
list and do not navigate the transcript. The selection does not wrap. Tab
replaces the complete draft with the selected exact command and moves the caret
to its end; it never submits or executes. Enter clears the draft and dispatches
the selected exact command through the same canonical submission path used by a
fully typed command. Completion therefore owns selection only and never becomes
a second dispatcher. Left, Right, Home, End, Delete, Backspace, and text editing
continue through the generic line editor and recompute completion. When no
completion is active, Up, Down, and Tab retain their previous navigation or
unsupported-input behavior.

`@agent/tui` adds one generic bounded `SelectionList` over ordinary one-row
components. It owns no commands and no CLI policy. It validates the component
count and selected index, measures every child as exactly one row, and chooses
a deterministic visible window that always contains the selection. The CLI
maps command catalog entries to the existing split-line and semantic-surface
primitives: unselected rows use the technical inset surface and the selected
row uses the subtle surface. The completion slot sits immediately above the
composer and below contextual activity.

The activity foreground contract is refined at the same review boundary:
semantic backgrounds continue to encode success, attention, and failure, while
tool identity, state, safe detail, and approval actions use neutral plain or
emphasized foregrounds. Written state remains mandatory; color is never the
only signal.

## Security and bounds

Completion reads only the bounded in-memory draft and the fixed owned catalog.
It performs no I/O, retains no submitted content, and cannot introduce a string
that exact dispatch does not recognize. Model, provider, tool, workspace, and
personal content cannot add entries, descriptions, styles, or key behavior.
Enter can dispatch only the currently selected catalog entry and clears the
partial draft before producing the ordinary command action.

The catalog and visible list are capped at four entries. All labels and
descriptions are owned constants and still pass the normal text, component,
viewport, frame, and renderer validation paths. Tab is decoded as one explicit
key event; unknown control input continues to fail closed.

## Verification

Command tests prove catalog-to-dispatch agreement, exact and partial matching,
case and whitespace rejection, and absence of aliases. Session tests prove
selection bounds, non-wrapping movement, Tab completion without execution,
Enter dispatch through the canonical path, draft clearing, recomputation after
editing, and unchanged transcript navigation outside the menu. TUI tests prove
list validation, one-row enforcement, selected-row visibility, clipping, tiny
viewports, and hostile-child containment. CLI view tests prove ordering above
the composer, semantic selected state, no menu for an exact command, and spaced
activity coexistence. Renderer tests retain exact ANSI coverage for the revised
activity contrast. The canonical verifier remains the release gate.

## Update, rollback, and removal

Changing the catalog, activation grammar, key behavior, ordering, bounds,
surface mapping, or selected-window policy requires this decision, focused
tests, the terminal manual, architecture, maintenance guidance, and both policy
registries to change together.

To roll back presentation only, remove the CLI completion slot while retaining
the canonical catalog and exact dispatcher. To remove completion entirely,
remove the session selection state, Tab and Enter interception, completion
presenter, `SelectionList`, its export and tests, and the associated
documentation and policy entries. Exact commands, line editing, transcript
navigation, composer, tool activity, and renderer remain independently usable.
