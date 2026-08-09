# Agent project

## Purpose

Build a lightweight personal coding agent with an original CLI and TUI. All
product source, tests, declarations, protocols, prompts, tools, and UI behavior
are authored in this repository.

The public identity is `agent`, the canonical public repository is
`giovannijecha/agent`, and Giovanni Jecha is the maintainer and copyright
holder. The public description is “An owned, zero-dependency personal coding
agent.”

## Stack and ownership

- Use Node.js `>=22.19.0`, npm workspaces, ESM, ES2022, and external TypeScript
  `5.9.3`. Node, npm, and `tsc` are approved toolchain substrate.
- Private native platform primitives use original C17 and external Clang
  `>=18`; system headers and operating-system APIs are approved substrate.
  Generated native binaries remain ignored and are never committed.
- Third-party source, npm packages, SDKs, frameworks, snippets, vendored code,
  foreign generated code, and `@types/node` are forbidden.
- TypeScript must stay outside the repository and every package dependency must
  be an exact edge to a registered local workspace.
- Use only local imports and explicitly allowlisted `node:` built-ins. Never use
  bare built-in names, `npx`, `npm exec`, dynamic imports, `require`, or loaders.
- Shipped modules use only statically proven computed member names. Use explicit
  collection APIs such as `.at()` for runtime indexing; the verifier fails closed.
- Write minimal Node declarations here from authoritative runtime contracts.
- Current reference-project source may be inspected when public documentation is
  stale. Never copy, translate, adapt, or reuse its implementation, tests,
  prompts, identifiers, or product identity; pin and record every inspection in
  `docs/OWNERSHIP.md`.
- Subscription adapters require an `agent`-owned client registration or a
  provider-documented public identity for independent clients. Vendor SDKs,
  CLIs, app servers, ACP binaries, and borrowed OAuth identities are forbidden.
- Provider requests live in `docs/PROVIDER-APPLICATIONS.md`. A prepared,
  submitted, or unanswered request never changes blocked eligibility.
- Secrets, credentials, sessions, and personal content never enter source,
  fixtures, logs, or documentation.

## Architecture

- `@agent/core` owns deterministic domain state and performs no I/O.
- `@agent/tools` owns structured schemas, risk classes, registry validation,
  and bounded handler execution; it is Node-free and depends only on core.
- `@agent/runtime` owns bounded streaming turns, cancellation, model ports, and
  acknowledged conversation checkpoints; it is Node-free and depends only on
  core and tools.
- `@agent/tui` owns bounded input decoding, line editing, vertical components,
  layout, viewports, frames, and asynchronous rendering; it is agent-agnostic
  and Node-free.
- `@agent/cli` owns commands, bounded display chat, the single-writer reducer,
  terminal/runtime arbitration, built-in workspace tools, raw mode, filesystem
  and process access, and all Node lifecycle; it is the only platform boundary.
- The private CLI-native process broker is verification infrastructure only.
  Production does not invoke it and `run_process` stays blocked until a later
  decision accepts the complete model-facing adapter and approval contract.
- `agent` is a single-agent product: one identity, one application controller,
  one active runtime session, and one active model decision loop. Providers are
  interchangeable backends, never additional agents; do not add sub-agents,
  delegation, swarms, or concurrent agent conversations.
- Future controller-internal concurrency may overlap only bounded independent
  mechanics over immutable snapshots during a read-only phase. It cannot enter
  the tool engine or overlap a mutation, and its results return to the sole
  controller for deterministic reduction.
- Model turns, writes, process execution, approvals, and terminal output remain
  serialized. Current runtime remains sequential.
- Core and TUI never depend on each other. Dependencies point inward, public
  surfaces go through `src/index.ts`, and deep cross-package imports are banned.
- Keep modules cohesive, documented, independently testable, replaceable, and
  removable without unrelated rewrites. Do not create speculative layers.
- Every owned engine or framework must define a complete intended contract:
  lifecycle, bounds, failures, security, tests, updates, rollback, and removal.
- Keep the model-facing harness lean: every tool needs one canonical name, a
  distinct capability, current necessity, focused tests, and independent
  removal. Tool aliases and speculative conveniences are forbidden.
- Keep process execution tools disabled until decision 0015 is explicitly
  replaced after kernel-backed Windows and Linux containment, isolated
  environment, bounded output, and complete descendant cancellation and cleanup
  are proven.

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
- Do not edit generated `dist/`, `.test-dist/`, `node_modules/`, or lock metadata
  manually. Change owned inputs and regenerate them through the toolchain.

## Canonical commands

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm start
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

On Linux, use `bash tools/verify.sh`; it runs the same ordered gate with the
platform-native shell wrapper.

The final command must pass before work is complete. It checks the toolchain,
documents, manifests, lockfile, imports, source hygiene, build, tests, and CLI.
The owned GitHub workflow runs this same command for pull requests and `main`;
it must contain no imported action or repository secret.

## Boundaries

Work only inside this folder unless an umbrella registry update is required.
Do not initialize Git, publish, deploy, add packages, or connect a real model
provider unless the user explicitly asks.
