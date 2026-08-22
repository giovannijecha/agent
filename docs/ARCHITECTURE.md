# Architecture

This document describes the current product. It is a living contract: when the
runtime changes, update the implementation, tests, operator manual, and this
document together.

## System shape

Agent is one process with one identity, one serialized controller, one active
runtime session, and one selected provider-model pair. The product does not
contain sub-agents, delegation, swarms, background conversations, or a project
backend.

```text
terminal
   |
@agent/cli  -- credentials, workspace, persistence, network, native helpers
   |\
   | +-- @agent/tui
   | +-- @agent/provider-ollama-cloud
   | +-- @agent/provider-openai-subscription (installed, not composed)
   |
@agent/runtime -- @agent/tools -- @agent/core
```

Dependencies point inward. Every package exports through `src/index.ts`; deep
cross-package imports are forbidden.

| Package | Authority |
| --- | --- |
| `@agent/core` | Immutable conversation state, tool-call identity, model and permission domain types; no I/O |
| `@agent/tools` | Provider-neutral schemas, plans, results, and engine; Node-free |
| `@agent/runtime` | One bounded checkpointed model/tool loop; Node-free |
| `@agent/provider-ollama-cloud` | Ollama catalog, chat request, streaming decoder, and failure mapping; Node-free |
| `@agent/provider-openai-subscription` | OpenAI catalog and Responses protocol adapter; Node-free and currently uncomposed |
| `@agent/tui` | Agent-agnostic terminal state, layout, rendering, and input reduction; Node-free |
| `@agent/cli` | Sole Node/platform boundary and application composition |

Core and TUI never depend on each other. Provider packages never own terminal,
filesystem, credential, or process authority. The CLI injects those effects
through explicit bounded interfaces.

## Application lifecycle

The CLI accepts only the documented launch forms, resolves one canonical
workspace, fixes its deny-only read policy, admits credentials, prepares local
session state, takes terminal ownership, and starts the sole controller.

Normal interactive launch creates a new session. `agent resume --latest`
validates the newest inactive journal for the exact workspace and creates a
separate continuation. `agent auth` runs outside the alternate-screen TUI and
owns interactive credential mutation. Redirected input or output fails for
interactive commands.

The controller serializes:

1. input reduction and slash commands;
2. model turns and cancellation;
3. permission decisions;
4. writes, namespace mutations, and shell execution;
5. conversation checkpoints and journal publication; and
6. terminal frames and shutdown.

The only concurrency exception is one cohort of two to four independent
registered read calls. The complete batch is validated and every permission is
settled first. The cohort cannot overlap an effect, and results are reduced in
provider order before the next model decision.

## Conversation and turn lifecycle

Core owns one bounded immutable conversation tree. A node records one settled
user/assistant turn or one complete tool checkpoint and its parent identity.
Runtime sees exactly the selected root-to-node path. `/timeline` changes the
selected node only while idle. Appending after an older selection creates a
sibling without deleting its former continuation.

Selection never replays a tool, rewinds the workspace, or treats an old
observation as current. Every later effect is planned and authorized against
current state.

A model turn follows this order:

1. validate the selected provider, model, bounded conversation, and input;
2. open exactly one provider response stream;
3. accumulate bounded assistant text, native reasoning, or one ordered tool
   batch;
4. validate and plan the complete batch in provider order;
5. obtain one exact permission per successfully planned call;
6. execute serially or as the one admitted read cohort;
7. commit one truthful tool checkpoint before continuing; and
8. commit the final assistant result only after runtime and CLI settlement.

Streamed content remains provisional until its segment settles. Cancellation or
failure discards only content newer than the last completed checkpoint. A
completed effect is never retried, replayed, or erased implicitly.

The conversation retains at most 128 settled turns, 256 provider-message units,
and 1,048,576 code units. One provider response admits at most 32 tool calls and
every input, result, stream, and render surface has a fixed bound enforced by
its owner.

## Capability surface

The model sees exactly six tools:

| Tool | Capability | Default |
| --- | --- | --- |
| `read_file` | Read one bounded file, optionally projecting logical lines | `Allow` |
| `list_directory` | Enumerate one directory without recursion | `Allow` |
| `search_text` | Search bounded text under the workspace | `Allow` |
| `apply_patch` | Create or update one text file through exact ordered hunks | `Ask` |
| `manage_path` | Create one directory, move one object, or remove one file/empty directory | `Ask` |
| `shell` | Run one exact approved native-shell command | `Ask` |

The provider-neutral tool boundary validates one complete ordered batch before
execution. Planning observes current state just in time and produces immutable
plans. `/permissions` stores one process-only `Allow`, `Ask`, or `Deny` value per
exact tool; permission cannot widen a schema, path, platform, limit, or effect.

### Workspace and reads

Startup canonicalizes the exact current directory once and never discovers a
broader repository. Volume roots, the exact native account home, shared
temporary storage, and workspaces containing or located inside the native
`~/.agent` state root fail before credentials or terminal ownership.

All filesystem tools receive that same root. Built-in rules deny
`.agentignore`, `.git`, `.env` variants, common SSH/cloud/package credential
locations, conventional private-key names, and sensitive key/certificate file
extensions. A bounded root `.agentignore` may add denials but cannot negate a
built-in rule. Linked, malformed, changed, inaccessible, or oversized policy
input fails closed. Read tools recheck resolved targets before opening content.

### Mutations

`apply_patch` binds one authorization to a canonical target, exact ordered
hunks, object identity or absence, strict UTF-8 source, and content digests. Its
owned native Windows/Linux committer rejects stale or retargeted state before
one file publication. It is not a multi-file transaction, durability guarantee,
rollback system, or sandbox.

`manage_path` binds one authorization to a canonical source/destination,
observed kind and identity, parent identities, and destination absence. It
never overwrites, merges, recursively removes, or creates parents implicitly.
Windows supports create, move, and removal through the native object boundary.
Linux currently admits verified directory creation and rejects move/removal
before permission because the available primitive cannot preserve the approved
object identity.

### Shell

`shell` receives one exact command and workspace-relative working directory.
Linux uses profile-free `/bin/bash`; Windows uses profile-free, non-interactive
Windows PowerShell with a fixed UTF-8 prelude. The environment contains only the
documented platform, locale, home, temporary, application-data, and PATH values;
provider credentials and the unfiltered parent environment are excluded.

The command may still use the launching user’s filesystem and network
authority. Owned native containment bounds execution, output, cancellation, and
descendant-tree cleanup. Interactive programs, retained services, and work that
outlives settlement are unsupported.

## Provider boundary

Agent starts without a provider or model. Authentication never selects either.
`/models` first stages one authenticated runtime provider, requests only that
provider’s fresh catalog, and then atomically selects its provider-model pair.
Catalog and selection remain process-only.

### Ollama Cloud

Ollama Cloud is the sole active runtime provider. It uses exactly:

- `GET https://ollama.com/api/tags` for a bearer-authenticated catalog; and
- `POST https://ollama.com/api/chat` for bearer-authenticated native streaming
  chat.

Only catalog rows with equal non-empty `name` and `model` identifiers are
selectable. The adapter uses Ollama’s native chat and tool-call contract. It
does not follow redirects, discover origins, retry, alias models, route through
another process, use a local daemon, or fall back.

The streaming decoder admits bounded native text, separate reasoning, and one
ordered tool-call batch. The first transport, framing, envelope, message,
tool-call, finish, or terminal violation permanently fails that stream. Later
records cannot recover partial output or convert it into success.

### OpenAI subscription

`agent auth` implements the fixed provider-hosted device ceremony with PKCE and
stores only the validated access token, refresh token, account identifier, and
expiration. It identifies the caller as `agent` or omits the caller field and
states that the compatibility flow is independent and not provider-endorsed.

The `@agent/provider-openai-subscription` package implements bounded offline-
injectable catalog and Responses contracts. It is deliberately not composed:
no startup, command, TUI, provider session, or runtime path reads the OpenAI
record, refreshes or revokes it, constructs the transport, lists its models, or
sends conversation content. Activation requires a complete later change across
composition, lifecycle, tests, privacy/security, operator behavior, and removal.

Claude, Kimi, and xAI subscription connections remain absent.

## Credentials and sessions

The CLI owns separate user-scoped plaintext state beneath the native-resolved
`~/.agent` root.

Ollama Cloud uses one provider-specific API-key record or the temporary
`AGENT_OLLAMA_API_KEY`; simultaneous sources fail as dual authority. OpenAI has
no environment input. A TUI holds an immutable credential snapshot under shared
native admission for its lifetime; `agent auth` holds exclusive admission across
recovery, input, mutation, atomic publication, and cleanup. Unsafe links,
inventory, ownership, access, schema, or recovery fail before secret bytes are
read.

Interactive sessions store only settled conversation nodes and the selected
head under `~/.agent/sessions`, keyed by an irreversible canonical-workspace
digest. Provider/model selection, permission policy, thinking settings, drafts,
provisional output, credentials, and foreign causes are excluded. Journals are
bounded JSONL plaintext, owner-protected where supported, and serialized by
unique admission tokens. An incomplete final line may recover its valid prefix;
interior corruption and ambiguous concurrency fail closed.

The credential store and session journal do not claim encryption, secure
erasure, tamper resistance, or protection from same-user processes,
administrators/root, malware, backups, snapshots, memory inspection, or
privileged offline access.

## Terminal boundary

TUI state is pure and Node-free. The CLI owns raw mode, alternate-screen entry,
mouse and bracketed-paste modes, input decoding, frame output, clipboard/native
helpers, and cleanup. Only the renderer produces ANSI and terminal control
sequences; model and tool text cannot select styling.

The transcript is primary. One interaction dock hosts the composer and all
selectors. Contextual notices and tool activity are bounded, replaceable, and
never become transcript history. The renderer recognizes only the documented
bounded Markdown subset and exposes a visible ASCII `https://` URL only as a
link to that identical visible address.

Ctrl+C cancels active work and exits while idle. `/exit`, Ctrl+D, and EOF close
from any phase. Shutdown restores terminal state and attempts runtime, native,
credential, and session cleanup even after another failure.

## Verification and maintenance

`tools/verify.ps1` and `tools/verify.sh` own the platform-native release gate.
The gate validates toolchain, documentation, CI, brand, evaluation corpus,
provider registry, manifests, lock topology, declarations, source hygiene,
package imports, build, tests, native helpers, and CLI smoke behavior.

The machine registries under `tools/` describe exact executable contracts; they
are not a second prose manual. Update a registry only with the code and focused
regressions it protects. Diagnosis, rollback, release, and removal practice is
defined in [Engineering](ENGINEERING.md). Operator behavior lives in the
[manual](manual/README.md), and data/security boundaries live in
[Privacy](../PRIVACY.md) and [Security](../SECURITY.md).
