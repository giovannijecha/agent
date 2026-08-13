# 0043: Owned conversation density

- Status: accepted
- Date: 2026-08-13

## Context

The responsive conversation stage, quiet rhythm, semantic activity surfaces,
and multiline composer now share one coherent visual grammar. Observable review
at ordinary terminal sizes nevertheless shows excessive vertical mass around
operational activity. An activity with a header and one detail occupies four
painted rows because it adds one blank surface row above and below its content.

Applying that same content-height treatment to user turns makes a one-line
request read as a thin colored strip instead of a calm role envelope. User
content and operational activity therefore need different internal density.
The one-line composer also occupies three rows, but it is the sole focused
control and those rows preserve its stable input target and caret identity.

The shared one-row rhythm between transcript, activity, notices, completion,
composer, and footer is not the cause of the inconsistency. That rhythm prevents
adjacent regions from merging, including when the transcript scrolls. Removing
it would regress the accepted separation contract rather than make individual
surfaces more precise.

The density change must remain an owned product policy. It must not copy a
foreign component hierarchy, literal, timing, or rendering algorithm, and it
must not add a second layout path or a new generic TUI primitive.

## Decision

Adopt one immutable CLI-owned conversation-density record consumed by the
existing user, activity, composer, and rhythm presenters.

- User turns retain the stage-wide borderless neutral `subtle` surface, one cell
  of horizontal and vertical padding, and italic text. A one-line turn occupies
  three painted rows; wrapped or multiline content adds only its visible rows
  between the one shared top and bottom padding row.
- Every tool lifecycle state retains the same stage-wide borderless semantic
  `Surface`, one cell of horizontal padding, neutral high-contrast content, and
  no vertical padding. The current header plus risk/detail or approval action
  occupies two rows. When the viewport can retain only one, the activity stack
  anchors at its head so tool identity and written state survive before optional
  detail.
- The composer retains one cell of horizontal and vertical padding. It is the
  only focused surface, remains recognizable at rest, keeps the steady block
  caret away from the surface edge, and continues to grow from one through six
  content rows through the same `InputArea`.
- The shared conversation rhythm remains one optional row with zero minimum
  height between adjacent lower-shell regions. It remains external separation,
  never private surface padding.
- Notices and slash completion remain transparent and already compact. Assistant
  prose, fenced code, and strict tables retain their current transparent paths.
- Constrained viewports continue to allocate required content before optional
  rhythm or padding. The generic `Surface`, `Spacer`, `VerticalLayout`,
  `HorizontalInset`, scroll, frame, renderer, and caret contracts do not change.

The policy record contains only closed zero-or-one row values. It performs no
measurement, rendering, I/O, timing, state mutation, or terminal inspection.
Region presenters remain responsible for their existing semantic content and
consume only the relevant policy field.

This decision refines the density portions of decisions 0028, 0033, 0039, and
0040. Their role identity, semantic backgrounds, stage geometry, external
rhythm, motion, input, and lifecycle contracts remain in force.

## Reference geometry

The focused regressions use three ordinary reference classes without adding
runtime breakpoints:

| Class | Reference viewport | Required observations |
| --- | --- | --- |
| Wide | 72 by 22 | Full user, activity, composer, rhythm, and footer geometry. |
| Medium | 48 by 14 | Compact surfaces remain distinct and transcript stays dominant. |
| Short | 24 by 8 | Optional rhythm collapses before required content and the caret survives. |

These are test geometries, not stored application policy. Resize continues to
flow through the existing pure viewport projection.

## Bounds and security

Reassigning these painted rows changes no retained text, model context, tool
state, approval authority, process capability, workspace authority, or provider data.
All content still crosses the same bounded component, structured-row, frame,
and renderer boundaries. Model text cannot select padding, surface, slant,
geometry, or density values.

The density record is frozen and contains no caller-provided values. No foreign
source or implementation is inspected for this change; only operator-provided
observable screenshots and the owned frame geometry inform the review.

## Verification

CLI regressions prove exact painted-row counts for one-line and multiline user
turns, detailed activity, approval activity, identity-first clipping, one-line and
multiline composer, every external rhythm boundary, scroll separation, and
caret priority. The matrix covers wide, medium, and short viewports and retains
the exact composer-edge motion alignment.

Generic TUI tests remain unchanged because no framework contract changes. The
complete build, test suite, Windows native containment proof, CLI smoke test,
ownership verification, and canonical gate remain required.

## Update, rollback, and removal

Change a density value only in the CLI-owned record and update this decision,
focused frame regressions, AGENTS.md, architecture, manual, maintenance guidance,
and policy registration together. A new region must use the existing stage,
surface, spacer, and layout paths instead of adding private padding or margins.

To roll back, restore one vertical-padding row for activity surfaces in the same
record and restore their exact row-count regressions. Preserve the existing user
and composer padding and external rhythm during that rollback. To remove centralized density
ownership entirely, return each still-required literal to its existing
presenter, delete the record and its policy registration, amend this decision,
and prove that no duplicate or competing spacing calculation remains.

## Evidence

- `packages/agent-cli/src/conversation-density.ts`
- `packages/agent-cli/src/conversation-view.ts`
- `packages/agent-cli/src/activity-view.ts`
- `packages/agent-cli/src/chat-view.ts`
- `packages/agent-cli/test/chat-view.test.ts`
- `docs/manual/03-terminal-interface.md`
