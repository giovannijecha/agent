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
- Apply exact text patches, manage paths, and run the registered `node` process.
- Ask for one explicit permission decision for every planned write or execution.
- Connect Ollama Cloud and select an available cloud model for the current process.
- Stream one checkpointed model-and-tool loop through a conversation-first TUI.
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

The directory in which `agent` starts becomes its immutable workspace boundary.
Volume roots, the exact user home, and the shared temporary directory are
rejected. An optional root `.agentignore` adds deny-only read exclusions.

Inside the TUI, run `/providers` to enter an Ollama Cloud API key and select the
provider, then `/models` to load the authenticated catalog and choose one
available model. Credentials, provider state, model catalogs, and selections
remain in process memory and disappear on exit. See
[providers and authentication](docs/manual/05-providers-and-authentication.md)
for the complete workflow and failure contract.

## Daily use

| Command | Action |
| --- | --- |
| `/providers` | Configure or select a session provider |
| `/models` | Load and select an admitted provider model |
| `/permissions` | Edit session-only tool permissions |
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
- Secrets stay memory-only and never enter source, fixtures, logs, transcripts,
  or documentation.
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
