# 05 - Providers and authentication

Agent starts without a provider or model. Provider configuration and model
selection are explicit, process-local operator actions.

## Connect a provider

Run `/providers` while the application is idle. Ollama Cloud is the sole
admitted choice. Enter its API key in the concealed composer and press Enter;
Ctrl+C cancels without changing the session. The editor shows only the prompt
`Enter API key · Ctrl+C cancels`, projects no credential characters, and stores
no value or length in the transcript.

`AGENT_OLLAMA_API_KEY` may preload the same process-only credential for
automation. Preloading does not select the provider or a model. A key that
contains whitespace, control characters, or exceeds the fixed bound is rejected
before any network request.

The key lives only in the active `agent` process. Exiting releases it. Agent
does not create a credential file, update the environment, read Ollama
configuration, or use a local Ollama installation.

## Choose a model

After connecting Ollama Cloud, run `/models`. Agent sends one bearer-
authenticated `GET` request to exactly `https://ollama.com/api/tags`. The
catalog request sends no conversation, workspace path, file content, tool
schema, or tool result.

The selector lists only bounded catalog records whose exact non-empty `name`
equals `model`. Model identifiers are dynamic provider authority, not a local
allowlist or alias. Selecting one sets the active process-local model with the
`cloud` cost label. A stale previous catalog cannot authorize a later selection.

## Switch the session

Run `/models` again to refresh the authenticated catalog and select another
current Ollama Cloud model. Run `/providers` to return to the provider selector
or enter the provider credential when it is not configured. Provider and model
commands are unavailable during generation, tool execution, cancellation, or a
pending permission decision.

Changing a selection affects later turns only. It does not rewrite committed
conversation history, replay completed tools, copy credentials, or retry a
failed request. Starting a new process returns to no selected provider and no
selected model unless the credential environment variable is present; selection
still remains explicit.

## Protect credentials and content

Agent accepts the Ollama key only through the concealed editor or
`AGENT_OLLAMA_API_KEY`. It never accepts the key as a CLI argument, writes it to
files or logs, projects its value or length, or exposes it in errors.

The authenticated catalog request necessarily sends the key to Ollama Cloud,
but no task content. Each chat turn sends the bounded conversation, current user
input, lean system instruction, current tool schemas, and checkpointed tool
results to exactly `https://ollama.com/api/chat`. Do not submit secrets,
personal data, or confidential content unless Ollama's current terms are
acceptable. Provider availability, pricing, retention, and data use can change
and are outside Agent's guarantees.

Subscription OAuth integrations remain blocked. The
[OAuth registration dossier](../OAUTH-REGISTRATION.md) owns their current
registration status, while the [provider policy](../PROVIDERS.md) owns runtime
admission.

## Recover from provider failures

- A credential rejected during entry failed local bounded-format validation;
  re-enter the exact key without whitespace or control characters.
- `Models could not be loaded` means no fresh catalog authority was created.
  Check the key, connectivity, account state, and Ollama availability, then run
  `/models` again.
- A prompt rejected before opening a turn means provider or model selection is
  incomplete; use `/providers` and `/models` first.
- `model/open` means no usable response stream opened. No tool ran and the
  attempted exchange was not committed.
- `model/read` means an opened stream failed while being consumed. If a tool
  checkpoint had already completed, that tool truth remains committed; do not
  repeat the effect implicitly.
- `cancelled`, `connectivity`, `lifecycle`, `limit`, `protocol`, `rejected`,
  `request`, and `timeout` are intentionally content-free failure families.
- For `model/open`, `request` identifies a client-request contract failure;
  `rejected` identifies account access, payment, authorization, or missing-model
  rejection; `limit` identifies an entity or rate limit; `timeout` identifies
  an HTTP timeout; `connectivity` identifies provider-side failure; and
  `protocol` identifies an unexpected response class. A model appearing in the
  fresh catalog does not guarantee entitlement, credit, quota, or capacity.
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

The native decoder is shared by every selected model. Missing, null, and empty
tool-call members mean that a stream chunk contributed no call; real calls are
normalized in provider order and settled history uses one canonical native
form. Agent does not switch parsers, coerce serialized arguments, retry, or
change endpoints for one model.

Agent does not print response bodies, provider-specific causes, credentials,
prompts, or model content as diagnostics. It does not retry, change models, or
fall back to another endpoint after a catalog or chat failure.

## References

- [Provider eligibility and exact network boundary](../PROVIDERS.md)
- [Privacy and process-only secret handling](../../PRIVACY.md)
- [Current provider architecture](../ARCHITECTURE.md#provider-boundary)
- [Provider update and removal procedure](../MAINTENANCE.md#ollama-cloud)
- [Current authority by domain](../decisions/README.md#current-authority-by-domain)
- [Ollama Cloud provider decision](../decisions/0072-owned-ollama-cloud-provider.md)
- [Provider HTTP outcome decision](../decisions/0080-owned-provider-http-outcome-classification.md)
- [Ollama tool-stream normalization decision](../decisions/0082-owned-ollama-tool-stream-normalization.md)
- [Ephemeral provider and model selection decision](../decisions/0068-owned-ephemeral-provider-and-model-selection.md)
- [Tool-call interoperability decision](../decisions/0069-owned-tool-call-interoperability.md)
