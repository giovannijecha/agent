# agent

`agent` is an owned, zero-dependency personal coding agent with an original CLI
and terminal UI. All product code is written here; the workspace contains no
third-party runtime or development packages.

## Status

Single-agent streaming-runtime, tool-engine, and interactive-chat foundation.
The repository provides immutable structured conversation state, a bounded
transactional streaming and tool runtime, a provider-neutral schema/registry/execution
framework, registered bounded local coding tools, a complete vertical TUI
framework, a single-writer chat reducer, fair terminal/runtime arbitration, and
an owned verification system. Production injects no model, authenticates no
provider, and persists no sessions; therefore its real tool engine remains
inactive until an eligible model adapter is composed.
Requested subscription integrations remain behind a fail-closed eligibility
policy; none is enabled with a borrowed client identity.

The single-agent execution model is deliberate: one identity, application
controller, active runtime session, and model decision loop. Providers are
replaceable backends for that agent, not additional agents. The project does not
create sub-agents, delegate to hidden workers, or coordinate a swarm. The sole
controller owns every decision. Current runtime remains sequential.
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
packages/agent-tui   generic components, layout, input, frames, and renderer
packages/agent-cli   chat, arbiter, commands, built-in tools, Node lifecycle, composition
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
@agent/cli -> @agent/core
@agent/cli -> @agent/runtime
@agent/cli -> @agent/tools
@agent/cli -> @agent/tui
```

The CLI owns a real optional runtime composition path, exercised end to end with
deterministic sessions. The production executable intentionally injects no
runtime until a real model is eligible. Runtime has no dependency on TUI, CLI,
Node, transport, or provider identity.

## Setup and commands

Required toolchain: Node `>=22.19.0`, npm `11.16.0`, and `tsc 5.9.3` on `PATH`.
TypeScript must not be installed into this workspace.

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm start
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

The lockfile contains only workspace topology and local links. `npm ci` is
offline and cannot add packages. The verification command is the definition of
done. The owned `verify` GitHub workflow invokes the same command on pull
requests and `main`; its checkout and toolchain bootstrap are written here and
use no third-party action.

`npm start` opens the interactive alternate-screen terminal when both stdin and
stdout are TTYs. The first milestone supports:

```text
/help       show the command reference
/providers  show integration availability
/approve    allow the one pending write tool
/deny       reject the one pending write tool
/exit       close agent
```

Use Left, Right, Home, End, Delete, Backspace, and Enter to edit one line. With
an active model turn, Ctrl+C requests cancellation, preserves the draft, and
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
Read-only tools run automatically. Each write call requires its own
exact `/approve` or `/deny`; approval is never cached. Calls are sequential and
the TUI shows a bounded capability summary with the exact target path and
content sizes before approval. Raw content, call identifiers, and outputs never
enter notices or the tool-status panel. Once a
tool attempt completes, its structured call and result become a conversation
checkpoint before the next model step. A later failure or cancellation retains
that truthful checkpoint while discarding only prospective response text.
Direct process execution remains disabled under decisions 0008 and 0015 until
decision 0015 is explicitly replaced. The current pure Node.js boundary lacks
Windows Job Object ownership, while Linux requires a securely delegated cgroup
v2 subtree; process groups and `taskkill /T` are not accepted substitutes.
Admission needs the registered kernel-backed platform proof, environment
isolation, bounded output, and complete cleanup.
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
until at least one complete direct provider integration is eligible.

The project is licensed under [Apache-2.0](LICENSE). Read the
[security policy](SECURITY.md), [privacy policy](PRIVACY.md), and
[contribution policy](CONTRIBUTING.md) before public use or participation.
Provider registration requests use the
[OAuth client registration dossier](docs/OAUTH-REGISTRATION.md) and the
[four provider-specific request packets](docs/PROVIDER-APPLICATIONS.md).
All four provider requests are submitted. Submission by itself does not
authorize subscription access.

Copyright 2026 Giovanni Jecha.
