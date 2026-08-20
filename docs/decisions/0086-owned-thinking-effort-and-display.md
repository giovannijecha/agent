# 0086: Owned thinking effort and display controls

- Status: accepted
- Date: 2026-08-20
- Domain: architecture
- Supersedes: 0083
- Superseded by: none

## Context

Decision 0083 reserved and the completed vertical slice implemented one
provider-neutral bounded reasoning stream behind a combined session mode with
the exact values `Off` and `Live`. That slice proved native Ollama transport,
record-level validation, runtime ordering, tool-loop continuity, journal
version two, transcript separation, and real model presentation. It also made
the remaining coupling visible: asking a model to reason and choosing whether
the operator sees that reasoning are independent decisions.

One combined mode cannot express hidden native reasoning, explicit native
effort, or a compact settings surface without assigning provider behavior to a
display choice. Model-name inference would be especially unsafe because the
admitted catalog returns identifiers rather than an authoritative capability
matrix, and supported native `think` values can differ between models.

## Decision

Replace the combined thinking mode with two orthogonal, session-only settings:

- `effort` is exactly `off`, `low`, `medium`, or `high` and controls the native
  provider request; and
- `display` is exactly `off` or `on` and controls only whether distinct
  reasoning documents are projected into the current conversation.

Both settings default to `off` for a new process and are explicitly released
at shutdown. Once applied, both values remain unchanged through every accepted
model selection in that process. They remain one operator-owned session
preference rather than per-model state. Neither setting is written to the
journal, environment, configuration, receipt, or any other durable policy.

`/thinking` opens one two-row settings surface in the existing interaction
dock. The rows appear in the exact order `Stream` and `Effort`, showing their
staged values on the right. Up and Down select one row without wrapping. Left
and Right move within that row's closed value order without wrapping. Enter
atomically applies both staged settings and closes the dock. Ctrl+C or Escape
discards both staged values and closes it. No nested selector, new focus model,
parallel renderer, or immediate partial application is introduced.

The editor opens only after one configured provider is selected and that
provider has one selected model. When no configured provider is selected, the
command remains closed and directs the operator to `/providers`. When the
provider is selected but has no model, it remains closed and directs the
operator to `/models`. These prerequisites do not infer model capabilities or
mutate either retained setting.

Starting a turn captures only the current effort. Every continuation in the
same tool loop uses that immutable value. The provider-neutral runtime accepts
reasoning events for `low`, `medium`, and `high`, rejects them for `off`, and
continues to stage, bound, settle, and discard reasoning independently from
assistant text. Ollama Cloud translates the values exactly as follows:

- `off` becomes native `think: false`;
- `low` becomes native `think: "low"`;
- `medium` becomes native `think: "medium"`; and
- `high` becomes native `think: "high"`.

Generic boolean `true`, native `max`, model-specific aliases, capability
guessing, model-name rules, retry, replay, downgrade, upgrade, and fallback are
not admitted. `off` means that the product requests disabled reasoning and
admits no reasoning event; it cannot assert that a remote model performs no
private internal computation. A model that rejects or ignores an exact native
value does not cause a second request. Selecting another model retains the
exact effort and display values. If that model rejects the retained effort, the
turn fails explicitly and the settings remain unchanged.

Display remains entirely in the CLI controller. The chat state continues to
accept and settle reasoning whenever effort enabled it. With display `on`, the
existing transcript model renders those documents in their muted position
above assistant text. With display `off`, the controller filters reasoning
documents from the whole selected transcript, including restored and
prospective reasoning, without deleting or rewriting them. Changing display
while idle therefore reprojects already retained reasoning. Hidden settled
reasoning remains available for exact provider history, tool-loop continuity,
timeline selection, and version-two resume.

The footer reports the non-default pair compactly. It remains unchanged when
both values are `off`; otherwise it appends the exact current effort and stream
state. Display never changes transport streaming: Ollama Chat responses remain
native streamed responses in every configuration.

Decision 0083 is superseded by this complete activation and presentation
contract. Its requirements for native-field provenance, record atomicity,
separate state, independent bounds, non-executability, settled history, and no
implicit fallback remain incorporated here. Decision 0085 continues to own the
unchanged version-two journal schema; this decision adds no journal version or
record field.

## Bounds and failures

The setting surface uses the existing two-item selection and interaction-dock
bounds. Effort has four closed values and display has two. Invalid runtime
effort, malformed model options, an unavailable staged row or value, unexpected
reasoning while effort is off, and contradictory transcript state fail closed
through existing content-free failure families. A boundary key that cannot
move a value is inert.

Reasoning delta, response, conversation-tree, journal, native wire, transcript,
and viewport bounds remain unchanged. Hiding reasoning does not refund
conversation or journal capacity, weaken native validation, skip settlement,
or admit a larger model response. Showing it does not create a second retained
document model.

## Verification

Red/green runtime tests cover every effort value, immutable tool-loop reuse,
off-mode rejection, invalid values, cancellation, failure, and unchanged
reasoning bounds. Ollama contract tests prove each exact native request value,
strict option shape, record atomicity, selected-path reasoning continuity, and
no retry or fallback.

CLI and TUI tests cover the exact two rows, staged non-wrapping navigation,
atomic Enter, dismissal rollback, defaults, provider and model prerequisites,
model-selection preservation of both settings, hidden live and restored
reasoning, later reveal, footer text, focus, resize, cancellation, tool loops,
and cleanup. Journal tests prove that display changes neither the version-two
record nor version-one resume. Privacy, security, architecture, engineering,
provider, operator, maintenance, ownership, decision, documentation, manual,
and publication contracts change with the implementation. The canonical
verifier remains the final gate.

## Update, rollback, and removal

Changing either value set, defaults, prerequisites, ordering, key behavior,
application timing, model-selection preservation, footer truth, provider
mapping, hidden-data semantics, or journal relationship requires this decision
and all owning implementation, policy, manual, privacy, and regression surfaces
to change together.

Rollback first forces effort to `off`, sends `think: false`, and stops admitting
new reasoning. It then removes the two-row activation surface and display
filter while retaining version-two decoding and settled reasoning required by
decision 0085. Complete removal follows the same order and may remove durable
reasoning only through a separately accepted journal migration. Operators may
remove all local session content through the documented deletion of the exact
per-user `agent/sessions` state root.
