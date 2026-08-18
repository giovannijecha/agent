# Agent project

## Mission

Build `agent`, an original lightweight personal coding agent with a CLI and
conversation-first TUI. The canonical repository is
`giovannijecha/agent`; Giovanni Jecha is the maintainer and copyright holder.
The public description is “An owned, zero-dependency personal coding agent.”

This file is the repository change contract and route map. It intentionally does
not restate every subsystem contract. Follow the linked authority before changing
that domain; a summary here never overrides its canonical owner.

## Read by task

| Task | Canonical authority |
| --- | --- |
| Find the right document | [Documentation map](docs/README.md) |
| Change package boundaries, runtime, tools, CLI, TUI, or platform ownership | [Architecture](docs/ARCHITECTURE.md) |
| Change source, tests, declarations, verification, or evaluation practice | [Engineering](docs/ENGINEERING.md) |
| Update, roll back, remove, release, or diagnose a subsystem | [Maintenance](docs/MAINTENANCE.md) |
| Change observable operator behavior | [Operator manual](docs/manual/README.md) |
| Change providers, credentials, catalogs, models, or network origins | [Provider policy](docs/PROVIDERS.md), [privacy policy](PRIVACY.md), and [decision 0072](docs/decisions/0072-owned-ollama-cloud-provider.md) |
| Change security boundaries or vulnerability handling | [Security policy](SECURITY.md) and [privacy policy](PRIVACY.md) |
| Inspect a reference project or change provenance rules | [Ownership policy](docs/OWNERSHIP.md) |
| Change brand identity or visual assets | [Brand guide](docs/BRAND.md) |
| Change the maintained task corpus or evaluation evidence | [Evaluation guide](evaluations/README.md) |
| Add or supersede a lasting design decision | [Decision index](docs/decisions/README.md) |
| Change documentation structure or migrate duplicated content | [Decision 0070](docs/decisions/0070-owned-documentation-information-architecture.md) and the [migration ledger](docs/DOCUMENTATION-MIGRATION.md) |
| Prepare a contribution | [Contributing guide](CONTRIBUTING.md) |

## Repository invariants

### Source and toolchain

- Use Node.js `>=22.19.0`, npm workspaces, ESM, ES2022, and external
  TypeScript `5.9.3`. TypeScript stays outside the repository.
- Original private native primitives use C17 and external Clang `>=18`.
  Generated native binaries remain ignored and are never committed.
- Third-party source, npm packages, SDKs, frameworks, snippets, vendored code,
  foreign generated code, and `@types/node` are forbidden.
- Every package dependency is an exact edge to a registered local workspace.
  Use only local imports and explicitly allowlisted `node:` built-ins.
- Never use bare built-in names, `npx`, `npm exec`, dynamic imports,
  `require`, or loaders.
- Shipped modules use only statically proven computed member names and explicit
  collection APIs such as `.at()` for runtime indexing.
- Minimal Node declarations are authored here from authoritative runtime
  contracts. The verifier-enforced source rules in the engineering guide are
  normative.

### Architecture and authority

- `@agent/core` owns deterministic domain state and performs no I/O.
- `@agent/tools` is Node-free and depends only on core.
- `@agent/runtime` is Node-free and depends only on core and tools.
- `@agent/tui` is agent-agnostic and Node-free. Core and TUI never depend on
  each other.
- `@agent/cli` is the sole Node and platform boundary. It owns commands,
  workspace resolution, read policy, built-in tools, terminal lifecycle,
  provider composition, and the serialized application controller.
- Dependencies point inward, public package surfaces go through `src/index.ts`,
  and deep cross-package imports are forbidden.
- `agent` is a single-agent product with one identity and one controller. It owns
  one active runtime session and one active model loop. Providers are
  interchangeable backends, never agents. Do not add sub-agents, delegation,
  swarms, or concurrent conversations.
- Model turns, permission decisions, tool handlers, writes, process execution,
  and terminal output remain serialized. Current runtime remains sequential.
  Read-only internal overlap requires a separate accepted design, cannot enter
  the tool engine or overlap a mutation, and must return to the sole controller.
- Keep modules cohesive, independently testable, replaceable, and removable.
  Do not add speculative layers or overlapping authority.

### Tools and permissions

- The exact model-facing inventory is `read_file`, `list_directory`,
  `search_text`, `apply_patch`, `manage_path`, and `shell`.
  Tool aliases and convenience overlaps are forbidden.
- The provider-neutral boundary validates one bounded ordered batch, plans calls
  just in time, requests one exact permission for each successfully planned
  call, executes sequentially in provider order, checkpoints results, and
  commits one complete exchange.
- The owned instruction asks for at most one tool call per response and requires
  reassessment after every checkpoint until the task is complete or one explicit
  blocker remains. Never add implicit retry, replay, fallback, or concurrent
  handlers.
- `/permissions` is the sole session-only policy editor. Exact tools hold
  `Allow`, `Ask`, or `Deny`; reads default to `Allow`, writes and
  execution to `Ask`. `/approve` and `/deny` do not exist.
- `apply_patch`, `manage_path`, and `shell` keep their accepted object-bound,
  namespace, and contained-process contracts. Shell execution uses one fixed
  platform shell, an exact approved command, a controlled credential-free
  environment, fixed bounds, and whole-tree cleanup. Their exact bounds,
  platform behavior, failures, and removal order live in architecture,
  engineering, maintenance, and the indexed decisions.

### Providers and secrets

- Ollama Cloud is the sole admitted direct API-key provider under the
  [provider policy](docs/PROVIDERS.md) and decision 0072. Do not add another
  provider, origin, compatibility endpoint, SDK, CLI, local daemon, alias,
  redirect, retry, router, or fallback without a new accepted decision and
  complete contract evidence.
- Provider credentials, catalog results, provider selection, and model selection
  are process-only. `agent` starts without a backend.
- `/providers` is the only interactive credential and provider selection path.
  `/models` performs one bearer-authenticated request to the exact admitted
  catalog path and exposes only the current bounded identifiers authorized by
  that response.
- Environment variables may preload credentials for automation but never select
  a provider or model.
- Secrets, credentials, sessions, and personal content never enter source,
  fixtures, logs, errors, receipts, or documentation values.

### Workspace, provenance, and presentation

- CLI resolves one immutable canonical workspace boundary before credentials,
  providers, tools, or terminal ownership. It never discovers a broader
  repository root. All built-in tools consume that same boundary and read policy.
- Reference-project source may be inspected only when public documentation is
  stale. Never copy, translate, adapt, or reuse its implementation, tests,
  prompts, identifiers, or product identity. Pin each inspection in the
  [ownership policy](docs/OWNERSHIP.md).
- TUI reference inspection is limited to observable outcomes; foreign component
  structures, identifiers, style literals, timings, redraw algorithms, and
  source organization are forbidden.
- The canonical product, executable, package, and repository identity is
  `agent`. The exact lowercase `.agent` wordmark is a visual signature only;
  canonical assets and digests remain registered in
  `assets/brand/manifest.json`.
- Observable TUI, Markdown, activity, selection, pointer, composer, and failure
  behavior is owned by the architecture and operator manual. Do not create
  private rendering paths or parallel view models.

## Change discipline

- Project artifacts are written in English; chat may use Italian.
- Do not add automated tool signatures, generated-by banners, or tool co-author
  trailers. Do not claim that development occurred without tool assistance.
- External issues may open after publication; external code pull requests stay
  closed during the initial maintainer-only clean-room phase.
- Update behavior, tests, documentation, ownership policy, and removal guidance
  in the same change.
- Record lasting design or toolchain changes under `docs/decisions/` first.
- Use explicit immutable results at library boundaries; no swallowed errors,
  silent fallback, hidden global state, or ambient network access.
- Every bug fix needs a regression test; every integration needs contract tests.
- Owned evaluation evidence remains maintainer tooling, never product runtime.
  One observation cannot justify a product change without maintained recurrence.
- Do not edit generated `dist/`, `.test-dist/`, `node_modules/`, or lock
  metadata manually. Change owned inputs and regenerate through the toolchain.

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

On Linux, use `bash tools/verify.sh`; it runs the same ordered gate with the
platform-native shell wrapper.

The final verification command must pass before work is complete. It validates
the toolchain, documents, manifests, lockfile, imports, source hygiene, build,
tests, native boundaries, and CLI. The owned GitHub workflow runs the same gate
for pull requests and `main` without imported actions or repository secrets.

## Scope boundaries

Work only inside this repository unless an umbrella registry update is required.
Do not initialize Git, publish, deploy, add packages, connect a real provider, or
change external state unless the user explicitly asks.
