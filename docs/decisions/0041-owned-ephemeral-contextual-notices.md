# 0041: Owned ephemeral contextual notices

- Status: Accepted
- Date: 2026-08-13

## Context

Human review found that command feedback was visually detached from the action
that produced it. `Unknown command.` could remain between a user turn and an
approval surface while a new command was already being edited. `/providers`
printed two attention-colored metadata lines because notice tone followed the
application phase rather than the notice itself. Both forms remained visible
until unrelated state happened to replace them.

These values are contextual feedback, not transcript, tool lifecycle, or
persistent status. They need their own bounded presentation and lifetime without
adding another application writer or allowing a timer to mutate the frame.

## Decision

The application continues to own one latest notice. A notice carries bounded
lines, one closed semantic level (`info` or `warning`), one closed placement
(`context` or `composer`), and one immutable generation token. A new notice
replaces the previous notice atomically.

The CLI presents a `context` notice after contextual tool activity and before
slash completion or the composer. One shared optional rhythm row separates it
from the preceding region. A transparent stage-wide `Surface` supplies one cell
of horizontal padding, so notice text shares the content axis used by user text,
assistant prose, and the draft. Context notices add no background, border, rail,
icon, or private panel.

`info` uses muted foreground text. `warning` uses attention foreground text.
Notice tone never derives from the current application or tool phase. Provider
status is one compact informational line containing display name, model, and
authentication joined by the owned middle-dot separator. Unknown slash input
uses one short warning line. Notice content remains CLI-owned and model text
cannot select its level.

Clipboard settlements from decision 0045 are the only `composer` placement.
They use one short line: `Copied!`, `Copy requested!`, or `Copy failed!`. The
generic `InputArea` may paint that text against the physical right edge of its
caret row only when at least one separating cell remains after the projected
draft. It does not reserve columns, alter projection width, wrap the draft,
change preferred rows, move the caret, or add a layout slot; if it cannot fit,
the visual status collapses while the generation still expires normally. The
status shares the `InputArea` content row and leaves the surrounding transparent
horizontal-rule frame unchanged. No second state owner,
timer, overlay framework, or private panel is introduced.

Every notice is ephemeral. The CLI-owned notice scheduler receives the current
generation token and publishes one expiry event after exactly 5,000
milliseconds. The application clears the notice only when the event token is
the same object as the current token, so a late expiry cannot clear a newer
notice. Any editor redraw dismisses the current notice immediately before
ordered actions from that input install possible replacement feedback.

Expiry is serialized through the existing event arbiter. Terminal and runtime
events retain priority over notice expiry; notice expiry outranks cosmetic
motion. The scheduler never touches application state, a component, the
renderer, or terminal bytes. It retains at most one timer, one ready event, and
one pending reader. Replacement, input dismissal, cleanup, and close cancel the
owned timer and reject late callbacks by generation.

An accepted expiry is an authoritative redraw. While motion is active it
discards any cached cosmetic tick and re-arms motion only after the expiry frame
renders successfully, without resetting the current pure phase. A stale expiry
that produces no redraw does not disturb pending motion. This prevents both a
cosmetic backlog behind the notice and an animation stall after no-op input.

The monotonic delay port is generic CLI platform substrate shared by motion and
notice schedulers. Its Node adapter remains the only `node:timers` boundary.
The two schedulers retain independent registrations and lifecycle contracts.

## Bounds, failures, and security

Existing notice line, line-length, aggregate, and control-character bounds stay
authoritative. Tokens contain no notice text and are compared only by identity.
Scheduler and arbiter errors are content-free. A clock scheduling failure leaves
the current notice visible until editor input or later application state clears
it; it does not fail the session or invent an expiry. Cleanup cancels both
schedulers before releasing terminal ownership.

No notice enters conversation state, runtime input, logs, disk, provider
requests, or tool arguments. Timer callbacks cannot expose or retain notice
content. Non-interactive execution creates no notice scheduler and retains its
escape-free fixed output.

## Verification

Command and application tests prove compact provider information, independent
notice levels and placements, replacement, input dismissal, exact-token expiry,
and stale-token rejection. View and generic input tests prove content-axis
alignment, phase-independent tones, contextual placement after activity,
composer-edge placement without geometry or caret change, constrained collapse,
uniform rhythm, no added background, and coexistence with completion. Scheduler
tests use the owned manual clock to prove the exact delay,
replacement, cancellation, close, synchronous callbacks, one reader, and late
callback rejection without sleeping. Arbiter and run-loop tests prove source
priority, serialized expiry, cached-motion rebasing, preservation across
no-redraw input, content-free source and controller failures, redraw, and
cleanup. The canonical verifier remains the release gate.

## Update, rollback, and removal

Change the duration only at the notice-scheduler constant and update scheduler,
integration, manual, and visual regressions together. Add a notice level only by
updating the closed application type, presenter, renderer-owned mapping,
commands, safety tests, and this decision. Do not add per-command timers or
private notice components.

Change a placement only with its producer, `InputArea` contract, view geometry
regressions, decision 0045 when applicable, and this decision. To remove the
composer placement, return clipboard settlements to `context`, then remove the
optional generic trailing status; ordinary contextual notices remain unchanged.

To remove timed notices, delete the notice scheduler and its arbiter source,
remove token expiry from the application, and retain input dismissal and the
latest-notice presenter. To remove notices entirely, also remove notice actions,
application state, presenter slots, command feedback, tests, manual text, and
this policy entry. Motion, terminal input, runtime, tools, conversation, generic
timer substrate, and renderer remain independently buildable.
