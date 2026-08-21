# agent

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/agent-wordmark-dark.png">
    <img alt="agent" src="assets/brand/agent-wordmark-transparent.png" width="512">
  </picture>
</p>

An owned, zero-dependency personal coding agent.

`agent` is an original CLI and terminal UI authored in this repository. It
keeps the coding loop, local tools, permissions, provider adapters, and terminal
experience under one maintainer-controlled implementation without third-party
runtime packages.

## Capabilities

- Inspect and search one bounded local workspace.
- Apply exact text patches, manage paths, and run one approved native-shell command.
- Ask for one explicit permission decision for every planned write or execution.
- Connect Ollama Cloud and select an available cloud model for the current process.
- Stream one checkpointed model-and-tool loop through a conversation-first TUI.
- Set bounded native reasoning effort independently from whether its distinct
  transcript segment is shown.
- Retain bounded alternate conversation branches in a local durable journal,
  select one active path, and resume the latest workspace session.
- Verify the complete repository and grade maintained task fixtures offline.

The single-agent execution model has one identity, one controller, one active
runtime session, and one model decision loop. Providers are interchangeable
backends, not additional agents.

## Quick start

Requirements: Node.js `>=22.19.0`, npm `11.16.0`, external TypeScript `5.9.3`,
and Clang `>=18`. TypeScript and Clang stay outside the workspace.

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
```

To install and open the local command:

```powershell
npm run install:command
agent
```

To continue the newest inactive session for the same exact workspace:

```powershell
agent resume --latest
```

Before entering the TUI, manage the local Ollama Cloud API key or OpenAI device
authentication through the exact command:

```powershell
agent auth
```

The directory in which `agent` starts becomes its immutable workspace boundary.
Volume roots, the exact user home, the shared temporary directory, and every
workspace overlapping the native-home `.agent` state root are rejected. An
optional root `.agentignore` adds deny-only read exclusions.

The command first selects a provider. Ollama registration and replacement use
zero-echo key input and no network. OpenAI sign-in displays the fixed provider
verification URL and one-time code, then performs the bounded provider-hosted
device ceremony. OpenAI authentication is currently auth-only: it creates no
runtime provider or model row.

Inside the TUI, run `/models`, choose one authenticated runtime provider, then
choose one model from that provider's fresh catalog. The provider-model pair,
catalog, and process snapshot disappear on exit; a provider-specific credential
record remains until `agent auth` removes it. See
[providers and authentication](docs/manual/05-providers-and-authentication.md)
for the complete workflow and failure contract.

## Daily use

| Command | Action |
| --- | --- |
| `/models` | Select an authenticated provider and one fresh catalog model |
| `/permissions` | Edit session-only tool permissions |
| `/thinking` | Set session thinking `Stream` and `Effort` |
| `/timeline` | Select a retained conversation branch |
| `/exit` | Close `agent` |

The advertised tools are exactly `read_file`, `list_directory`, `search_text`,
`apply_patch`, `manage_path`, and `shell`. Reads default to `Allow`; writes
and execution default to `Ask`. Pending requests offer `Allow once`, `Allow for
session`, and `Deny`.

The transcript remains the main surface. Tool activity is contextual and
temporary, patch approvals show bounded human-readable changes, and provider,
model, permission, and command choices reuse one compact selection path. The
[terminal-interface manual](docs/manual/03-terminal-interface.md) owns the full
editing, layout, pointer, color, motion, and failure behavior.

`/thinking` is session-only and exposes exactly two rows. `Stream` is `Off` or
`On`; `Effort` is `Off`, `Low`, `Medium`, or `High`. Both default to `Off`.
The editor opens only after a provider and model are selected. Effort controls
the exact native request while Stream only hides or shows the separate muted
reasoning documents. Hidden settled reasoning is still retained when required
for tool continuation and resume. Both settings remain unchanged when another
model is selected, but are not persisted across processes.

`/timeline` shows the retained root and settled turns. Selecting an older
node changes the transcript and the context for the next task; appending then
creates a sibling branch without deleting later nodes. It never replays tools,
and an accepted selection updates the local session head. Only settled turns
are journaled, including settled native reasoning from opted-in turns;
credentials, provider/model state, thinking settings, permissions, drafts, and
provisional output remain process-only. See [Privacy](PRIVACY.md#local-sessions)
for storage locations, bounds, and deletion.

## Safety model

- Every tool call is schema-validated, planned, and authorized in provider
  order. Effects remain serial; two to four explicitly independent inspection
  calls may overlap and their results are reduced in provider order.
- Automatic reads share the built-in sensitive-path policy and root
  `.agentignore`; denied content never enters model-visible tool output.
- File and namespace mutations bind approval to observed filesystem state and
  use owned platform committers without a weaker pathname fallback.
- `shell` runs one exact approved command through the fixed native shell with a
  controlled credential-free environment, fixed limits, and owned descendant
  cleanup. It is host-full execution, not filesystem or network sandboxing.
- The owned Ollama and OpenAI credential records are local plaintext protected
  by native owner-only controls, not an encrypted vault. Secret bytes never
  enter source, fixtures, logs, transcripts, command arguments, or documentation
  values. Local OpenAI removal does not revoke provider-side authorization.
- A completed tool checkpoint remains conversation truth if a later model
  continuation fails; completed effects are not retried implicitly.

The complete package, authority, and runtime contracts live in
[Architecture](docs/ARCHITECTURE.md). Operator guarantees and recovery paths
live in the [manual](docs/manual/README.md); disclosure and reporting policies
live in [Privacy](PRIVACY.md) and [Security](SECURITY.md).

## Verification

The canonical gate checks toolchain versions, documentation, manifests,
ownership, imports, source hygiene, native boundaries, build, tests, and CLI
smoke behavior.

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

Linux:

```bash
bash tools/verify.sh
```

The owned GitHub workflow runs the same offline gate on pull requests and
`main`, without imported actions or repository secrets.

## Task evaluation

Maintainer tooling includes a versioned original task corpus and an offline
tree grader. List the maintained tasks with:

```powershell
node tools/evaluate.mjs list
```

Interactive runs may opt into `agent --evaluation-receipt`, which emits only
bounded mechanical counts after terminal cleanup. The
[evaluation guide](evaluations/README.md) owns preparation, operator grading,
receipts, failure evidence, and cleanup.

## Documentation

- [Documentation map](docs/README.md): shortest route to each maintained authority.
- [Operator manual](docs/manual/README.md): installation and product operation.
- [Architecture](docs/ARCHITECTURE.md): package ownership and runtime flows.
- [Engineering guide](docs/ENGINEERING.md): implementation and verification rules.
- [Maintenance guide](docs/MAINTENANCE.md): diagnostics, updates, and rollback.
- [Decision index](docs/decisions/README.md): durable design history by domain and status.
- [Ownership record](docs/OWNERSHIP.md): clean-room provenance and inspections.
- [Provider policy](docs/PROVIDERS.md): admitted provider architecture.
- [Brand guide](docs/BRAND.md): canonical identity and registered assets.

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
