# Privacy policy

## Current product

`agent` is local-first software maintained by Giovanni Jecha. It has no project
cloud service, analytics, advertising, crash-reporting endpoint, or telemetry.
The production executable is providerless by default and persists no chat
session or credential.

Without a configured runtime, submitted text is discarded after a generic
notice. It is not added to conversation state, displayed in the transcript,
written to disk, or sent over a network.

## Local tools

The five filesystem tools share the one canonical workspace selected at
startup, and `run_process` starts in one selected directory beneath it.
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
An approved `run_process` invocation is lifecycle-contained but not filesystem-

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

## OpenCode Go connection

When the operator enters an OpenCode Go key through the owned hidden prompt or
configures the exact environment variable and submits a turn, `agent` sends the
system instruction, bounded conversation,
owned tool schemas, user input, and necessary checkpointed tool calls and
results directly to `https://opencode.ai/zen/go/v1/chat/completions`. Provider
processing is governed by OpenCode's terms and privacy policy; requests never
pass through a project-owned backend. The official Go page currently states
zero-day retention and no training for Kimi K2.7 Code. Those terms can change
and are not guarantees made by this project.

The request disables parallel tool selection. A multi-part task may therefore
send additional bounded model requests as each structured tool result is
checkpointed and the remaining goal is reassessed. This changes request timing,
not the categories of transmitted content, credential handling, retention, or
the fixed destination above. No tool handler is executed concurrently.

`agent` never asks for provider passwords, cookies, recovery codes, payment
details, or one-time codes. The OpenCode Go API key is accepted only through the
documented hidden prompt or environment variable and remains in process memory.
The prompt disables terminal echo and writes no key or mask characters.
Persistent storage requires a separate accepted operating-system vault design.
The four subscription OAuth connections remain disabled.

## Future local sessions

Local session persistence is disabled. If implemented, it must be opt-in,
versioned, bounded, inspectable, removable, and documented before release. It
must not silently upload or synchronize session data.

## Local task evaluation

The optional evaluation tool creates runs only under ignored
`state/evaluations/`. A prepared workspace contains the registered input files
and a content-free record template; it contains no expected snapshot, provider
credential, prompt capture, transcript, or personal identifier. The evaluator
does not start `agent`, contact a provider, or execute candidate workspace code.

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
the recorder.

The versioned evaluation failure registry is separate from local runs. It may
retain only a maintained task identifier, closed classifications, priority,
lifecycle, occurrence count, and fixture-relative changed, missing, or
unexpected path names. It excludes run identifiers, metric samples, candidate
contents, diffs, prompts, responses, transcripts, model or provider identity,
timestamps, credentials, personal identifiers, and free-form notes.

## Removal

Closing the current process releases its in-memory conversation, display state,
selection state, and key reference. Clipboard content accepted by the terminal
is external host state and must be cleared through that terminal or operating
system. The operator must also remove the environment variable from
any still-running parent shell. Removing the workspace removes all owned source and generated artifacts;
installed toolchain software remains outside the project. Future persistence or
credential features must add exact deletion instructions here before they ship.
