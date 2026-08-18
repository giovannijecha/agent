# 0043: Owned conversation density

- Status: accepted
- Date: 2026-08-13
- Composer frame amended: 2026-08-15
- User-turn rail amended: 2026-08-15
- User-turn contrast amended: 2026-08-15
- Shared content alignment amended: 2026-08-15
- Activity line amended by: decision 0056
- Activity surface amended by: decision 0057
- User identity amended by: decision 0059
- Cursor selection amended by: decision 0077

Decision 0057 retains the one-cell horizontal and zero-row vertical activity
padding below while making the surface transparent and moving lifecycle truth
to the status mark and written-state foreground.
Decision 0059 removes the user rail while retaining the exact shared content
column and changes user base prose from `highContrast` to `accent`. Its current
presentation and regressions supersede the historical rail clauses below.

## Context

The responsive conversation stage, quiet rhythm, semantic activity surfaces,
and multiline composer now share one coherent visual grammar. Observable review
at ordinary terminal sizes nevertheless shows excessive vertical mass around
operational activity. An activity with a header and one detail occupies four
painted rows because it adds one blank surface row above and below its content.

The one-line composer also occupies three rows, but it is the sole focused
control and those rows preserve its stable input target and caret identity.

The shared one-row rhythm between transcript, activity, notices, completion,
composer, and footer is not the cause of the inconsistency. That rhythm prevents
adjacent regions from merging, including when the transcript scrolls. Removing
it would regress the accepted separation contract rather than make individual
surfaces more precise.

Operator review later found that the composer's filled neutral surface still
reads as a heavy block after the surrounding conversation became quieter. The
accepted replacement retains its stable three-row target but uses one
transparent content row between two restrained steel-blue horizontal rules.
The reference is an operator-provided observable outcome only; no foreign
source, hierarchy, literal, timing, or rendering algorithm is inspected.

Operator review of the conversation then found that the filled user surface and
its two padding rows still carried more visual mass than the role distinction
required. The accepted replacement keeps italic content but composes the
existing transparent `Surface` with the generic `SideRail`. One muted solid
half-block rail cell spans exactly the visible content rows; no
synthetic row is inserted above or below the request. The same amendment gives
only the user's base prose the generic neutral `highContrast` foreground so it
remains brighter than assistant output without changing Markdown references,
emphasis, or syntax roles.

The rail initially retained an additional full gap cell. Because the rail is a
half-block within its own terminal cell, that extra cell placed user prose one
column to the right of assistant prose and the composer caret. Composer pointer
projection also repeated its one-cell inset as a private literal. The accepted
alignment makes the first text cell inside the stage one shared product-owned
coordinate used by transcript prose, composer rendering, caret mapping, and
composer pointer hit-testing.

The density change must remain an owned product policy. It must not add a
second layout path or a composer-private renderer. One minimal generic TUI
frame is warranted because the same bounded measurement, transparent row,
caret, and constrained-viewport contracts must remain independently testable.

## Decision

Adopt one immutable CLI-owned conversation-density record consumed by every
conversation presenter and by composer pointer projection. It owns the closed
zero-or-one cell and row values for the canonical content inset, flush
decoration, flush surface padding, composer rules, and external rhythm.

- User turns use one stage-wide transparent `Surface` with zero internal
  horizontal and vertical padding, italic text, and the generic `SideRail`.
  The rail uses the muted solid half-block glyph `▌`, still occupying one cell,
  with no additional gap cell and spans exactly the visible content rows. The
  next cell is both the user's first text cell and the canonical one-cell
  content inset shared with assistant prose and the composer. The
  user's base prose uses the generic unweighted `highContrast` tone while
  assistant prose retains `plain`; Markdown accent, emphasis, and syntax roles
  remain authoritative. The composition adds no row, background, label, or private geometry;
  when the viewport cannot retain the decoration, `SideRail` drops it before
  clipping required content.
- Every tool lifecycle state retains the same stage-wide borderless transparent
  `Surface`, the shared one-cell content inset, neutral action and optional subject,
  semantic mark/state foregrounds, and no vertical padding. Under decisions 0056
  and 0057, non-permission states occupy one compact status/action/state line.
  Pending permission uses that same line and may add its separately wrapped exact
  human-readable preview. The activity stack anchors at its head so display action,
  written state, and required permission actions survive before optional subject or preview detail when
  width or height is constrained.
- The composer uses the generic transparent `HorizontalRules` frame with one
  full-stage `accent` rule above and below its child and one cell of horizontal
  content padding from the shared density record. Its text, terminal cursor
  caret, and pointer hit-testing resolve through that same content coordinate;
  decision 0077 owns the current blinking-block cursor selection.
  It is the only focused frame, remains recognizable at rest, and continues
  to grow from one through six content rows through the same `InputArea`. A
  one-row draft therefore remains three rows tall. When fewer than three rows
  are assigned, both optional rules collapse before the required editor row.
- The shared conversation rhythm remains one optional row with zero minimum
  height between adjacent lower-shell regions. It remains external separation,
  never private surface padding.
- Notices consume the shared one-cell content inset. Slash completion remains
  transparent and already compact. Assistant
  prose, fenced code, and strict tables retain their current transparent paths.
- Constrained viewports continue to allocate required content before optional
  rhythm or framing. `HorizontalRules` owns only its two optional rule rows,
  transparent child inset, and mapped caret. `SideRail` owns only its optional
  horizontal decoration and mapped caret. The generic `InputArea`, `Surface`,
  `Spacer`, `VerticalLayout`, `HorizontalInset`, scroll, stage, renderer, and
  editor contracts do not change.

The policy record contains only closed zero-or-one cell and row values. It performs no
measurement, rendering, I/O, timing, state mutation, or terminal inspection.
Region presenters remain responsible for their existing semantic content and
consume only the relevant policy field.

This decision refines the density portions of decisions 0028, 0033, 0039, and
0040. Their role identity, semantic truth, stage geometry, external
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
state, permission authority, process capability, workspace authority, or provider data.
All content still crosses the same bounded component, structured-row, frame,
and renderer boundaries. Model text cannot select padding, surface, slant,
geometry, or density values.

The density record is frozen and contains no caller-provided values. No foreign
source or implementation is inspected for this change; only operator-provided
observable screenshots and the owned frame geometry inform the review.

## Verification

CLI regressions prove that one-line and multiline user turns remain transparent,
italic, use `highContrast` base prose, preserve semantic Markdown tones, and
carry exactly one muted solid half-block rail per visible content row with no
synthetic padding rows. They prove that user prose, assistant prose, composer
text, its caret, and composer pointer projection share one exact first content
column. Under decision 0056 they also prove compact and preview-expanded
activity, action/state-first clipping, one-line and multiline composer, every
external rhythm boundary, scroll separation, and caret priority. The matrix covers wide,
medium, and short viewports and retains the exact composer-edge motion
alignment.

Generic TUI regressions prove `HorizontalRules` and `SideRail` measurement,
complete and constrained rendering, transparent inset rows, exact decoration
tone and width, caret mapping, hostile-child containment, and invalid option
rejection. The complete build, test suite, Windows native containment proof,
CLI smoke test, ownership verification, and canonical gate remain required.

## Update, rollback, and removal

Change a spacing value only in the CLI-owned record and update this decision,
focused frame regressions, AGENTS.md, architecture, manual, maintenance guidance,
and policy registration together. A new region must use the existing stage,
surface, horizontal-rules, spacer, and layout paths instead of adding private
padding, hit-testing offsets, rules, or margins.

To roll back only the composer amendment, replace `HorizontalRules` with the
prior stage-wide neutral `Surface`, restore one vertical-padding row above and
below the same `InputArea`, and restore its exact frame regressions. To roll back
activity density, restore one vertical-padding row for activity surfaces in the
same record. To roll back only the user-turn contrast refinement while retaining
its light geometry, restore the thin `│` rail glyph and `plain` base prose
together with their exact regressions. To roll back the complete user-turn
amendment, remove `SideRail`,
restore the prior stage-wide neutral `subtle` surface and its one-cell
horizontal and vertical padding, and restore `userVerticalPadding` to the
density record. Preserve external rhythm during any rollback.
To remove centralized density ownership entirely, return each still-required
literal to its existing presenter, delete the record and its policy
registration, amend this decision, and prove that no duplicate or competing
spacing calculation remains.

## Evidence

- `packages/agent-cli/src/conversation-density.ts`
- `packages/agent-cli/src/conversation-view.ts`
- `packages/agent-cli/src/activity-view.ts`
- `packages/agent-cli/src/chat-view.ts`
- `packages/agent-cli/src/terminal-interaction.ts`
- `packages/agent-cli/test/chat-view.test.ts`
- `packages/agent-tui/src/horizontal-rules.ts`
- `packages/agent-tui/test/horizontal-rules.test.ts`
- `packages/agent-tui/src/side-rail.ts`
- `packages/agent-tui/test/side-rail.test.ts`
- `docs/manual/03-terminal-interface.md`
