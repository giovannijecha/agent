# 00 - Reading this manual

## Purpose

Use this chapter to distinguish operator guidance from engineering contracts.
The manual answers how to run and interpret the current product. It does not
replace the project rules, architecture, accepted decisions, or maintenance
runbook.

## Operator workflow

1. Read [Running agent](01-running-agent.md) before starting the executable.
2. Read the chapter matching the task you are performing.
3. Follow each chapter's guarantees and failure behavior before changing state.
4. Open the linked evidence when behavior and documentation appear different.
5. Run the release gate described in
   [Verification and diagnostics](06-verification-and-diagnostics.md) after a
   documentation or product change.

## Guarantees and limits

The manual is English-only and repository-local. Numbered chapters are ordered,
have one fixed section contract, and describe implemented behavior only. The
manual policy verifies all current slash commands and built-in tools are named.
It does not prove prose completeness or replace focused behavioral tests.

## Failure behavior

A missing chapter, reordered contract section, stale capability inventory,
broken local link, missing evidence path, or absent README entry makes canonical
verification fail. An external web link can later become unavailable without
breaking the offline gate; dated provider conclusions therefore live in the
local eligibility reference.

## Maintenance and removal

Update the relevant chapter in the same change as behavior. Add a chapter only
for a distinct operator task and register it in `tools/manual-policy.json`.
Removal follows [decision 0009](../decisions/0009-owned-operator-manual.md):
remove the documentation entry point and verification contract without touching
runtime packages.

## Evidence

- Project rules: `AGENTS.md`
- Product entry point: `README.md`
- Dependency and ownership boundaries: `docs/ARCHITECTURE.md`
- Implementation standard: `docs/ENGINEERING.md`
- Update and rollback procedures: `docs/MAINTENANCE.md`
- Provenance record: `docs/OWNERSHIP.md`
- Subscription eligibility: `docs/PROVIDERS.md`
