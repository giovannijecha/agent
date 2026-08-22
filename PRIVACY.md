# Privacy policy

## Product posture

`agent` is local-first software maintained by Giovanni Jecha. The project runs
no backend, analytics, advertising, telemetry, or crash-reporting service.
Provider traffic goes directly from the CLI to the exact selected provider
origin.

Agent starts without a provider or model. A submitted draft starts no turn and
is not retained when no runtime is configured. Catalogs, provider/model
selection, thinking settings, permission policy, drafts, active turns, and
provisional output are process-only.

## Workspace data and tools

The launch directory becomes one immutable canonical workspace. The three read
tools may return bounded file names or content from that workspace to the model.
Built-in sensitive-path denials and an optional deny-only `.agentignore` are
fixed before credentials and providers; denied paths are rejected or pruned
before content is opened.

Tool schemas, approved arguments, bounded results, conversation history, and
current user input may be sent to the selected model provider when needed for a
turn. Permission previews are local transient UI: patch previews may contain a
bounded portion of the exact changed rows, while namespace previews contain
paths and object state but no file content. Neither becomes transcript history.

An approved `shell` command keeps the launching user’s host filesystem and
network authority. Agent controls its environment, limits, cancellation, and
descendant cleanup, but does not inspect or sandbox everything the command may
read or send. Review the complete command before approval.

Agent emits only stable content-free failure families. Provider bodies,
credentials, raw stream records, prompts, tool arguments, file contents, model
output, account identifiers, numeric response details, and foreign causes do not
enter logs, notices, errors, receipts, or fixtures.

## Provider traffic

### Ollama Cloud

When `/models` stages Ollama Cloud, Agent sends one bearer-authenticated request
to `https://ollama.com/api/tags`. It contains the API key but no conversation,
workspace content, tool schema, or tool result.

After a model is selected, a turn sends the system instruction, bounded selected
conversation, user input, owned tool schemas, and necessary checkpointed tool
calls/results to `https://ollama.com/api/chat`. Native reasoning is requested
only when Effort is enabled; Stream controls its local visibility, not provider
transmission. Agent does not route through a project service, local daemon, SDK,
CLI, compatibility endpoint, or alternate origin.

Provider data use, retention, billing, quota, entitlement, and model availability
are controlled by Ollama and may change. Review current provider terms before
sending sensitive content.

### OpenAI subscription

OpenAI device sign-in sends the fixed non-secret public-client identifier to the
fixed OpenAI authentication endpoints. Agent displays only the fixed verification
URL and provider-issued one-time code, polls the fixed device route, and exchanges
the authorization code and PKCE verifier at the fixed token endpoint. These
requests contain no conversation, workspace path, tool content, provider
password, browser cookie, recovery code, or payment data.

After validation, Agent persists only the access token, refresh token, account
identifier, and access-token expiration. It does not persist the ID token,
device identity, displayed code, authorization code, PKCE material, claims,
complete response, or browser session.

The OpenAI catalog and Responses adapter are installed but inactive. No product
path reads the OpenAI record for runtime, refreshes or revokes it, constructs a
model transport, adds an OpenAI `/models` row, or sends task content to an
OpenAI model API. Claude, Kimi, and xAI subscription connections are absent.

## Credentials

`agent auth` is the sole interactive credential lifecycle and runs outside the
alternate-screen TUI with TTY input/output. Secrets are never accepted as
command-line arguments. Ollama keys use zero-echo input. OpenAI credentials come
only from the provider-hosted device ceremony.

The owned records are:

- `~/.agent/credentials/ollama-cloud.api-key`; and
- `~/.agent/credentials/openai.oauth`.

Ollama may instead use temporary `AGENT_OLLAMA_API_KEY` when no durable record
exists. The environment value is never persisted or imported. Both sources at
once fail as dual authority. OpenAI has no environment import.

Credentials are provider-specific plaintext protected by native ownership and
access controls. They are not an encrypted vault or operating-system keychain
and do not protect against same-user processes, administrators/root, malware,
backups, snapshots, memory inspection, or privileged offline access. Unsafe
links, inventory, ownership, permissions, schema, recovery, or concurrency fail
before secret payload bytes are read.

A TUI process holds one immutable credential snapshot for its lifetime.
Authentication changes become visible only in a new session. Local removal is
not secure erasure and does not revoke provider-side authorization; use the
provider account surface for remote revocation.

## Local sessions

An interactive `agent` launch writes complete settled conversation nodes and the
selected timeline head beneath `~/.agent/sessions`, outside the workspace.
`agent resume --latest` validates the newest inactive journal for that exact
workspace and creates a new continuation. It does not append to the source,
replay tools, restore files, or synchronize data.

A journal may contain user and assistant messages, separate settled native
reasoning, checkpointed tool calls/results, closed failure classification,
branch parents, and the selected node. It excludes credentials, catalogs,
provider/model selection, thinking settings, permission policy, drafts,
provisional output, temporary activity, foreign causes, and evaluation receipts.

Sessions use bounded plaintext JSONL and owner-only permissions where supported.
At most 32 validated sessions are retained per workspace; one journal is limited
to 16 MiB and the conversation retains the product bounds documented in
[Architecture](docs/ARCHITECTURE.md). Unique admission tokens serialize scan,
retention, resume, and publication. An incomplete final line may recover its
validated prefix; unknown versions, interior corruption, live peers, ambiguous
state, unsafe links, and synchronization failures stop content-free.

Legacy per-platform session state is migrated only for the accessed workspace by
one same-filesystem directory rename when there is no competing authority. Agent
does not copy, merge, overwrite, or remove conflicting data.

## Terminal, clipboard, and links

Conversation and composer selections stay in process memory. A successful copy
passes at most 65,536 UTF-16 code units to the owned Windows clipboard helper or
to a bounded OSC 52 terminal request. Clipboard content becomes external host
state after acceptance. Agent retains no clipboard history and launches no
foreign clipboard program.

Only exact visible ASCII `https://` text may become a terminal hyperlink to that
identical visible address. Agent does not hide destinations or launch a browser.
The terminal controls activation and its own security policy.

## Evaluation data

Maintainer evaluations store ignored runs under `state/evaluations/`. The
evaluator does not start a provider, execute candidate code, or capture prompts,
responses, transcripts, credentials, or personal identifiers. An optional
interactive receipt reports only bounded mechanical counts after terminal
cleanup and writes no file. See the [evaluation guide](evaluations/README.md).

## Removal

Closing Agent releases process-only conversation display state, selections,
credential snapshots, locks, and active runtime state. Durable sessions and
credentials remain until separately removed.

- Close every Agent process, then remove the exact `~/.agent/sessions`
  directory to delete all retained session content. Remove legacy per-platform
  session directories separately if they still exist.
- Remove provider records through `agent auth`. After every process closes, an
  empty credentials directory and exact provider lock may be removed without
  recursively deleting the surrounding `.agent` root.
- Clear accepted clipboard content through the operating system or terminal.
- Removing the repository does not remove user-scoped sessions, credentials,
  clipboard state, or externally installed toolchains.

Local deletion is not secure erasure. Revoke credentials and authorizations at
the provider when remote invalidation is required.
