# Agent project

## Mission

Build `agent`, an original lightweight personal coding agent with a CLI and a
conversation-first TUI. The canonical repository is `giovannijecha/agent`;
Giovanni Jecha is the maintainer and copyright holder. The public description
is “An owned, zero-dependency personal coding agent.”

This file is the repository change contract. Keep it short: implementation,
tests, and the few living documents below are the current authority. Git history
preserves former designs; this repository has no separate decision ledger.

## Read before changing

| Change | Read |
| --- | --- |
| Packages, runtime, tools, CLI, TUI, providers, or platform boundaries | [Architecture](docs/ARCHITECTURE.md) |
| Source, tests, toolchain, verification, maintenance, release, or removal | [Engineering](docs/ENGINEERING.md) |
| Observable operator behavior | [Operator manual](docs/manual/README.md) |
| Credentials, personal content, network traffic, or security boundaries | [Privacy](PRIVACY.md) and [Security](SECURITY.md) |
| Brand assets | [Brand assets](assets/brand/README.md) |
| Evaluation evidence | [Evaluation guide](evaluations/README.md) |

Read the relevant authority completely before editing that domain. When a
change affects more than one row, update all affected contracts in the same
change.

## Invariants

### Ownership and dependencies

- Product source is original to this repository. Do not copy, translate, adapt,
  vendor, or reconstruct third-party implementations, tests, prompts, fixtures,
  identifiers, or source structure.
- Public specifications and provider-owned non-secret protocol constants may be
  used as facts. If official documentation is incomplete, inspect only the
  smallest public reference-project area needed to establish one interoperability
  fact and record the source and immutable revision in the change description.
- Runtime packages, SDKs, frameworks, snippets, foreign generated code,
  `@types/node`, and install-time scripts are forbidden.
- Use Node.js `>=22.19.0`, npm `11.16.0`, ESM, ES2022, external TypeScript
  `5.9.3`, C17, and external Clang `>=18`. Generated output stays ignored.
- Imports use registered local workspaces, explicitly admitted `node:` built-ins,
  and runtime extensions. Bare built-in names, `npx`, `npm exec`, dynamic
  imports, `require`, and loaders are forbidden.

### Architecture

- `@agent/core` owns deterministic domain state and performs no I/O.
- `@agent/tools` is Node-free and depends only on core.
- `@agent/runtime` is Node-free and depends only on core and tools.
- Provider packages are Node-free adapters. The OpenAI subscription package is
  installed but remains uncomposed until its runtime activation is implemented.
- `@agent/tui` is Node-free and agent-agnostic. Core and TUI never depend on
  each other.
- `@agent/cli` is the sole Node and platform boundary. It owns commands,
  workspace and read policy, native helpers, terminal lifecycle, credentials,
  provider composition, persistence, and the serialized application controller.
- Dependencies point inward and public package surfaces go through `src/index.ts`.
  Deep cross-package imports are forbidden.
- Keep modules cohesive, independently testable, replaceable, and removable.
  Do not create speculative layers or overlapping authorities.

### Execution model

- `agent` has one identity, one controller, one active runtime session, and one
  model loop. Providers are interchangeable backends, never agents. Do not add
  sub-agents, delegation, swarms, or concurrent conversations.
- Model turns, permissions, effects, conversation commits, persistence, and
  terminal output remain serialized.
- One explicitly admitted cohort of two to four independent registered reads may
  overlap after every permission settles. It never overlaps an effect and its
  results return in provider order.
- Conversation state is one bounded immutable tree. Exactly one root-to-node
  path is exposed to the model. `/timeline` is the idle-only selector; selecting
  history never replays tools or restores filesystem state.

### Tools and authority

- The model-facing tools are exactly `read_file`, `list_directory`,
  `search_text`, `apply_patch`, `manage_path`, and `shell`. Aliases and
  overlapping convenience tools are forbidden.
- Every call is bounded, schema-validated, planned, and authorized before
  execution. There is no implicit retry, replay, fallback, or hidden concurrency.
- `/permissions` is the sole session-only policy editor. Reads default to
  `Allow`; writes and execution default to `Ask`; every tool can also be `Deny`.
- One immutable canonical workspace and deny-only read policy are fixed before
  credentials, providers, tools, or terminal ownership.
- Writes and namespace changes bind permission to observed state and use the
  owned native Windows/Linux commit boundaries. Missing guarantees fail closed.
- `shell` runs one exact approved command through the fixed platform shell with
  a controlled credential-free environment, fixed bounds, and whole-tree
  cleanup. It is not a filesystem or network sandbox.

### Providers and secrets

- Ollama Cloud is the only active runtime provider. Its exact catalog and chat
  origins, bearer authentication, native protocol, and no-redirect/no-retry/
  no-fallback behavior remain fixed.
- `agent auth` is the sole interactive credential lifecycle and runs outside
  the alternate-screen TUI. `/providers` does not exist.
- Ollama credentials come from its owner-protected record under
  `~/.agent/credentials` or temporarily from `AGENT_OLLAMA_API_KEY`. Both at
  once fail as dual authority. Neither source selects a provider or model.
- `/models` selects one authenticated provider, fetches only that provider’s
  fresh catalog, and atomically selects the provider-model pair.
- OpenAI device sign-in and local record removal are active through `agent auth`.
  The owned OpenAI catalog and Responses adapter are installed but inactive:
  startup, `/models`, refresh, revocation, transport construction, and runtime
  conversation use do not compose them.
- No other provider, endpoint, compatibility route, credential authority, SDK,
  CLI, daemon, redirect, discovery, retry, router, or fallback is admitted
  without its complete owned implementation, tests, security/privacy update,
  operator documentation, and removal path.
- Credentials, sessions, and personal content never enter source, fixtures,
  logs, errors, receipts, or documentation values.

## Change discipline

- Project artifacts are English; chat may use another language.
- Start from a clean branch based on current `main`. Preserve unrelated user
  changes and never edit generated `dist/`, `.test-dist/`, `node_modules/`, or
  lock metadata manually.
- Work in small coherent modules. Establish a failing regression, implement the
  smallest complete fix, then run focused checks and the full platform gate.
- Every bug fix needs a regression. Every integration needs contract tests.
- Update behavior, tests, operator guidance, privacy/security, maintenance, and
  removal together when they are affected.
- The change itself—source, tests, living documentation, review, and Git
  history—is the design record. Do not add numbered decisions, migration
  ledgers, prose digests, or parallel documentation authorities.
- Use explicit immutable results. Do not swallow errors or add silent fallback,
  ambient network access, hidden global state, or weaker platform paths.
- Do not add automated tool signatures, generated-by banners, tool co-author
  trailers, or claims that development occurred without tool assistance.
- Do not initialize Git, publish, deploy, add dependencies, connect a real
  provider, or mutate external state without explicit maintainer authorization.

## Canonical commands

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
npm run install:command
npm start
agent
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

On Linux, run `bash tools/verify.sh`. The final platform-native verifier must
pass before a change is complete. Pull requests and `main` run the same owned
gate on Windows and Linux without imported actions or repository secrets.
