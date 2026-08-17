# 0070: Owned documentation information architecture

- Status: accepted
- Date: 2026-08-16
- Domain: documentation
- Supersedes: none
- Superseded by: none

## Context

Agent has accumulated a complete but increasingly repetitive documentation set.
Public introduction, contributor constraints, architecture, engineering guidance,
maintenance procedures, operator instructions, and historical decisions often
repeat the same contract. That repetition makes maintenance expensive, obscures
which statement is authoritative, and turns useful documentation into a long
linear reading exercise.

The history is valuable and must remain auditable. Reducing repetition cannot
mean deleting requirements before their authority and destination are known.
Decision filenames are already stable public references, so renumbering or
reorganizing them would also break durable links.

## Decision

Agent adopts an owned, lossless documentation information architecture.

Each maintained topic has one canonical owner. Other documents may give a short
audience-specific summary, but they link to that owner instead of restating the
complete contract. The document roles are:

- the repository `README.md` introduces the product to public users;
- `AGENTS.md` defines repository change constraints and routes contributors to
  deeper authority;
- `docs/README.md` is the central documentation map;
- `docs/ARCHITECTURE.md` describes the current product shape;
- `docs/ENGINEERING.md` describes development practice;
- `docs/MAINTENANCE.md` contains maintainer runbooks;
- `docs/manual/` contains operator instructions;
- `docs/decisions/` preserves durable design history.

`docs/DOCUMENTATION-MIGRATION.md` is the temporary lossless migration ledger.
Before duplicated content is shortened or removed, the ledger records its
current locations, future canonical owner, and migration status. A migration is
complete only when the destination exists, incoming links are updated, and the
canonical verifier proves the resulting graph.

Decision records keep their flat, numeric filenames. They are never renumbered,
moved, or rewritten merely to present a cleaner history. The decision index
provides domain and status views over those stable records. Beginning with this
decision, every new decision declares `Status`, `Date`, `Domain`, `Supersedes`,
and `Superseded by` metadata. Historical records remain immutable unless a
separate correction is required. When a domain becomes difficult to understand,
a new consolidation decision may state the current contract and supersede the
relevant earlier decisions while preserving them in place.

A new decision is required only for a durable architectural, authority,
security, provider, toolchain, product-behavior, or documentation-governance
contract. Routine implementation notes, test evidence, transient incidents, and
ordinary maintenance remain in their natural documents or change history.

An owned offline documentation policy validates the central map, the complete
decision ledger, the prospective metadata contract, migration coverage, local
links, and the exact top-level structure and canonical routes of the repository
change contract. It does not generate documentation, contact a network service,
or rewrite historical records.

The migration proceeds by authority domain. It first establishes the map,
ledger, index, and verifier; later changes may then shorten one duplicated topic
at a time with its destination, links, tests, and policy updated together.

## Consequences

Readers gain short entry points without losing detailed authority or design
history. Stable decision paths continue to work as the collection grows. The
migration remains reviewable because every removal has an explicit destination.

Until a topic is migrated, existing duplication remains authoritative and must
still pass its current policies. The new structure therefore adds a temporary
ledger and policy before it permits any large documentation reduction.

## Verification

- The documentation policy accepts exactly the registered central map,
  migration ledger, living-document authorities, complete decision inventory,
  closed statuses, closed domains, prospective metadata, local links, and the
  registered repository-instruction headings and routes.
- Focused tests reject missing decisions, duplicate ledger entries, metadata
  drift, unknown classifications, incomplete migration coverage, repository
  instruction drift, and broken or escaping links.
- The canonical repository verifier runs the documentation policy with the
  existing document, manual, ownership, and publication gates.

## Updates, rollback, and removal

Add a document role, decision status, or domain only by updating this decision
or a superseding decision, its policy, focused tests, central map, and migration
ledger together. Roll back a failed migration by restoring the previous source
text and ledger status; stable decision paths remain untouched.

The migration ledger may be removed only after every entry is complete and a
later decision records the permanent replacement for its remaining guardrails.
The central map, decision index, and offline validation are permanent parts of
the documentation contract unless a superseding decision supplies an equally
auditable replacement.
