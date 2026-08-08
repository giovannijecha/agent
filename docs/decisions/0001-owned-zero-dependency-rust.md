# 0001 — Owned, zero-dependency Rust foundation

- Status: superseded by decision 0002
- Date: 2026-08-07

## Context

The product must be lightweight and preserve a distinct identity. Its agent
runtime, integrations, CLI, and TUI must be maintainable without inheriting
third-party implementation choices or supply-chain churn.

“Everything from scratch” still requires a compiler, operating system, and
interoperability standards. Claiming ownership of those layers would be false;
the project instead draws a precise boundary around project-owned code.

## Decision

Use a Rust 2024 Cargo workspace with no registry or Git dependencies. Cargo is
forced offline. Local crates provide independent core, TUI, and CLI boundaries.
Project code may use only the Rust standard library, documented OS services,
and public interoperability specifications. Third-party source and SDKs are
forbidden. Any generated project artifact must come from a generator authored
in this repository.

The first TUI renderer is implemented here from ANSI control-sequence behavior;
no external terminal library is used. OS-specific behavior will be isolated in
a platform adapter and audited when it becomes necessary.

## Consequences

Builds remain small, auditable, and insulated from package churn. Integrations
will take longer because protocol clients and terminal behavior are ours to
design, test, and maintain. HTTPS must use documented system cryptographic
services behind an owned transport contract; custom cryptography is outside the
project's safety boundary. Unsupported functionality remains explicit rather
than being filled by an external package.

Changing this ownership boundary requires direct user approval and a replacing
decision record. Convenience alone is not sufficient.
