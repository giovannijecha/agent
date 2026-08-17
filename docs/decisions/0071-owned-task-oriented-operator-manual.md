# 0071: Owned task-oriented operator manual

- Status: accepted
- Date: 2026-08-16
- Domain: documentation
- Supersedes: 0009
- Superseded by: none

## Context

Decision 0009 established an owned operator manual and an offline verifier, but
required every chapter to repeat the same purpose, workflow, guarantee, failure,
maintenance, and evidence sections. It also required the prose to cite a
repository-wide implementation inventory. As the product grew, those rules made
operator guidance carry architecture and maintenance detail that already had
canonical owners. The result remained complete but became difficult to scan and
expensive to update.

Decision 0070 now gives each documentation topic one canonical owner and requires
lossless, domain-by-domain migration. The manual can therefore become genuinely
task-oriented without weakening repository evidence or deleting design history.

## Decision

The operator manual remains the canonical guide for using the current product,
but no longer has one universal chapter template. Each registered chapter owns
an explicit ordered section contract in `tools/manual-policy.json`. A chapter
uses only the sections needed for its operator task. This permits incremental
migration: unchanged chapters keep their current contracts until their own
content domain is reviewed.

Manual prose contains observable workflows, operator-visible guarantees,
limits, and failures. It links to the canonical architecture, maintenance,
privacy, provider, evaluation, or decision document for deeper implementation
and lifecycle contracts instead of repeating them. Machine policy may retain a
repository reference-path registry to detect missing owned artifacts, but a
chapter is not required to enumerate that registry as prose evidence.

The offline manual policy continues to validate:

- the exact registered chapter set, titles, and per-chapter section order;
- local links and the ordered manual index;
- the exact slash-command and built-in-tool inventories against owned source;
- the unique human-readable tool table and its closed capability and risk data;
- the existence of registered repository reference paths; and
- the maintained removal guidance for the current policy schema.

The first migrated task is `01-running-agent.md`. Installation, workspace
selection, process-local provider and model setup, exit, evaluation mode, and
operator-visible failures remain there. Native resolver mechanics, exact
deadlines, source inventories, and replacement procedure remain authoritative in
architecture, maintenance, decisions, and evaluation documentation.

## Consequences

Operators get shorter chapters organized around actions rather than a repeated
governance template. Maintainers still have an offline contract for structure,
capability drift, links, and owned reference existence. Historical evidence and
deep technical guarantees remain available at stable canonical paths.

The manual may temporarily contain both migrated task-specific chapters and
legacy six-section chapters. That is deliberate: each later reduction is one
reviewable authority-domain migration rather than a repository-wide rewrite.

## Verification

- Manual-policy tests accept different registered section contracts and reject
  missing, extra, or reordered sections.
- The policy rejects a missing registered reference path without requiring each
  path to be cited in an `Evidence` section.
- Existing command, tool, link, index, convergence, and removal tests remain
  authoritative.
- The documentation policy verifies this decision, its index relationship, and
  the active migration ledger.
- The canonical verifier runs the complete document, policy, build, test, native,
  and CLI gates.

## Updates, rollback, and removal

Migrate one chapter or authority domain at a time. Before shortening prose,
record its destination in the migration ledger; update the chapter contract,
links, policy, and tests in the same change. Roll back a failed slice by
restoring its prior text and registered sections while leaving decisions 0009
and 0071 in place.

Removing the manual still requires deleting its public entry point, chapter
registry, command and tool presentation contract, policy integration, tests,
and documentation routes without changing runtime authority. Replacing the
manual policy requires a new schema and maintained removal instructions in the
same change.
