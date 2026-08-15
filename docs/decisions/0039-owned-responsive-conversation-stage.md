# 0039: Owned responsive conversation stage

- Status: Accepted
- Date: 2026-08-12
- Updated: 2026-08-15
- Amended by: decisions 0040, 0041, and 0043

Decision 0040 makes technical content and completion surfaces transparent,
retains the then-current neutral subtle user and input surfaces, removes the command hint, gives
each adjacent lower-shell region the same optional one-row rhythm, and lets the
footer pulse align with the composer's right edge. The fluid stage and pure
projection below remain in force.
Decision 0043 removes vertical padding from activity surfaces, replaces the
padded subtle user region with a transparent generic `Surface` plus an
exact-height muted `SideRail`, and amends the composer to use one full-width
rule row above and below its transparent content. The shared external rhythm,
stage width, and projection remain unchanged.

## Context

The conversation shell had already converged on a quiet transcript, contextual
tool activity, a bounded composer, and a compact footer. Its regions were still
responsible for parts of their own horizontal geometry, however. That made
spacing drift possible and prevented one responsive rule from governing the
whole application surface.

The accepted visual direction calls for one quiet conversation surface that
uses the terminal as a canvas rather than preserving a web-like reading column.
A fixed maximum width created large unused gutters on wide terminals and made
the interface feel like raw output inside a centered box. The direction also
calls for stage-wide user and composer regions and deliberate vertical rhythm
without becoming a dashboard.

## Decision

The CLI owns one pure responsive conversation-stage projection.

- `projectConversationStage` receives only the current viewport and returns
  bounded horizontal geometry plus responsive presentation facts.
- The stage uses the full viewport width while retaining one technical outer
  column on each side when the viewport permits. Tiny viewports use every
  available column. There is no arbitrary reading-width cap.
- Transcript, activity, notices, command completion, composer, and footer are
  wrapped by the same stage. The pulse therefore ends on the same cell as the
  composer frame. Individual product regions do not calculate a competing
  shell width.
- The generic TUI `HorizontalInset` component remains the mechanism that
  applies the projection. It owns no agent-specific policy.
- User-message regions fill the stage width. Structured technical content
  remains content-fit so code and tables do not become decorative full-width
  bands.
- The composer uses one generic stage-wide horizontal-rule frame around the
  generic input area. Its content row is transparent with one cell of
  horizontal padding; one full-width light-blue accent rule appears above and
  below it when three rows fit. Constrained viewports collapse the optional
  rules before editor content.
- One shared one-row, zero-minimum rhythm appears before each non-empty
  contextual region, before the composer, and before the footer. Each slot
  disappears independently when absent or when the viewport cannot afford it.
- Resize recomputes the projection from the new viewport. No projected geometry
  is stored in application state.
- The projection reads no clock, schedules no work, emits no ANSI, and changes
  no runtime, model, tool, approval, or terminal lifecycle contract.
- Renderer serialization, differential drawing, clipping, cleanup, and caret
  ownership remain unchanged.

This decision refines the geometry portions of decisions 0026, 0028, 0033, and
0034. Their remaining component, transcript, composer, and command contracts
continue to apply.

## Consequences

- Wide terminals use their available horizontal canvas without artificial
  gutters; the technical outer margin prevents edge collisions.
- Narrow and tiny terminals degrade through one tested projection rather than
  component-specific exceptions.
- Transcript, contextual activity, completion, composer, and footer remain
  visually aligned through resize.
- Responsive affordances remain presentation facts and cannot affect accepted
  input, application state, or model context.
- The selected visual direction can evolve by changing one CLI projection and
  its tests without replacing the owned TUI framework or renderer.

## Update and removal

Change the minimum margin only in the conversation-stage module and update its
wide, narrow, and tiny viewport tests in the same change. Keep lower-shell
rhythm in the chat composition and region-specific style changes outside the
geometry projector.

To remove the responsive stage, replace the shared stage wrappers in the chat
projection with direct region components, restore an explicit footer-left
policy, then delete the projector, its tests, this decision, and its
ownership-policy registration. Generic TUI components, application state,
renderer, motion, and terminal lifecycle remain intact.

## Evidence

- `packages/agent-cli/src/conversation-stage.ts`
- `packages/agent-cli/src/chat-view.ts`
- `packages/agent-cli/src/conversation-view.ts`
- `packages/agent-cli/src/command-completion-view.ts`
- `packages/agent-cli/test/conversation-stage.test.ts`
- `packages/agent-cli/test/chat-view.test.ts`
