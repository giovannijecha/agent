# Privacy policy

## Current product

`agent` is local-first software maintained by Giovanni Jecha. It has no project
cloud service, analytics, advertising, crash-reporting endpoint, or telemetry.
The production executable starts with no provider or model selected and
may persist only the exact provider-specific Ollama Cloud API-key record under
`~/.agent/credentials`. Catalogs, provider/model selection, thinking settings,
and permission policy remain process-only. An explicit interactive launch also
keeps the bounded settled conversation journal described under
[Local sessions](#local-sessions).

Without a configured runtime, submitted text is discarded after a generic
notice. It is not added to conversation state, displayed in the transcript,
written to disk, or sent over a network.

Provider failures retain only a closed operation, family, and, for opened
native-stream protocol failures, one phase from `transport`, `framing`,
`envelope`, `message`, `tool-call`, `finish`, or `terminal`. Numeric status,
headers, response bodies, raw stream records, model output, tool arguments,
credentials, and foreign causes are not retained, journaled, logged, rendered,
or copied into fixtures. Phase labels diagnose an owned boundary and do not
identify provider content.
An unexpected HTTP response class is retained only as the unphased open-time
protocol failure because no native stream was admitted.
The adapter may distinguish a clean HTTP end from an aborted or errored stream
only through the content-free transport lifecycle. It retains neither the
validated contribution used to establish completion nor the foreign cause.

## Local tools

The five filesystem tools share the one canonical workspace selected at
startup, and `shell` starts in one selected directory beneath it.
Filesystem handlers do not use ambient network access. Read tools start as
`Allow`; write and execute tools start as `Ask`. `/permissions` can set each
exact tool to `Allow`, `Ask`, or `Deny` for the current process session only.
The policy is never persisted or sent to a provider. The terminal UI avoids placing raw prompts, file
contents, tool outputs, credentials, and foreign error causes in notices or
logs.

The compact transparent activity line exposes only a closed display action, an
optional admitted safe subject, and written lifecycle state. Canonical tool name
and risk validate the projection but do not repeat as visible text. It does not
add raw arguments, output, result counts, durations, call identifiers, or an
activity history. The next tool replaces it and turn settlement removes it.

An `apply_patch` permission preview is intentionally concrete. While `Ask` is
pending, its local activity surface may display the canonical target and exact
human-readable changed rows when the patch fits the 2,048-code-unit preview.
Exact complete logical context shared by both sides of one hunk is removed from
the display before budgeting; it remains inside the authorized plan and is not
counted as omitted content. An otherwise ambiguous terminal-separator-only
change exposes only its exact printable ASCII escape inline on the owning
changed row; source backslashes remain doubled. Larger changed fields are limited to bounded prefix
and suffix excerpts with an explicit omitted-code-unit count. State digests,
object identity, complete untrimmed hunks, observed and replacement content,
aggregate counters, and tuple metadata remain
inside the effect plan rather than becoming UI content. Its mutation-specific path is bounded to 447 code units
and 896 exact structured-projection code units so the full target and the closed
32-hunk compact omission form always fit the preview; read-tool path limits are
independent. This permission content is neither transcript nor log and is released
when the tool activity settles. Planning failures show no preview and request
no permission prompt.

The pending `manage_path` preview contains only the closed operation, bounded canonical
source or target, destination when present, observed object kind, and exact
stale-state identities required for commitment. It includes no file content or
directory listing, authorizes only one exact planned effect, and is released when
activity settles.

Authorized content and namespace mutations cross only their separate private
package-local native commit brokers. Each broker receives one bounded
content-bearing or content-free protocol request and returns a fixed
content-free status: paths, file content, handles, identities, and native causes
never return through that boundary or enter notices and logs. A broker persists
no request state and is launched once per authorized effect.

Before credentials or terminal ownership, `agent` fixes one immutable read
policy for the session. Built-in rules deny `.agentignore`, `.git`, `.env` and
`.env.*`, common SSH and cloud credential directories, package and Git
credential files, conventional private-key names, and `.key`, `.pem`, `.p12`,
`.pfx`, `.jks`, and `.keystore` files. An optional root `.agentignore` adds
deny-only workspace rules through the bounded grammar in decision 0042. A
missing file means built-ins only; an inaccessible, malformed, linked,
non-regular, or oversized policy makes startup fail closed.

`read_file` rejects denied targets before observing them. `list_directory`
omits denied children, and `search_text` prunes denied directories and files
before opening them. Resolved targets pass the same policy again, and Windows
DOS short-name aliases fail closed rather than bypassing a long-name denial.
These rules protect only automatic built-in disclosure; they do not scan file
contents or alter approved writes. Start `agent` from the narrowest intended
directory and keep credentials outside it whenever possible.
An approved `shell` invocation is lifecycle-contained but not filesystem- or
network-sandboxed; its command retains the launching user's authority. The
target receives only the fixed decision-0073 environment allowlist, never the
Ollama credential or the unfiltered parent environment.

## Terminal selection and links

Conversation and composer selections remain bounded in process memory. When a
non-empty range settles, `agent` copies its visible logical text. On Windows
x64, the CLI passes one bounded UTF-16LE frame to its exact generated C17 broker
with no arguments, shell, inherited environment, or retained service. The
broker writes `CF_UNICODETEXT` through the operating-system clipboard API, and
the UI confirms success only after that API accepts ownership. On platforms
without that admitted native boundary, the renderer writes OSC 52 and reports
only that it asked the terminal host to copy; the host may ignore the request or
apply its own clipboard policy. Failure is visible and nonfatal.

The native copy boundary has a two-second operation deadline and a
250-millisecond post-kill cleanup deadline; missing or late child events cannot
turn a failure into success. A failed OSC 8 or OSC 52 output leaves no personal
content in application state, and the renderer closes the possible terminal
string before emitting later frames or cleanup controls.

Both paths are limited to 65,536 UTF-16 code units, contain no layout padding
or hidden Markdown destination, retain no clipboard history, make no network
request, and launch no foreign clipboard program. Clipboard content is external
operating-system or terminal state after acceptance.

Recognized inline-code, single-asterisk emphasis, and strong-text delimiters are
display syntax and are omitted from copied visible logical text. Incomplete or
unsupported delimiter runs remain visible and therefore remain copyable; neither
case introduces hidden content or a hidden destination.

Exact visible ASCII `https://` text may be emitted as an OSC 8 hyperlink whose
destination is identical to the visible text. Markdown labels, hidden targets,
other schemes, credentials, browser launching, and link telemetry are excluded.
The terminal owns activation and any security prompt. Holding Shift retains the
terminal's optional native selection route while application mouse reporting is
active. Ctrl+C remains the agent interrupt and is not a copy shortcut.

## Ollama Cloud connection

When the operator selects Ollama Cloud, `/models` sends one bearer-authenticated
GET request to `https://ollama.com/api/tags`. The request contains the API key
but no conversation, workspace data, tool schema, or tool result. The strict
bounded response admits only rows whose `name` and `model` identifiers are
equal, and the resulting catalog snapshot remains only for the current process.

After the operator selects one available model and submits a turn, `agent`
sends the system instruction, bounded conversation, owned tool schemas, user
input, and necessary checkpointed tool calls and results directly to
`https://ollama.com/api/chat`. Requests use Ollama's native chat contract with
streaming enabled. Reasoning output is disabled by default; if the operator
selects `Low`, `Medium`, or `High` Effort with `/thinking`, that turn requests
native reasoning separately from assistant content. Requests never pass through a
project-owned backend, local Ollama daemon, SDK, CLI, compatibility endpoint,
or alternate origin.

One response may contain one bounded ordered tool-call batch. The runtime
validates the complete batch, then plans and authorizes calls in provider
order. Effects remain sequential; two to four explicitly registered independent
inspection handlers may overlap only after every exact cohort permission
settles. Their individually
truthful results are reduced in provider order and checkpointed before another
model decision. The cohort shares the same workspace boundary and read-denial
policy and cannot widen disclosure. Selecting a provider or model never
redirects, retries, aliases, routes, or falls back to another backend.

If chat returns a non-successful HTTP status, the provider adapter derives one
closed content-free failure family from the ephemeral status and closes the
response. The numeric status, headers, and error body are not retained, read for
diagnosis, returned in errors, written to the terminal, journaled, logged, or
emitted as output fixture values.
During native response decoding, the adapter retains only accepted bounded
contributions and one content-free rejected state. The first rejected record
terminalizes that decoder; later records and a clean response end cannot recover
it or turn earlier accepted evidence into successful completion.
The owning stream applies the same terminal transition to transport, UTF-8, and
NDJSON failures before returning them. Later reads cannot inspect more provider
bytes or convert an earlier partial contribution into a completed response.

Fixture inputs may enumerate public numeric status codes solely to prove the
closed mapping; those inputs are not returned diagnostics and contain no
captured provider response.
Catalog membership never causes agent to infer or persist account entitlement,
credit, quota, or capacity.

`agent` never asks for provider passwords, cookies, recovery codes, payment
details, or one-time codes. The Ollama API key is registered, replaced, or
removed only by the exact external `agent auth` command in a TTY, outside the
alternate-screen UI. Input is zero-echo and the key, mask, and length do not
enter command arguments, shell history, frames, notices, transcripts, logs,
errors, receipts, or documentation values. The owned plaintext record is
protected by native owner-only filesystem controls; it is not an encrypted
vault and does not protect against same-user processes, administrators or root,
malware, backups, snapshots, memory inspection, or privileged offline access.
On Windows those credential controls begin at the exact lock and `credentials`
child. The native-resolved profile and shared `.agent` root are non-reparse
lineage and may retain their operating-system owner and DACL without becoming
credential authorities.

An interactive Agent holds one immutable process-memory credential snapshot
under a shared native admission lock for its full lifetime. `agent auth` holds
the exclusive lock across recovery, input, mutation, publication, and cleanup.
Unsafe metadata, links, ownership, permissions, schema, inventory, concurrency,
or recovery state fails closed before secret payload bytes are read. The
temporary `AGENT_OLLAMA_API_KEY` input is never persisted and never selects a
provider or model. If both authorities are present, startup fails explicitly;
there is no precedence or automatic import. Provider data-use, retention, billing,
quota, and model availability terms can change and are not guarantees made by
this project; review the current Ollama terms before sending sensitive content.
The Claude, Kimi, and xAI subscription OAuth connections remain disabled.
Decision 0094 activates only OpenAI device authentication through `agent auth`.
After the operator selects OpenAI and acknowledges the independent-
compatibility disclosure, Agent sends its fixed non-secret public-client
identifier to the fixed OpenAI device endpoint. It displays only the fixed
provider URL and provider-issued one-time user code, polls the fixed token route
with the device identity and code, and exchanges the returned authorization
code and PKCE verifier at the fixed token endpoint. These authentication
requests contain no conversation, workspace path, file content, tool schema,
tool result, provider password, browser cookie, recovery code, or payment data.

Successful validation persists only the access token, refresh token, account
identifier, and access-token expiration in the exact
`~/.agent/credentials/openai.oauth` plaintext record. The ID token, device
identity, displayed code, provider `expires_at` metadata, authorization code,
verifier, challenge, complete responses, and account claims are not persisted
or projected. Additional poll-success members are decoded only inside the
fixed body bound after duplicate-name validation, then discarded without local
authority. The private boundary has no environment input and protects
ordinary cross-account access with the same native owner-only controls and
same-user, administrator/root,
malware, backup, snapshot, memory, and offline-access limitations as the Ollama
record. Local removal does not revoke the provider-side authorization and is
not secure erasure; use an OpenAI-provided account surface when remote
revocation is required.

Decision 0095 installs no current OpenAI content path. Its catalog and Responses
implementation is unreachable from startup, commands, the TUI, and the runtime,
so it reads no record and sends no token, account ID, model query, task content,
tool schema, or tool result. OpenAI refresh, revocation, model selection,
transport construction, and conversation runtime remain inactive. An OpenAI
record therefore does not make OpenAI appear in `/models` and no task content
or bearer token is sent to an OpenAI model API.
The inactive Responses model stream nevertheless applies the runtime privacy
contract under offline injection: close releases queued output, completion,
decoded item and text state, SSE fragments, and partial UTF-8 before it awaits
transport cleanup. A pending read cannot decode bytes returned after close, so
the closed stream retains no partial provider response. The HTTPS stream also
ignores a retained `data` callback before flow control or copying once EOF,
failure, settlement, or close is authoritative; late bytes cannot repopulate its
released queue. Data emitted synchronously by `resume` remains in one bounded
stage until flow control succeeds, and a terminal callback raised by `pause`
prevents the chunk from being observed or retained. Terminal state is checked
again after every untrusted chunk snapshot, so accessor-triggered EOF, failure,
or close cannot publish bytes, decode content, or repopulate released state. A
catalog capture completed synchronously inside initial `resume` likewise remains
private until that call succeeds and is released if the flow-control call fails.
Catalog and Responses allow only one data callback to own a chunk snapshot;
accessor-triggered nested data fails before either chunk can alter retained
order, aggregate bytes, a pending read, or queue state. The model also rechecks
close after snapshotting an injected transport-result envelope, before a captured
value or error can repopulate or reclassify released response state.
The compatibility flow identifies the caller as `agent` or omits the caller
field, discloses that it is independent and not provider-endorsed, and never
imports a foreign credential or browser session.

### Thinking data

`/thinking` has two explicit session-only settings. `Effort` is `Off`, `Low`,
`Medium`, or `High`; `Stream` is `Off` or `On`. Both default to `Off`, can be
edited only after a provider and model are selected, and remain unchanged
through later model selections in the same process. They are never persisted.
Enabled effort requests native Ollama reasoning from the same exact chat origin
already used for the conversation. The adapter accepts only the provider's
separate bounded native field; it never derives reasoning from assistant text,
tags, tool-shaped text, or a model name. A newly selected model that rejects the
retained effort fails explicitly without changing either setting or causing a
second request.

With Stream `On`, validated reasoning is displayed in a distinct muted
transcript segment. Stream `Off` hides all reasoning documents from the selected
conversation but does not delete them, prevent provider transmission, or refund
their bounds. Provisional reasoning is discarded if its response segment or
turn fails or is cancelled. Only reasoning attached to a settled assistant
message or completed tool exchange enters conversation history and the local
session journal, including when hidden. It is never logged, diagnosed, retained
in evaluation receipts, admitted to evaluation fixtures, used as a tool input,
or shown in a permission preview. Effort and Stream themselves remain
process-only.

## Local sessions

An explicit interactive `agent` launch creates a version-two local session
journal outside the workspace. `agent resume --latest` restores the newest
inactive version-one or version-two journal for the exact canonical workspace
and creates a separate version-two continuation. The source is never rewritten
or appended. Resume never runs as a TUI command, never replays tools, never
restores old filesystem state, and never uploads or synchronizes an inactive
branch by itself. Non-TTY runs and `agent --evaluation-receipt` create no
session journal.

The journal contains the originating session identity, a monotonic publication
timestamp seeded by wall time, a SHA-256 workspace key, complete settled user
and assistant conversation entries,
complete checkpointed tool calls and results, closed checkpoint settlement or
failure classification, optional settled native reasoning kept separate from
assistant content, branch parent identities, and the selected node. It
therefore contains personal content and source or tool output already admitted
to conversation. It excludes provider credentials, catalogs, provider/model
selection, thinking settings, permission policy, drafts, streamed or speculative
output, active turn state, temporary activity, notices, foreign error causes, and evaluation
receipts. A resumed process starts with no provider/model selection or
permission grant; it independently admits a current credential snapshot through
the same startup boundary as a new session.

All platforms store current sessions under the exact `~/.agent/sessions`
directory selected from the credential-free native account-home resolver, not
from inherited home text. Each canonical workspace has one hashed directory;
its raw path is not stored in the journal. Directories request owner-only mode
`0700` and files request `0600` where supported. This is local plain-text JSONL,
not encryption or an operating-system vault. Other principals already
authorized by the host, backups, or malware may still observe it. The session
feature does not read or create a `credentials` or `settings` sibling. The
separate decision-0089 credential boundary owns only the exact Ollama Cloud
record and lock inventory under `~/.agent`.

For existing installations, an ordinary interactive launch considers only the
exact current workspace under the former `%LOCALAPPDATA%\agent\sessions`
Windows root or `${XDG_STATE_HOME:-$HOME/.local/state}/agent/sessions` POSIX
root. When only the legacy directory exists and all of its bounded sessions are
inactive, Agent renames that complete workspace directory into
`~/.agent/sessions`. It does not read unrelated workspace directories, rewrite
journal content, copy across filesystems, merge roots, overwrite a destination,
or delete either side of a conflict. Empty legacy parent directories and
unaccessed legacy workspaces remain until explicit removal.

The hashed workspace directory can briefly hold exact
`.admission-<process>-<identity>` files while launches validate retention and
publish a session. Each launcher owns one uniquely named token containing the
same process identifier. A launcher proceeds only when it observes no other
live token; overlapping launchers may all report busy. Normal completion
removes its token. A later launcher may remove a stale token only after the
operating system reports that its named process no longer exists. Because a
token pathname is never reused, stale reclamation cannot remove a successor.
These files contain no workspace path, credential, conversation, or provider
state.

One journal is limited to 16,777,216 UTF-8 bytes and the conversation remains
limited to 128 settled turns, 256 provider-message units, and 1,048,576 code
units. At most 32 validated sessions are retained for one workspace and at most
64 are scanned; admission separately scans at most 64 exact tokens. Creating a
new session removes the oldest unlocked exact session directories as needed
under the exact workspace admission; active or ambiguous sessions are never
removed. Its publication timestamp is strictly greater than every retained
session even if wall time ties or regresses. Concurrent admission reports busy
rather than exceeding either bound. Unknown versions and corruption fail closed. An
interrupted final line alone may be discarded, with an explicit recovery
notice, while its validated prefix is retained.

## Local task evaluation

The optional evaluation tool creates runs only under ignored
`state/evaluations/`. A prepared workspace contains the registered input files
and a content-free record template; it contains no expected snapshot, provider
credential, prompt capture, transcript, or personal identifier. The evaluator
does not start `agent`, contact a provider, or execute candidate workspace code.
Focused repository tests may execute only immutable versioned input and expected
fixtures to prove a maintained completion command; they never read or execute an
ignored candidate run.
The red-green fixture's assertion output is generated only from original
versioned source during repository verification. A live recovery run remains
normal product activity; the evaluator captures neither process output nor the
conversation around it.
The namespace-directory fixture contains only original static HTML and CSS.
Its live run uses normal product permissions, while the evaluator records no
directory request, patch content, provider response, or transcript.

Grading reads only the selected run workspace and reports bounded relative path
names classified as changed, missing, or unexpected. Completed records admit
only closed classifications and bounded integer counts. The operator must not
place secrets or personal content in task paths or record fields. Removing the
run directory removes all evaluation state owned by the framework.

The exact interactive `agent --evaluation-receipt` option records no prompt,
response, terminal output, file content, path, query, credential, or provider
payload. During the session it keeps only counters and SHA-256 digests of
bounded canonical successful read-request identities in memory. It emits no
digest and clears them on close. After terminal restoration it prints one ASCII
JSON line with elapsed milliseconds and accepted turn, tool-call, approval, and
repeated-read counts. It writes no file and ordinary `agent` runs do not create
the recorder. A lost receipt is not recoverable from another retained channel
and its values must not be guessed into the pending record.

The versioned evaluation failure registry is separate from local runs. It may
retain only a maintained task identifier, closed classifications, priority,
lifecycle, occurrence count, and fixture-relative changed, missing, or
unexpected path names. It excludes run identifiers, metric samples, candidate
contents, diffs, prompts, responses, transcripts, model or provider identity,
timestamps, credentials, personal identifiers, and free-form notes.
Evidence derived from a canonical expected snapshot that cannot satisfy its own
completion check is removed as invalid corpus evidence rather than retained as
a product diagnosis.

## Removal

Closing the current process releases its in-memory conversation, display state,
selection state, credential snapshot, credential admission lock, and session
lock. The settled local journal and durable Ollama record remain until their
separate bounded retirement or explicit removal. To remove all session
content owned by Agent, first close every `agent` process and then delete the
exact `~/.agent/sessions` directory. During the migration era, also delete the
former `%LOCALAPPDATA%\agent\sessions` directory on Windows or
`${XDG_STATE_HOME:-$HOME/.local/state}/agent/sessions` directory on POSIX to
remove unaccessed legacy workspaces. Delete neither the surrounding `.agent`
root nor a future sibling authority as part of session removal.
Removing only one hashed workspace directory removes all retained sessions for
that workspace, but the digest is intentionally not reversible to a displayed
path; inspect the versioned session headers before selective deletion.

Clipboard content accepted by the terminal
is external host state and must be cleared through that terminal or operating
system. To remove the Ollama Cloud credential, first close every `agent`
process, unset `AGENT_OLLAMA_API_KEY` in every relevant parent environment, and
run `agent auth` to select removal. After no process holds the credential lock,
the operator may remove only an empty `~/.agent/credentials` directory and the
exact `~/.agent/.ollama-cloud-credential.lock` file. Do not recursively remove
the surrounding `.agent` root because it also owns sessions. Local deletion is
not secure erasure and does not revoke the key at the provider; provider-side
revocation remains an independent account action.

Removing the workspace removes all owned source and generated artifacts but
does not remove the external hashed session directory or credential record.
Installed toolchain software remains outside the project.
