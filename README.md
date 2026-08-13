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
- Requires a separate approval for every write or process execution.
- Executes ordered tool-call batches sequentially and checkpoints their truth.
- Contains the admitted `node` process token through an owned native broker.
- Verifies source, ownership, build, tests, and CLI behavior offline.

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
Interactive startup can request the optional key without echo; see
[providers and authentication](docs/manual/05-providers-and-authentication.md)
for the controlled environment-variable path.

## Terminal interface

The transcript stays dominant. User turns and the composer use one quiet neutral
surface so role and input remain immediately visible. Assistant prose, code,
tables, and completion stay transparent; green, ochre, and red backgrounds are
reserved for tool activity, approval, success, and failure. One shared rhythm
separates every lower-shell region. User turns retain one quiet padding row
above and below their text, activity surfaces follow their content height, and
the focused composer retains one vertical padding row on each side. The footer keeps workspace and provider
facts quiet while a soft active-work pulse aligns with the composer's right
edge. Command feedback appears as one transparent contextual notice below any
tool activity; it is replaced by newer feedback, disappears after five seconds,
and closes immediately when editing resumes. `/providers` uses one compact muted
line, while invalid commands use one short warning.

The exact command surface is:

| Command | Action |
| --- | --- |
| `/providers` | Show integration availability |
| `/approve` | Allow the pending write or execute call |
| `/deny` | Reject the pending write or execute call |
| `/exit` | Close `agent` |

Typing a command prefix opens compact completion above the composer. Up and
Down select, Tab inserts without submitting, and Enter dispatches through the
same exact command path. The menu has no passive help row.

Editing, multiline paste, transcript navigation, approval behavior, colors,
motion, and failure handling are documented in the
[terminal-interface manual](docs/manual/03-terminal-interface.md).

## Safety boundaries

- One model response may select one bounded ordered tool-call batch.
- Read tools may run automatically; every write or execute call needs its own
  exact approval.
- `run_process` accepts only the registered `node` token, literal arguments,
  and one workspace-relative directory. It accepts no shell, executable path,
  PATH lookup, stdin, inherited environment, or model-selected limit.
- Model turns, tools, approvals, mutations, process execution, and terminal
  output remain serialized.
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
| `packages/agent-cli/native` | Private Windows and Linux process containment |
| `types` | Minimal owned Node declarations |
| `tools` | Build, ownership, test, policy, and smoke verification |
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
