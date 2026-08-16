# 0055: Owned session tool permissions

- Status: accepted
- Date: 2026-08-15
- Presentation amended by: decisions 0056 and 0059

Decision 0056 compacts the lifecycle head and risk into one activity line. The
permission policy, contextual actions, exact preview, and authority remain
unchanged.
Decision 0059 gives the generic `SelectionList` one accent foreground for its
exact selected row; permission authority and input behavior remain unchanged.

## Context

The initial tool workflow requires the operator to type `/approve` or `/deny`
for every successfully planned write or execute call. Those commands prove the
single-call approval boundary, but they do not form a coherent permission
model: read behavior is implicit, repeated low-risk choices cannot be expressed,
and command text is coupled to one pending tool lifecycle.

The permanent six-tool harness now has stable, non-overlapping authority
domains. It can therefore expose one closed session policy without adding tool
aliases, changing model-visible schemas, or weakening the planning and commit
contracts. Permission state must remain operator-owned and must not turn into a
provider preference, prompt instruction, persistent ambient grant, or model
selected limit.

## Decision

The CLI owns one bounded `ToolPermissionPolicy` for the exact advertised tools:
`read_file`, `list_directory`, `search_text`, `apply_patch`, `manage_path`, and
`run_process`. Each entry has exactly one mode:

- `allow`: permit requests for that tool during the current process session;
- `ask`: pause each request for one contextual operator decision; or
- `deny`: reject requests for that tool without invoking its handler.

The three read tools start as `allow`. `apply_patch`, `manage_path`, and
`run_process` start as `ask`. The policy exists only in CLI memory, is reset by
application cleanup, and is never read from or written to a file, environment
variable, credential store, provider, transcript, or model message. Tool names,
risk classes, default modes, and mode order are closed owned data. An unknown
name or a risk mismatch fails the application invariant rather than receiving a
fallback permission.

`/permissions` replaces `/approve` and `/deny` in the exact command catalog. It
opens one transient session editor above the composer and never enters the
transcript. The editor shows the six exact tools and their current modes. Up and
Down move the bounded selection without wrapping, Left and Right reduce or
increase the selected mode without wrapping, and Enter closes the editor.
Editing composer text also closes it before applying that same decoded editor
event. Changes take effect immediately in serialized input order. The command
accepts no arguments, aliases, persistent scope, wildcard, risk-wide grant, or
model-provided value.

Every successfully planned runtime request now waits for one explicit CLI
decision, including reads. The CLI resolves that request from the exact current
tool entry:

- `allow` emits an affirmative decision without operator interruption;
- `deny` emits a negative decision without handler invocation; and
- `ask` exposes a contextual selector containing exactly `Allow once`,
  `Allow for session`, and `Deny`.

Up and Down move the contextual decision selection without wrapping and Enter
activates it. `Allow once` permits only the exact pending call. `Allow for
session` first changes only that exact tool entry to `allow`, then permits the
same pending call in the same reducer action. `Deny` rejects only the pending
call and leaves the session policy unchanged. A new request receives a fresh
decision; a prior call identifier, preview, or selection cannot authorize it.
The old slash commands and their dispatch branches are removed atomically, so
there is no overlapping approval path.

The runtime remains policy-neutral. It validates the complete ordered batch,
plans each call just in time, publishes one request, and accepts one exact
turn-and-call decision before either denial settlement or handler start. It
does not retain session modes or infer a decision from risk, preview presence,
model prose, or a previous call. Calls still execute sequentially in provider
order.

## Security boundary

A permission changes only whether an already admitted, validated, and planned
tool request may reach its existing handler. It cannot add a tool, change a
schema, select a program, widen an argument grammar, escape the canonical
workspace, bypass the immutable read policy, override a denied sensitive path,
increase a bound, disable stale-state validation, or replace a native
committer. `allow` is not a filesystem sandbox, transaction, durability
guarantee, or provider capability.

Write and execute planning remains concrete. While an `ask` decision is
pending, the activity surface may show the exact bounded effect preview already
owned by the planner. `Allow once` and `Allow for session` both resolve that
exact pending plan; later calls are independently planned and stale state is
checked again at invocation. A session-wide tool permission does not cache a
pathname, object identity, process argument, preview, or successful result.
Read calls have no effect preview, including when their mode is `ask`.

A denied request becomes the existing structured tool failure and is included
in the ordered tool exchange. It is not silently dropped, retried, or reported
as a handler failure. A failed plan still requests no permission because no
valid invocation exists.

## Presentation and lifecycle

The permission editor and pending decision selector reuse the generic bounded
`SelectionList` and the shared conversation-stage layout. They are contextual,
transparent, and absent from transcript state. A pending decision takes
precedence over the session editor. The current tool activity remains the one
latest ephemeral lifecycle snapshot and remains outside the transcript; this
decision changes only its permission wording and removes embedded slash-command
actions. A later visual decision may refine that activity presentation without
changing the permission engine or adding another authority path.

Permission input, runtime requests, decisions, handler execution, notices, and
terminal output continue through the single serialized application reducer.
Waiting for an operator decision is not autonomous progress and shows no motion
pulse. Cancellation remains authoritative and releases the exact pending
runtime request without preserving a grant or replaying an effect.

The evaluation receipt increments its affirmative-approval count only when the
operator uses `Allow once` or `Allow for session` on a pending `ask` request.
Default or session-policy automatic decisions and edits made in `/permissions`
do not increment that counter.

## Verification

Tests cover the exact six-entry catalog, defaults, immutable projections,
bounded mode changes, cleanup reset, unknown-name and risk-mismatch rejection,
command replacement, completion behavior, contextual selection, input ordering,
automatic allow and deny, read `ask`, one-call and session allowance, denial
without invocation, batch sequencing, cancellation, rendering, short
viewports, privacy, and evaluation counting. Canonical verification checks the
manual command inventory and requires this decision.

## Rollback and removal

Rollback removes the CLI policy, permission projections, contextual selectors,
their application and runtime decision paths, tests, manual text, and this
decision together. It must then restore one reviewed authority contract rather
than leaving every request implicitly allowed or retaining dormant modes.

Removing one tool removes its permission entry in the same change as its
descriptor, handler, tests, documentation, and manual-policy record. Replacing a
tool changes the exact entry atomically; aliases and stale permission records are
not retained.
