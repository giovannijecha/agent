# 0002 — Owned, zero-dependency TypeScript foundation

- Status: accepted
- Date: 2026-08-07
- Supersedes: decision 0001

## Context

The project will use the same foundational stack category as Pi: a modular npm
workspace, Node.js, TypeScript, and ECMAScript modules. It will not import Pi's
implementation, dependencies, SDK choices, prompts, or product identity.

The ownership promise requires a precise distinction between authored product
code and the external tools needed to execute or compile it.

## Decision

Use Node.js `>=22.19.0`, npm workspaces, ESM, an ES2022 target, and TypeScript
`5.9.3`. Node, npm, and the TypeScript compiler are approved external toolchain
substrate. TypeScript is installed outside the repository and is forbidden from
all dependency fields. Minimal Node declarations are authored locally from
documented runtime contracts; `@types/node` is forbidden.

All runtime and development package dependencies are forbidden except exact
links between explicitly registered local workspaces. Node built-ins require
the `node:` prefix and an explicit allowlist. Compiled JavaScript, declarations,
source maps, npm workspace links, and the lockfile are derived toolchain output,
not imported source; they must be reproducible from owned inputs and verified.

The package graph preserves three independent boundaries:

```text
@agent/cli -> @agent/core
           -> @agent/tui
```

Core and TUI remain independent. Only the CLI may access Node process APIs.

## Migration and rollback

The cutover completed on 2026-08-07 after TypeScript reproduced the foundation
contracts and the parity verifier passed. Rust, Cargo, and their generated
artifacts were then removed completely; they are not a supported fallback.

Post-cutover rollback restores the last known-good TypeScript workspace snapshot
or change set, including its exact toolchain pins, lock metadata, declarations,
and generated output. Future stack migrations must retain their outgoing
implementation until contract parity and the replacing verifier pass.

## Consequences

The product gains the intended Node/TypeScript stack without accepting npm
supply-chain code. We must maintain our own narrow declarations, dependency
scanner, source checks, TUI engine, protocol adapters, and tests. Toolchain
updates are deliberate changes to this decision, the version policy, generated
artifacts, and verification baseline.

At the time of this decision, research was limited to Pi's public root manifest,
TypeScript configuration, package names, and documentation. Later source
inspection is governed by decision 0003; no Pi implementation has been copied,
translated, or adapted.
