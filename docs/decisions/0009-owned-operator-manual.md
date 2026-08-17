# 0009: Owned verified operator manual

- Status: superseded by decision 0071
- Date: 2026-08-08

[Decision 0071](0071-owned-task-oriented-operator-manual.md) supersedes this
record's universal section template and prose-evidence requirements. This file
remains the historical rationale for establishing the owned operator manual.

## Context

`agent` now has several independently owned engines whose behavior is spread
across architecture records, source, tests, and maintenance guidance. A user or
maintainer needs one task-oriented entry point that describes only the product
that actually exists. An informal guide would drift as commands, tools, safety
boundaries, or package paths change.

The manual must remain original, dependency-free, readable directly from the
repository, and strict enough to participate in the definition of done. It must
not become a second architecture specification or advertise future provider,
session, process, or UI capabilities as current behavior.

## Decision

Create `docs/manual/` as the canonical operator manual. Its index owns chapter
navigation and its numbered Markdown chapters own task guidance. Every chapter
uses the same ordered contract:

1. `Purpose`
2. `Operator workflow`
3. `Guarantees and limits`
4. `Failure behavior`
5. `Maintenance and removal`
6. `Evidence`

`tools/manual-policy.json` registers the index, ordered chapters, current slash
commands, current built-in tools, and repository paths that must be cited as
evidence. An original validator checks the registry shape, chapter set and
heading order, README entry point, command and tool coverage, source inventory,
local link targets, and existence plus citation of every required path. The
canonical verifier runs this policy before building.

The manual describes observable behavior and operating decisions. Architecture
documents remain authoritative for dependency direction, decisions remain
authoritative for accepted contracts, and source plus tests remain authoritative
for implementation. Manual links point to those sources instead of duplicating
their complete detail.

Markdown is the only format in this version. No HTML generator, documentation
framework, translation layer, search index, or copied theme is added before a
real distribution need exists.

## Limits and security

The manual never contains credentials, personal content, protocol secrets,
registered client identifiers, raw tool arguments, or fabricated examples of
successful provider access. Provider status is linked to the dated eligibility
record. Commands and tools are named, but model input and tool results are not
used as fixtures.

The validator accepts only repository-relative Markdown links or external
`https` links, rejects paths that escape the repository, and keeps its errors
content-free. It performs no network access and imports only approved Node
built-ins.

## Update, rollback, and removal

Change a command, built-in tool, chapter, or evidence path in product source,
the manual, the manual policy, focused policy tests, and relevant design or
maintenance documentation together. The release gate must fail when any one of
those views drifts.

To remove the manual, first restore README links to the architecture and
runbooks as the sole documentation entry points. Then remove the validator call,
policy, tests, manual directory, this decision, and its ownership registration.
Build and verify the product after each stage; no runtime package depends on the
manual.
