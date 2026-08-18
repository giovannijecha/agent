# 0077: Owned terminal blinking block cursor

- Status: accepted
- Date: 2026-08-18
- Domain: terminal
- Supersedes: none
- Superseded by: none

## Context

The interactive renderer already owns one logical caret, terminal cursor
visibility, exact positioning, and default-style restoration. Decision 0028
selected a steady vertical bar for that caret. Operator review now prefers the
strong rectangular focus of a classic terminal cursor and wants it to blink.

Blinking must not become application animation. A renderer timer would add
terminal writes outside ordinary frame ownership, introduce another redraw
clock, and make focus and shutdown races possible. Drawing a block glyph inside
the composer would instead create a second caret, alter text geometry, and
corrupt selection and copy semantics.

## Decision

When the renderer first takes interactive terminal ownership, it selects the
standard terminal-controlled blinking block cursor. Agent sends the closed
DECSCUSR blinking-block selection once during initialization; it does not own,
measure, configure, or reproduce the terminal's blink cadence.

The cursor remains terminal chrome. The frame continues to carry one optional
logical caret, the renderer continues to position and show that terminal cursor
after each atomic frame, and no cursor glyph enters editor or frame content.
Unsupported terminals may retain their native cursor without changing input,
layout, selection, or cleanup behavior.

Cleanup restores the terminal-default cursor style before restoring cursor
visibility and leaving the alternate screen. Partial initialization, failed
writes, and repeated cleanup use the existing renderer recovery path. No CLI,
editor, component, product-state, provider, runtime, or platform capability is
added.

This decision replaces only the steady vertical-bar selection described by
decisions 0028 and 0043. Their composer geometry, focus, caret mapping,
selection, density, and terminal-ownership contracts remain in force.

## Bounds and security

The renderer owns the exact closed ANSI sequence. Model, provider, workspace,
draft, transcript, and terminal input cannot choose cursor bytes or cadence.
There is no terminal capability probe, environment branch, timer, hidden global
state, retry, fallback sequence, or parallel output path. A terminal that
ignores the selection receives the same bounded frames and cleanup sequence.

## Verification

One exact renderer byte regression proves that initialization selects the
terminal-controlled blinking block while preserving alternate-screen, mouse,
paste, clear, position, visibility, and synchronized-output ordering. Existing
cleanup regressions prove default-style restoration after complete and partial
initialization and prove idempotence. The canonical Windows and Linux verifier
remains the release gate.

## Update, rollback, and removal

Changing cursor shape or terminal-managed blink behavior requires updating this
decision, the architecture, operator manual, maintenance guidance, exact
initialization and cleanup byte regressions, and documentation policy together.
Do not add a timer, simulated cursor glyph, second caret, or component-private
ANSI path.

Rollback replaces the initialization selection with the prior steady
vertical-bar sequence while retaining default-style restoration. Remove custom
cursor selection by deleting both the initialization selection and its
default-style cleanup flag, then updating the exact renderer regressions and
terminal documentation in the same change.
