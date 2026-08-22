# 05 - Providers and authentication

Agent starts without a provider or model. Authentication is an external local
operator action; provider/model selection is a separate process-only TUI action.

## Manage credentials

Exit the TUI and run:

```powershell
agent auth
```

The command requires TTY input/output, accepts no operands, and first asks for
Ollama Cloud, OpenAI, or cancellation.

### Ollama Cloud

Choose register when the record is absent, replace/remove when present, or
cancel. Register and replace use zero-echo input: the key, mask, length, and
caret never enter terminal output, arguments, shell history, transcripts,
journals, logs, receipts, errors, or documentation. Registration validates and
stores locally; it does not contact Ollama or prove the key works.

The durable record is `~/.agent/credentials/ollama-cloud.api-key`. Temporary
automation may instead use `AGENT_OLLAMA_API_KEY` when the record is absent.
The environment value is never persisted or imported. Both sources together
fail as dual authority; unset the variable before managing a durable record.

### OpenAI

Choose sign in when the record is absent, sign in again/remove locally when
present, or cancel. Agent states that the independently implemented
compatibility flow is not an OpenAI endorsement. It never asks for an API key,
password, cookie, recovery code, payment detail, or token and does not launch a
browser.

Agent displays exactly `https://auth.openai.com/codex/device` and one provider-
issued code. Open that address yourself, enter the code only there, and complete
the provider-hosted ceremony. The terminal waits; other keys are ignored.
Ctrl+C, Escape, Ctrl+D, EOF, or input failure cancels without publishing a
record.

The record `~/.agent/credentials/openai.oauth` contains only the validated
access token, refresh token, account identifier, and expiration. ID token,
device identity, displayed code, authorization code, PKCE material, complete
responses, claims, and browser state are not persisted.

OpenAI authentication is currently auth-only. Its catalog and Responses adapter
exist but no production path constructs them, reads the record for runtime,
refreshes/revokes it, adds an OpenAI `/models` row, or sends task content.

## Select a runtime model

Run `/models` and select Ollama Cloud from the authenticated-provider stage.
Agent then sends one bearer-authenticated GET request to exactly
`https://ollama.com/api/tags`. The request sends the API key but no conversation,
workspace data, tool schema, or tool result.

Only bounded catalog rows with equal non-empty `name` and `model` identifiers
are listed. Selecting one atomically sets Ollama Cloud and that model with the
`cloud` cost label. A stale catalog cannot authorize a later selection.

Run `/models` again to refresh and switch. The command is idle-only and always
begins with provider selection. Authentication changes require a new TUI process;
there is no hot reload. A new or resumed process again starts with no provider or
model regardless of available credentials.

## Thinking

After provider/model selection, `/thinking` stages process-only Effort and
Stream. Effort maps to Ollama’s native `false`, `"low"`, `"medium"`, or
`"high"` request. Stream controls only transcript visibility. Both default to
`Off` and remain unchanged when selecting another model in the process.

Agent does not infer capability from model names. If a selected model rejects
retained effort, the turn fails without retry, fallback, or settings mutation.

## Credential and content boundary

Owned records are provider-specific plaintext protected by native owner-only
controls, not an encrypted vault or keychain. They do not protect from same-user
processes, administrators/root, malware, backups, snapshots, memory inspection,
or privileged offline access. Local deletion is not secure erasure. Removing an
OpenAI record does not revoke provider-side authorization; use the provider’s
account surface when remote revocation is required.

Each Ollama chat request sends the bounded selected conversation, current user
input, system instruction, tool schemas, checkpointed results, and reasoning
needed for continuity to exactly `https://ollama.com/api/chat`. Agent does not
redirect, discover, retry, alias, route, or fall back. Provider availability,
pricing, entitlement, retention, and data use remain provider-controlled.

Claude, Kimi, and xAI subscription integrations are absent.

## Recover from failures

- Local credential rejection: run the complete command again with the exact
  value and no surrounding whitespace/control characters.
- Authentication busy: close the TUI or other auth process holding admission,
  then retry. Agent does not wait, poll, or steal the lock.
- Dual authority: unset `AGENT_OLLAMA_API_KEY` or remove the durable record;
  neither source wins implicitly.
- Store failure: ownership, access, link, inventory, schema, recovery,
  synchronization, or native validation failed. Agent does not repair unsafe
  state or fall back automatically.
- OpenAI authentication failure: cancellation, rejection, expiration,
  connectivity, timeout, protocol, input/output, or cleanup published no record.
  Retry the complete ceremony only after resolving the content-free family.
- `Models could not be loaded`: no fresh catalog authority exists. Check the
  key, network, account state, and Ollama availability, then run `/models` again.
- `model/open`: no response stream opened; no tool executed.
- `model/read`: an opened stream failed. Preserve any earlier completed tool
  checkpoint and do not repeat its effect.
- `model/.../protocol/<phase>`: the first transport, framing, envelope, message,
  tool-call, finish, or terminal boundary rejected native stream data. Later
  records cannot recover the turn.

Agent never prints provider bodies, credentials, prompts, model output, or
foreign causes. Report only the exact content-free failure code.

See [Privacy](../../PRIVACY.md), [Security](../../SECURITY.md), and
[Architecture](../ARCHITECTURE.md#provider-boundary).
