# 0068: Owned ephemeral provider and model selection

- Status: superseded
- Date: 2026-08-16
- Supersedes: the startup credential and fixed-model selection parts of decision 0067
- Amends: decisions 0017, 0018, 0029, 0034, 0042, and 0061
- Superseded by: decision 0072

## Context

Decision 0067 proved that one running agent can route future turns through one
of two independently configured OpenCode backends without adding another
runtime, conversation, or agent. Its startup contract, however, asks for both
credentials before terminal ownership and binds each provider to one fixed
model. That ordering makes an ordinary `agent` launch depend on integrations
the operator may not intend to use and gives model choice no contextual home.

OpenCode publishes distinct public model-list endpoints for Go and Zen. The
lists describe current identifiers but do not authenticate an API key, bind a
model to a wire protocol, establish tool behavior, or preserve pricing and
privacy terms. Showing every remote identifier as usable would therefore grant
the remote catalog authority over the owned request boundary.

## Decision

`agent` enters the alternate-screen TUI immediately after the existing
workspace and read-policy checks. It never prompts for a provider credential
before terminal ownership. The exact optional environment inputs
`AGENT_OPENCODE_GO_API_KEY` and `AGENT_OPENCODE_ZEN_API_KEY` remain automation
preloads, but they only mark their corresponding provider configured. They do
not select a provider or model and never create a startup prompt.

The CLI always composes the two closed provider identities, `opencodeGo` and
`opencodeZen`, into one `ProviderSession`. `/providers` is the sole interactive
configuration and provider-selection command. Its contextual transparent
selection list always shows both supported providers. Activating an
unconfigured provider opens one concealed composer mode for that exact
provider. The generic bounded line editor retains the submitted credential,
but its projection exposes no credential or mask characters. Enter submits the
credential, Ctrl+C cancels and clears it, and successful local validation marks
the provider configured and active. Activating an already configured provider
selects it without reading or copying another credential.

The credential context uses the same transparent responsive surface as the
other selectors. Its single head says `Connect <provider>` and `process only`.
While that context is active, the generic composer trailing-status path shows
the exact muted guidance `Enter API key · Ctrl+C cancels`; no separate guidance
row is rendered. These strings are CLI-owned guidance, not credential state.
The context and composer never display a mask, length, validation detail, or
provider-returned text.

Configuration is not authentication. `agent` does not claim a credential is
valid merely because it satisfies the local bounded syntax or because the
public model catalog responds. A provider becomes configured before its first
authenticated model request; ordinary provider status failures remain on the
existing content-free runtime failure path.

`/models` is the sole model-discovery and model-selection command. It is
available only while idle and only after one configured provider is active.
The command performs one explicit bounded HTTPS GET against the exact active
provider catalog:

- Go: `https://opencode.ai/zen/go/v1/models`
- Zen: `https://opencode.ai/zen/v1/models`

The catalog request sends no provider credential, follows no operator-selected
origin or path, admits no redirect, and retains no response after the process.
One CLI-owned monotonic wall-clock deadline is armed exactly once before the
request opens and is cancelled on every settlement. It is independent of the
Node socket inactivity timeout: response traffic cannot extend the wall-clock
deadline. Expiry or inability to arm the deadline fails closed, destroys the
active request and response, and late transport or timer events are inert.
The decoder accepts only the bounded OpenAI-style model-list envelope, exact
bounded identifiers, a bounded number of unique rows, and an exact JSON media
type. Connection, timeout, status, media-type, size, and shape failures become
content-free contextual notices.

Remote presence is necessary but not sufficient. Each provider adapter owns a
closed allowlist of identifiers documented by OpenCode for its existing Chat
Completions endpoint. `/models` displays only this intersection:

`remote provider catalog` intersected with `agent-owned compatible allowlist`.

An identifier documented only for Responses, Messages, Gemini, or another
transport never appears. Each owned model record also carries one closed
operator-facing cost class: `Go plan`, `Zen balance`, or `free`. This class is
informational and does not estimate price. The manual warns that provider
terms can change and that choosing a Zen-balance model may incur charges.

Model selection is accepted only from the most recently decoded catalog for
the configured active provider. It creates the concrete provider model adapter
with that exact closed identifier and replaces the model used for the next
turn. Switching providers restores that provider's session model if one was
previously selected. Reconfiguring a provider clears its credential-bound
model and catalog snapshot. There is no default model, fallback provider,
fallback model, retry through another backend, ambient catalog refresh, or
model change during an active turn.

Submitting prose without one configured active provider and selected model is
rejected before `AgentRuntime.startTurn` with one contextual notice directing
the operator to `/providers` or `/models`. Once ready, the existing single
`ProviderSession` remains the only `StreamingModel` port exposed to the one
runtime. Tool execution, permissions, conversation checkpoints, and terminal
output remain serialized.

## Security and privacy contract

Credentials, selected provider and model, decoded catalog rows, and concrete
model adapters live only in the running process. They are never written to
source, configuration, run state, logs, notices, transcripts, receipts, or
documentation examples. Cleanup clears application projections and process
exit releases all session state. This decision deliberately adds no vault,
credential file, operating-system keychain, refresh token, remembered default,
or cross-process cache.

Concealed entry is not a terminal echo prompt and does not create a second
editor. Pointer selection and clipboard projection cannot observe the retained
credential because the application exposes only an empty generic editor
projection in that mode. Tests use synthetic credentials and assert their
absence from frames, notices, errors, and snapshots.

The provider catalog is availability evidence only. It cannot widen the exact
origin, Chat Completions path, request schema, model allowlist, tool schema,
permission policy, workspace boundary, or process authority. Unknown and
removed model identifiers fail closed.

## Verification

Pure provider-session tests cover two disconnected providers, independent
configuration, no implicit selection, configured selection, credential-bound
model creation, per-provider model retention, reconfiguration invalidation,
remote-catalog intersection, stale or unknown selection rejection, and exact
delegation without fallback. Provider adapter tests cover every admitted model
identifier and reject unknown identifiers before transport use.

Catalog decoder and Node HTTPS contract tests cover both fixed paths, absent
authorization, no redirect behavior, bounded headers and bodies, exact media
type and shape, duplicate and unknown rows, timeouts, cleanup, and content-free
failures. Deterministic clock tests prove the independent wall-clock deadline,
successful cancellation, failed scheduling, and inert late callbacks while a
peer continues to provide response data. CLI tests cover prompt-free launch, `/providers`, explicit
concealed-entry guidance, secret-free frames, Ctrl+C cancellation, `/models`,
contextual selection, footer settlement,
unready turn rejection, and secret absence. No canonical test contacts
OpenCode, reads a real credential, or persists session state.

The command catalog, manual, provider inventory, privacy policy, architecture,
ownership record, source policy, and canonical Windows and Linux gates change
together.

## Update, rollback, and removal

To add or remove a selectable model, recheck the provider's current model and
privacy documentation, update the provider-owned compatible allowlist and cost
class, add exact request tests, and run a maintainer-operated live evaluation.
A remote catalog change alone never edits the allowlist.

The catalog client can be removed by deleting `/models`, its fixed-path client,
model menu, model policy, tests, and manual sections, then restoring one
decision-selected fixed model per provider. Concealed TUI configuration can be
rolled back independently by removing its application mode and restoring an
explicitly documented credential input boundary. Removing one provider removes
its credential slot, catalog path, allowlist, factory, documentation, and tests
without changing the other. Every rollback must retain one runtime, no
fallback, memory-only secrets, and the complete canonical verifier.
