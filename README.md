# agent

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/agent-wordmark-dark.png">
    <img alt="agent" src="assets/brand/agent-wordmark-transparent.png" width="512">
  </picture>
</p>

An owned, zero-dependency personal coding agent.

`agent` is an original CLI and terminal UI built entirely in this repository.
It keeps product code, protocols, tools, prompts, tests, and rendering under one
maintainer-controlled workspace without third-party runtime packages.

## What it does

- Streams one model turn into a conversation-first terminal interface.
- Runs bounded local coding tools through explicit schemas and risk classes.
- Applies one session-scoped `Allow`, `Ask`, or `Deny` policy to every tool.
- Advances tools through checkpointed model-turn barriers until the task settles.
- Filters automatic reads through an owned deny-only workspace privacy policy.
- Contains the admitted `node` process token through an owned native broker.
- Verifies source, ownership, build, tests, and CLI behavior offline.
- Provides a small owned corpus for reproducible, content-free task evaluation.
- Can emit one opt-in content-free interaction receipt after an evaluation run.
- Retains bounded recurring evaluation failures in a versioned closed registry.

The current direct provider is OpenCode Go. It is optional: without an API key,
`agent` starts providerless and does not send content anywhere. Credentials and
sessions stay in process memory and are never persisted.

## Quick start

Requirements: Node.js `>=22.19.0`, npm `11.16.0`, external TypeScript `5.9.3`,
and Clang `>=18`. TypeScript and Clang must remain outside the workspace.

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
```

To install the local command once:

```powershell
npm run install:command
agent
```

The exact current directory becomes the coding-tool workspace boundary. Startup
canonicalizes it once, shows that absolute path in the footer, and rejects a
volume root, the user home, or the shared temporary directory before reading a
credential. The protected home and temporary roots come from the operating
system through an owned native resolver, not from inherited environment
variables. Startup never widens the selection to a parent Git repository.
It then loads built-in sensitive-path denials plus an optional bounded root
`.agentignore` before credentials or tools. Malformed policy fails startup;
policy changes take effect only after restart.
Interactive startup can request the optional key without echo; see
[providers and authentication](docs/manual/05-providers-and-authentication.md)
for the controlled environment-variable path.

## Terminal interface

The transcript stays dominant. User turns compose one rail-free transparent
stage-wide surface with italic restrained steel-blue prose and the shared
content inset. Their first text cell aligns with assistant prose and composer
text and caret on one canonical column. The composer keeps its content
transparent between two full-width light-blue rules. Code, tables, and completion stay
transparent. Tool activity is transparent too: its marker and written state use
restrained success, attention, or failure foregrounds. One shared rhythm separates every lower-shell
region. Transcript entries and activity surfaces follow their content height
without synthetic padding, and the focused
composer retains one rule row on each side when the viewport permits. Exact
bounded mutation or execution previews appear only while permission is pending;
every other activity state stays on one compact line with a status mark, readable
action, optional useful subject, and right-aligned written state. Patch permission
shows the path and bounded human-readable removed rows in restrained red and
inserted rows in restrained green instead of internal digests or tuple metadata.
Opaque structured rows are repainted from their
semantic surface before content. The footer keeps workspace and provider
facts quiet while a soft active-work pulse aligns with the composer frame's
right edge. Slash completion and permission lists use the same restrained blue
foreground for the selected row. Command feedback appears as one transparent contextual notice below any
tool activity; it is replaced by newer feedback, disappears after five seconds,
and closes immediately when editing resumes. `/providers` uses one compact muted
line, while invalid commands use one short warning.

If a turn fails after a completed tool checkpoint, the completed tool truth is
retained and the transcript plus notice expose one closed content-free failure
code such as `model/read` or `tool/limit`. Provider causes and tool payloads are
never rendered, and a successful tool is not relabeled as failed because model
continuation stopped later.

The exact command surface is:

| Command | Action |
| --- | --- |
| `/providers` | Show integration availability |
| `/permissions` | Set current-session tool permissions |
| `/exit` | Close `agent` |

The permission editor covers the exact six built-in tools and stays in memory
only. Reads start as `Allow`; writes and execution start as `Ask`. A pending
`Ask` offers `Allow once`, `Allow for session`, and `Deny` through a contextual
selection list rather than another slash command.

Typing a command prefix opens compact completion above the composer. Up and
Down select, Tab inserts without submitting, and Enter dispatches through the
same exact command path. The menu has no passive help row.

Editing, multiline paste, transcript navigation, permission behavior, colors,
motion, and failure handling are documented in the
[terminal-interface manual](docs/manual/03-terminal-interface.md).

Inside the alternate screen, `agent` owns pointer interaction on Windows and
Linux through the same terminal protocol. Drag to select conversation or
composer text and copy on release. Double-click and release copies one
whitespace-delimited word; hold the second press and drag to extend by complete
words. The wheel moves the transcript's existing scroll position without
losing a settled selection. Windows x64 confirms copies through the owned native
clipboard boundary; other platforms issue a bounded OSC 52 request and say so
without claiming host success. A short result appears inside the composer's
right edge without adding a row or moving the conversation.
Exact visible `https://` text is exposed as a terminal hyperlink; the terminal
chooses its activation gesture and security UI. Shift remains an optional
terminal-native selection path, while Ctrl+C remains the agent interrupt.

## Safety boundaries

- OpenCode Go requests at most one tool call per model response, checkpoints its
  result, and lets the next model decision reassess the remaining user goal.
- A defensive bounded batch returned despite that request is validated before
  observation, then planned just in time and invoked sequentially; handlers
  never run concurrently and completed effects are never retried implicitly.
- Read tools default to `Allow`; writes and execution default to `Ask`. Every
  successfully planned request receives one exact runtime permission decision.
- `apply_patch` creates or updates one file through ordered exact-text hunks,
  reserves its bounded target path inside one concrete effect preview, and
  commits the approved state through one owned handle-relative Windows/Linux
  broker. Invalid path projections or aggregate hunk batches fail complete
  preflight before observation; ambiguous anchors, overlap, reordering, no-op
  hunks, or changed identity, absence, path, or content fail as conflicts.
- `manage_path` creates one directory, moves one file or directory to an absent
  destination, or removes one file or empty directory. Every effect has one
  exact authorization and one owned namespace-committer invocation; every
  successful effect is one handle-relative namespace commit. Overwrite, merge,
  recursive removal, nonempty-directory removal, and self-descendant moves fail
  closed. Windows supports all three operations. Linux supports directory
  creation; its planner returns `unsupported` for move or remove before
  path-specific planning, namespace observation, or authorization, and its
  native broker retains the same final guard. The admitted Linux APIs cannot
  bind the approved source identity atomically to those mutations.
- `read_file`, `list_directory`, and `search_text` share one immutable built-in
  plus `.agentignore` disclosure policy; denied targets never enter tool output.
- `read_file` optionally returns an exact bounded logical-line range with
  explicit start, returned-line, total-line, and continuation metadata. A
  path-only request still returns the complete bounded file.
- `run_process` accepts only the CLI-registered `node` token, literal arguments,
  and one workspace-relative directory. It accepts no shell, executable path,
  PATH lookup, stdin, inherited environment, or model-selected limit.
- Model turns, tools, permissions, mutations, process execution, and terminal
  output remain serialized.
- Content and namespace mutation commits have no portable pathname fallback.
  Unsupported native exclusion, publication, or namespace primitives fail
  closed rather than weakening an approved effect.
- Secrets, raw tool arguments, call identifiers, and failure causes do not enter
  the contextual UI.

The single-agent execution model is deliberate: one identity, one application
controller, one active runtime session, and one model decision loop. Providers
are interchangeable backends, not additional agents. Current runtime remains sequential.

Future controller-internal mechanical concurrency may overlap only bounded
independent mechanics over immutable snapshots during a read-only phase. It
cannot enter the tool engine or overlap a mutation, and its results return to
the sole controller for deterministic reduction.

## Repository map

| Path | Responsibility |
| --- | --- |
| `packages/agent-core` | Immutable messages, values, conversations, and results |
| `packages/agent-tools` | Schemas, registry, risk, validation, and execution boundary |
| `packages/agent-runtime` | Streaming turns, cancellation, tools, and checkpoints |
| `packages/agent-provider-opencode-go` | Node-free OpenCode Go wire adapter |
| `packages/agent-tui` | Generic input, layout, Markdown, frames, and renderer |
| `packages/agent-cli` | Commands, chat, tools, terminal, Node I/O, and composition |
| `packages/agent-cli/native` | Private platform roots, content and namespace mutation commits, clipboard, and process containment |
| `evaluations` | Original reproducible task briefs, input snapshots, and expected snapshots |
| `types` | Minimal owned Node declarations |
| `tools` | Build, ownership, evaluation, test, policy, and smoke verification |
| `docs` | Operator manual, architecture, decisions, and provenance |

Dependencies point inward: tools depend on core; runtime depends on core and
tools; the provider implements the runtime port; CLI is the sole composition
and platform boundary. Core and TUI remain independent. See the
[architecture](docs/ARCHITECTURE.md) for the complete graph and contracts.

## Verification

The verifier is the definition of done. It checks the toolchain, documents,
manifests, lockfile, imports, source hygiene, native containment, build, tests,
and CLI smoke behavior.

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

Linux:

```bash
bash tools/verify.sh
```

The owned GitHub workflow runs the same gate on pull requests and `main` without
imported actions or repository secrets.

## Task evaluation

The repository includes five small original coding tasks spanning C,
documentation, JavaScript, TypeScript, and browser code. The offline evaluator
prepares an isolated input workspace and grades its regular-file tree without
executing candidate code or contacting a provider:

```powershell
node tools/evaluate.mjs list
```

For a maintained run, start `agent --evaluation-receipt` inside the prepared
workspace. After terminal cleanup it prints one JSON line containing only
elapsed milliseconds and accepted turn, tool-call, approval, and repeated-read
counts. Copy those five values into the run record; semantic outcome, artifact,
correction, risk, and constraint fields remain operator judgments.

Runs stay under ignored `state/evaluations/`. Exact equality is a reproducible
artifact signal, not a universal quality score. See the
[evaluation guide](evaluations/README.md) for the bounded workflow.

Reviewed negative results may enter the versioned failure registry using only
closed task, category, priority, frequency, grade, and lifecycle fields. The
canonical gate binds grade paths to each task's current expected snapshot. The
registry stores no run identifier, prompt, response, transcript, candidate
content, provider identity, or free-form diagnosis. One occurrence remains an
observation and does not by itself admit a new tool or product change.

## Documentation

- [Operator manual](docs/manual/README.md) — installation, interface, tools,
  providers, diagnostics, and governance.
- [Architecture](docs/ARCHITECTURE.md) — package ownership and runtime flows.
- [Engineering standard](docs/ENGINEERING.md) — implementation constraints.
- [Maintenance runbook](docs/MAINTENANCE.md) — updates, rollback, and removal.
- [Ownership policy](docs/OWNERSHIP.md) — clean-room and provenance rules.
- [Provider eligibility](docs/PROVIDERS.md) and
  [provider request packets](docs/PROVIDER-APPLICATIONS.md) — blocked and
  admitted integration paths.
- [Brand contract](docs/BRAND.md) — canonical identity and registered assets.

## Public identity

The canonical public repository is `giovannijecha/agent`. Giovanni Jecha is the
maintainer and copyright holder. The project remains on the `0.x` release line.

The project is licensed under [Apache-2.0](LICENSE). Read the
[security policy](SECURITY.md), [privacy policy](PRIVACY.md), and
[contribution policy](CONTRIBUTING.md) before public use or participation.
Provider registration uses the
[OAuth client registration dossier](docs/OAUTH-REGISTRATION.md) and the
[provider request packets](docs/PROVIDER-APPLICATIONS.md). A submitted or
unanswered request never authorizes subscription access.

Copyright 2026 Giovanni Jecha.
