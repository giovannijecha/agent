# 00 - Reading this manual

## Choose a task

Use this chapter to distinguish operator guidance from engineering contracts.
The manual answers how to run and interpret the current product. It does not
replace the project rules, architecture, accepted decisions, or maintenance
runbook.

1. Read [Running agent](01-running-agent.md) before starting the executable.
2. Read the chapter matching the task you are performing.
3. Follow each chapter's guarantees and failure behavior before changing state.
4. Open the linked canonical owner when behavior and documentation differ.
5. Run the release gate described in
   [Verification and diagnostics](06-verification-and-diagnostics.md) after a
   documentation or product change.

## Follow the authority chain

The manual is English-only and repository-local. Numbered chapters are ordered,
follow their registered task-specific section contracts, and describe
implemented behavior only. When behavior and documentation differ, follow the
linked canonical owner and update the affected behavior, tests, and operator
guidance together.

## Verify the manual

The manual policy verifies the exact chapter set and section order, all current
slash commands and built-in tools, local links, and registered repository
references. It does not prove prose completeness or replace focused behavioral
tests.

A missing chapter, reordered registered section, stale capability inventory,
broken local link, missing registered reference path, or absent README entry
makes canonical verification fail. An external web link can later become
unavailable without breaking the offline gate; dated provider conclusions
therefore live in the local eligibility reference.

## Maintain or remove the manual

Update the relevant chapter in the same change as behavior. Add a chapter only
for a distinct operator task and register it in `tools/manual-policy.json`.
Removal follows
[decision 0071](../decisions/0071-owned-task-oriented-operator-manual.md):
remove the documentation entry point and verification contract without
touching runtime packages.

## References

For repository-wide rules and product orientation, start with the
[repository instructions](../../AGENTS.md), [public entry point](../../README.md),
and [documentation map](../README.md). Use the [architecture](../ARCHITECTURE.md),
[engineering guide](../ENGINEERING.md), and [maintenance guide](../MAINTENANCE.md)
for implementation and lifecycle contracts. Provenance remains in the
[ownership record](../OWNERSHIP.md), and provider eligibility remains in the
[provider policy](../PROVIDERS.md).
