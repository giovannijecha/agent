# agent

`agent` is an owned, zero-dependency personal coding agent with an original CLI
and terminal UI. All product code is written here; the workspace contains no
third-party runtime or development packages.

## Status

Single-agent streaming-runtime, tool-engine, and interactive-chat foundation.
The repository provides immutable structured conversation state, a bounded
transactional streaming and tool runtime, a provider-neutral schema/registry/execution
framework, registered bounded local coding tools, a complete vertical TUI
framework with a closed minimal emphasis layer, a single-writer chat reducer,
fair terminal/runtime arbitration, an
owned OpenCode Go adapter, and an owned verification system. Production remains
providerless by default. When the operator supplies the documented OpenCode Go
API key in process memory, the executable composes its fixed model adapter and
the existing tool engine. No session or credential is persisted.
Requested subscription integrations remain behind a fail-closed eligibility
policy; none is enabled with a borrowed client identity.

The single-agent execution model is deliberate: one identity, application
controller, active runtime session, and model decision loop. Providers are
replaceable backends for that agent, not additional agents. The project does not
create sub-agents, delegate to hidden workers, or coordinate a swarm. The sole
controller owns every decision. Current runtime remains sequential.
One model response may select a bounded ordered batch of tool calls. The sole
controller preflights the complete batch, then invokes handlers sequentially in
provider order. This is one agent decision, not delegation or a swarm.
Future controller-internal mechanical concurrency may overlap bounded
independent mechanics only over immutable snapshots during a read-only phase;
it cannot enter the tool engine or overlap a mutation, and its results return
for deterministic reduction. Model turns, writes, process execution, approvals,
and terminal output remain serialized.

The tool harness is deliberately lean. Every advertised tool has one canonical
name, a distinct current purpose, and an independent removal path. Decision
0014 forbids aliases and speculative convenience tools; verification binds the
reviewed inventory to source and rejects duplicate declared capabilities.

## Stack

- Node.js `>=22.19.0`
- TypeScript `5.9.3`, installed externally as toolchain
- C17 with Clang `>=18`, installed externally as native build substrate
- ECMAScript modules targeting ES2022
- npm workspaces with only exact local package edges
- Node's built-in test runner

The stack follows the same foundational category as Pi without importing its
code, packages, SDKs, declarations, or implementation choices.

## Workspace

```text
packages/agent-core  messages, structured values, tool entries, conversations, results
packages/agent-tools  schemas, descriptors, registry, risk, execution boundary
packages/agent-runtime  bounded streaming/tool turns and model port
packages/agent-provider-opencode-go  strict Node-free OpenCode Go wire adapter
packages/agent-tui   generic components, layout, input, frames, and renderer
packages/agent-cli   chat, arbiter, commands, built-in tools, Node lifecycle, composition
packages/agent-cli/native  private Windows/Linux process-containment proof
types/               minimal Node declarations authored here
tools/               ownership, build, test, and smoke verification
.github/workflows/   owned remote verification with no imported actions
docs/                operator manual, architecture, provenance, decisions
```

The current dependency edges are:

```text
@agent/tools -> @agent/core
@agent/runtime -> @agent/core
@agent/runtime -> @agent/tools
@agent/provider-opencode-go -> @agent/core
@agent/provider-opencode-go -> @agent/runtime
@agent/provider-opencode-go -> @agent/tools
@agent/cli -> @agent/core
@agent/cli -> @agent/provider-opencode-go
@agent/cli -> @agent/runtime
@agent/cli -> @agent/tools
@agent/cli -> @agent/tui
```

The CLI owns the optional runtime composition and the only network boundary.
The OpenCode Go package implements the provider-neutral streaming-model port
without Node or credentials; the CLI injects a fixed-origin HTTPS byte stream.
Runtime has no dependency on TUI, CLI, Node, transport, or provider identity.

## Setup and commands

Required toolchain: Node `>=22.19.0`, npm `11.16.0`, `tsc 5.9.3`, and Clang
`>=18` on `PATH`. TypeScript and Clang must remain outside this workspace.

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run install:command
agent
npm start
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

`npm run install:command` is an explicit one-time local link; it installs no
dependency. Maintainers can use `npm run dev` to rebuild and start in one step.
The linked `agent` command starts in the current directory, so that directory is
the workspace boundary for coding tools.

Interactive startup asks for a missing OpenCode Go key with terminal echo
disabled; Enter continues providerless and Ctrl+C cancels. The environment
variable remains available for controlled automation. To enable the admitted
OpenCode Go path without placing a key in command history, follow
[manual chapter 05](docs/manual/05-providers-and-authentication.md).

Linux uses the matching owned wrapper:

```bash
bash tools/verify.sh
```

The lockfile contains only workspace topology and local links. `npm ci` is
offline and cannot add packages. The verification command is the definition of
done. The owned `verify` GitHub workflow invokes the same command on pull
requests and `main`; its checkout and toolchain bootstrap are written here and
use no third-party action.

`agent`, `npm start`, and `npm run dev` open the interactive alternate-screen
terminal when both stdin and stdout are TTYs. The interface uses one responsive,
conversation-first shell: a dominant document, contextual activity, a short
rectangular composer, then a compact truthful footer.
Generic panels, surfaces, split lines, three-column lines, horizontal insets,
side rails, and spacers compose these
regions without adding product state to the TUI framework. The working column
is centered and bounded. The composer has no prompt glyph. It grows from one
through six content rows, wraps ordinary words, and keeps the caret visible
after reaching its cap. A steady block caret identifies the insertion point
when the terminal supports the standard cursor shape command. User requests use
one compact borderless gray surface with
italic default-foreground text; assistant prose stays unboxed. Fenced code and
strict pipe tables use one content-fit dark technical surface with restrained
parser-owned accents. Complete fences with no more than two visible logical
rows use zero horizontal padding; larger fences and tables retain one cell.
Strict tables measure all retained header and body cells first, then pad each
column to one shared visible width so every displayed row has the same extent.
A single muted rule of that exact extent separates the header from the body
inside the same surface; tables have no outer border or full grid.
Neither role repeats a label or receives a complete panel.
Empty contextual blocks consume no rows. The same shell uses bounded structured
rows, one unified recent tool-activity surface, closed renderer-owned semantic
tones and surfaces, and an original bounded Markdown subset for conversation
text. An empty
session adds no welcome or embedded help content; the maintained manual is the
operator reference. Input and conversation remain neutral; green reports success
or readiness, yellow reports active or approval-sensitive state, and red
reports a negative terminal result. Lifecycle state appears once, at the
footer's right edge. The footer reports the working folder at the left edge,
keeps provider/model physically centered, and retains phase/history at the
right edge. Renderer cleanup restores the terminal's default cursor style as
well as visibility and the previous screen.
Each message is an isolated document, and Markdown compiles into the same
structured rows. Prose wraps at word boundaries, long tokens fall back to cell
wrapping, and fenced code retains literal wrapping inside its declared surface
padding. An exact `---` logical line becomes one muted responsive separator;
shorter, longer, or spaced variants remain literal. Model text cannot emit ANSI,
choose colors, create panels, or extend the parser. Inline code and fenced
language labels use the restrained steel-blue reference accent.
Recognized complete fences may also use the closed keyword, name, string,
literal, and comment roles from the bounded owned lexical highlighter; its
lighter blues remain code-only. Unknown
or unlabeled fences remain plain. Success, active, and failure colors remain
reserved for application truth. This accepted TUI baseline supports:

```text
/providers  show integration availability
/approve    allow the one pending write tool
/deny       reject the one pending write tool
/exit       close agent
```

Typing `/` or a non-exact command prefix opens the bounded command completion
surface above the composer. Up and Down select without wrapping. Tab completes
the selected exact command but never runs it. Enter runs the selected exact
command through the same dispatcher used by a fully typed submission. The
surface closes for exact commands, whitespace, and unknown prefixes.

Use Left, Right, Home, End, Delete, and Backspace to edit the bounded draft.
Ctrl+Left and Ctrl+Right move across whitespace-delimited words;
Ctrl+Backspace, Ctrl+W, and Ctrl+Delete remove one word through that same owned
editor rule.
Long text wraps into the growing composer. Bracketed multiline paste is inserted
as one atomic draft change and does not submit; a separate Enter submits the
complete draft. Up
and Down move through transcript history one row at a time. Page Up and Page
Down move by one visible transcript page with one row of overlap; reaching the
latest row resumes automatic follow. A quiet `↑ history` label appears while the
view is detached from the latest content. It shares the compact footer with the
authoritative provider/model and application phase. Starting a new turn returns
to the latest content. These keys never alter the current draft.

With an active model turn, Ctrl+C requests cancellation, preserves the draft, and
keeps the shell open. At idle, Ctrl+C exits. Ctrl+D, stdin EOF, and `/exit`
always exit, cancelling active work first. The terminal restores cooked input,
the cursor, and the previous screen before returning. Redirected input or output
produces a short plain status with no ANSI and still releases an injected runtime.

Without an injected runtime, ordinary submitted text is discarded after a
no-model notice. It is not displayed, logged, persisted, or added to transcript
or conversation state. With a runtime, final model output remains prepared until
the application acknowledges it; an earlier ordered cancellation discards that
prospective text. Before the first tool checkpoint, the user turn is prospective
too. After a completed tool attempt, only newer text can be discarded.
Terminal failure and cancellation receipts likewise remain owned by the runtime
until acknowledged, so shutdown cannot lose buffered cleanup failures.
Read-only tools run automatically. Each write call requires its own exact
`/approve` or `/deny`; approval is never cached. One model response may select a
bounded ordered batch, but handlers run sequentially after complete preflight.
The TUI shows every current call through the same bounded borderless semantic
surface. A restrained dark green, ochre, or red background reinforces success,
active or approval, and negative terminal state respectively; the written state
remains explicit and the neutral tool name is italic. Approval uses the same
component and retains the exact `/approve` and `/deny` actions before optional
safe detail when space is short. At most the latest tool remains beside the
composer while its turn is active. Approval, execution, and terminal outcome
update that one contextual surface; the next tool replaces it and turn
settlement removes it. Tool
activity never enters the scrollable conversation. One optional blank row
separates non-empty activity from the transcript or notice above and collapses
before required content on short terminals. Activity stays directly adjacent
to completion or the composer below, matching completion-to-composer rhythm.
Raw content, call identifiers, outputs, arguments, provider data, and failure causes
never enter notices or the activity surface. Once every call in a selected
batch has a truthful result, the complete assistant call array and ordered
results become one conversation checkpoint before the next model step. A later
failure or cancellation retains that truthful checkpoint while discarding only
prospective response text.
Direct process execution remains disabled under decisions 0008 and 0015.
Decision 0016 adds an original private C17 broker that is compiled and tested
against Windows Job Objects and Linux delegated cgroup v2 plus namespaces, but
production does not invoke it and no model-facing tool exists. Process groups
and `taskkill /T` remain rejected substitutes. Admission still requires a later
reviewed structured adapter, approval surface, privacy boundary, and complete
matching-platform proof.
`/exit` is the only exit command; there is no alternate alias.

Read [the operator manual](docs/manual/README.md) to run and interpret the
current product. Read [the architecture](docs/ARCHITECTURE.md),
[the engineering standard](docs/ENGINEERING.md), and
[the ownership policy](docs/OWNERSHIP.md) before changing the project. Follow
[the maintenance runbook](docs/MAINTENANCE.md) for package or toolchain changes.
Provider researchers and maintainers must also follow
[the subscription eligibility reference](docs/PROVIDERS.md) and the
[verified provider request packets](docs/PROVIDER-APPLICATIONS.md).

## Public identity

The canonical public repository is `giovannijecha/agent`. Giovanni Jecha is the
maintainer and copyright holder. The project remains on the `0.x` release line
while the first direct provider, its tool loop, and release operations mature
under the canonical verifier.

The project is licensed under [Apache-2.0](LICENSE). Read the
[security policy](SECURITY.md), [privacy policy](PRIVACY.md), and
[contribution policy](CONTRIBUTING.md) before public use or participation.
Provider registration requests use the
[OAuth client registration dossier](docs/OAUTH-REGISTRATION.md) and the
[four provider-specific request packets](docs/PROVIDER-APPLICATIONS.md).
All four provider requests are submitted. Kimi Code has confirmed that it does
not currently offer public OAuth for third-party clients; the other three
requests remain pending. Neither submission nor a negative response authorizes
subscription access.

Copyright 2026 Giovanni Jecha.
