# 05 - Providers and authentication

Agent starts without a provider or model. Authentication is an external local
operator action; provider and model selection are explicit process-local TUI
actions.

## Connect a provider

Exit the TUI and run exact `agent auth`. It requires TTY input and output and
accepts no provider, key, option, or other operand. Choose register when the
record is absent, replace or remove when it is present, or cancel. Register and
replace use a zero-echo input owner: the key, mask, length, and caret never
appear in terminal output, shell history, transcript, journal, log, receipt, or
diagnostic. Registration is local storage admission and makes no network
request or provider-validity claim.

The provider-specific plaintext record is
`~/.agent/credentials/ollama-cloud.api-key`. `AGENT_OLLAMA_API_KEY` remains a
temporary automation source only when that record is absent. It is never
imported. If both exist, startup and `agent auth` fail as dual authority before
reading the durable payload. If only the environment source exists, unset it
before using `agent auth`. Neither credential source selects a provider or
model.

## Choose a model

Run `/models` and first select Ollama Cloud from the authenticated-provider
stage. Agent then sends one bearer-authenticated `GET` request to exactly
`https://ollama.com/api/tags`. The
catalog request sends no conversation, workspace path, file content, tool
schema, or tool result.

The selector lists only bounded catalog records whose exact non-empty `name`
equals `model`. Model identifiers are dynamic provider authority, not a local
allowlist or alias. Selecting one atomically sets both the active process-local
provider and model with the `cloud` cost label. A stale previous catalog cannot
authorize a later selection.
Every accepted model selection preserves the current process-only `/thinking`
Stream and Effort values.

## Switch the session

Run `/models` again to refresh the authenticated catalog and select another
current Ollama Cloud model. The command always begins with the authenticated-
provider stage. Provider and model selection are unavailable during generation,
tool execution, cancellation, or a pending permission decision. Authentication
changes are visible only after exiting and starting a new TUI session; there is
no credential hot reload.

Changing a selection affects later turns only. It does not rewrite committed
conversation history, replay completed tools, copy credentials, or retry a
failed request. Starting a new process returns to no selected provider and no
selected model, regardless of credential source; selection remains explicit.

After selecting a provider and model, run `/thinking` while idle to configure
two session-only rows. Effort is `Off`, `Low`, `Medium`, or `High`; Stream is
`Off` or `On`; both default to `Off`. Effort maps exactly to Ollama's native
`false`, `"low"`, `"medium"`, or `"high"` thinking request and remains fixed
across tool continuations. Stream controls only whether the separate reasoning
documents are visible. Both settings survive later model selections in the
same process. They do not infer model capability or authorize retry or
fallback; an unsupported retained effort fails explicitly and remains selected.

## Protect credentials and content

Agent accepts the Ollama key only through zero-echo `agent auth` or temporary
`AGENT_OLLAMA_API_KEY`. It never accepts the key as a CLI argument, projects its
value or length, or exposes it in errors. The owned record is strict plaintext,
not an operating-system keychain or encrypted vault. Native owner-only controls
protect it from ordinary access by another unprivileged account, not from
same-user processes, administrator or root, malware, backups, snapshots, memory
inspection, or offline privileged access. Local removal is not secure erasure
and does not revoke provider-side copies.

The authenticated catalog request necessarily sends the key to Ollama Cloud,
but no task content. Each chat turn sends the bounded conversation, current user
input, lean system instruction, current tool schemas, checkpointed tool results,
and settled native reasoning needed for selected-path continuity to exactly
`https://ollama.com/api/chat`. When Effort is enabled, that request also asks
for new native reasoning even if Stream is `Off`. Do not submit secrets,
personal data, or confidential content unless Ollama's current terms are
acceptable. Provider availability, pricing, retention, and data use can change
and are outside Agent's guarantees.

Subscription OAuth integrations remain inactive. The
[OAuth registration dossier](../OAUTH-REGISTRATION.md) owns their current
registration status, while the [provider policy](../PROVIDERS.md) owns runtime
admission. Decision 0089's owned credential boundary is active only for the
exact Ollama Cloud API-key record. It admits no OAuth field, generic credential
map, placeholder provider, browser flow, or compatibility reader.
Decision 0090 specifies a future OpenAI device OAuth contract. Decision 0091
permits a provider-owned non-secret public client while requiring `agent` as
the truthful caller identity and an independent-compatibility disclosure. Both
remain implementation-inactive and change no current command, credential
record, provider row, model row, or network request.

## Recover from provider failures

- A credential rejected by `agent auth` failed local bounded-format validation;
  run the command again with the exact key and no whitespace or control characters.
- An authentication-busy failure means another TUI holds the shared credential
  admission or another `agent auth` holds the exclusive admission. Close it and
  retry; Agent never waits, polls, steals, or retries the lock.
- A dual-authority failure requires removing either the durable record with
  `agent auth` after unsetting the variable, or unsetting the variable and
  starting a new process. Neither source wins implicitly.
- A store failure means ownership, access, link, inventory, schema, recovery,
  synchronization, or native-platform validation failed. Agent does not repair,
  delete, or fall back from unsafe state automatically.
- `Models could not be loaded` means no fresh catalog authority was created.
  Check the key, connectivity, account state, and Ollama availability, then run
  `/models` again.
- A prompt rejected before opening a turn means provider or model selection is
  incomplete; authenticate externally if needed, then use `/models`.
- `model/open` means no usable response stream opened. No tool ran and the
  attempted exchange was not committed.
- `model/read` means an opened stream failed while being consumed. If a tool
  checkpoint had already completed, that tool truth remains committed; do not
  repeat the effect implicitly.
- `model/empty-reasoning-delta` or `model/reasoning-limit` means native
  reasoning violated a separate runtime bound; no prospective response segment
  was committed.
- `cancelled`, `connectivity`, `lifecycle`, `limit`, `protocol`, `rejected`,
  `request`, and `timeout` are intentionally content-free failure families.
- For `model/open`, `request` identifies a client-request contract failure;
  `rejected` identifies account access, payment, authorization, or missing-model
  rejection; `limit` identifies an entity or rate limit; `timeout` identifies
  an HTTP timeout; `connectivity` identifies provider-side failure; and
  `protocol` identifies a rejected pre-stream contract. A model appearing in
  the fresh catalog does not guarantee entitlement, credit, quota, or capacity.
- `model/open/protocol` is intentionally unphased: an unexpected HTTP response,
  invalid content type, or malformed transport opening did not open an admitted
  native stream.
- The `model/open/rejected` notice therefore asks you to verify plan, credit,
  authorization, and model availability without claiming which provider-owned
  condition failed.
- `model/read/protocol/transport`, `/framing`, `/envelope`, `/message`,
  `/tool-call`, `/finish`, or `/terminal` identifies the first native response boundary
  that rejected an opened stream. It does not expose provider text or prove a
  model defect. Reproduce it with the same current model and report the exact
  content-free code; do not paste prompts, responses, or tool arguments.
- A native clean end is accepted after validated text, thinking, or a complete
  tool call. `/terminal` identifies a clean end with no validated contribution;
  an interrupted connection remains a transport failure rather than an
  accepted clean end.
- Finish metadata is checked before a response chunk becomes visible. A
  non-null reason is valid only as `stop` with `done: true`; non-terminal or
  truncated completion metadata fails at `/finish` and commits no thinking,
  assistant text, or tool call.
- Once an opened stream rejects one native record, later records and clean end
  cannot recover or complete that turn.
- Once any admitted read fails at transport, framing, envelope, message,
  tool-call, finish, or terminal, later reads do not consume provider data and
  return only the closed terminal failure. Report the first failure code.

The native decoder is shared by every selected model. Missing, null, and empty
tool-call members mean that a stream chunk contributed no call; real calls are
normalized in provider order and settled history uses one canonical native
form. Agent does not switch parsers, coerce serialized arguments, retry, or
change endpoints for one model.

Catalog availability, ordinary text completion, and native tool-call
interoperability are separate facts. A model can answer an ordinary text turn
and still end a tool-required turn without contributing a native call. In that
case, call-shaped tags or serialized arguments inside assistant text remain
non-executable text. Agent does not reinterpret them or remove the model from
the catalog. Return to `/models` and deliberately select another current entry
when work must continue; do not repeat an effect that may already have reached
a committed checkpoint.

Agent does not print response bodies, provider-specific causes, credentials,
prompts, or model content as diagnostics. It does not retry, change models, or
fall back to another endpoint after a catalog or chat failure.

## References

- [Provider eligibility and exact network boundary](../PROVIDERS.md)
- [Privacy and credential handling](../../PRIVACY.md)
- [Current provider architecture](../ARCHITECTURE.md#provider-boundary)
- [Provider update and removal procedure](../MAINTENANCE.md#ollama-cloud)
- [Current authority by domain](../decisions/README.md#current-authority-by-domain)
- [Ollama Cloud provider decision](../decisions/0072-owned-ollama-cloud-provider.md)
- [External authentication transition decision](../decisions/0089-owned-external-authentication-transition.md)
- [OpenAI subscription OAuth contract decision](../decisions/0090-owned-openai-subscription-oauth-contract.md)
- [Provider public-client compatibility decision](../decisions/0091-owned-provider-public-client-compatibility.md)
- [Provider HTTP outcome decision](../decisions/0080-owned-provider-http-outcome-classification.md)
- [Ollama tool-stream normalization decision](../decisions/0082-owned-ollama-tool-stream-normalization.md)
- [Bounded-thinking decision](../decisions/0083-owned-bounded-thinking-stream.md)
- [Reasoning-journal decision](../decisions/0085-owned-reasoning-journal-migration.md)
- [Ephemeral provider and model selection decision](../decisions/0068-owned-ephemeral-provider-and-model-selection.md)
- [Tool-call interoperability decision](../decisions/0069-owned-tool-call-interoperability.md)
