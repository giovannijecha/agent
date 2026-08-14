# 0049: Owned evaluation failure registry

- Status: accepted
- Date: 2026-08-14

## Context

Decisions 0047 and 0048 provide reproducible task workspaces, deterministic
tree grading, closed run records, and content-free interaction receipts. They
keep individual runs outside version control by design. That preserves privacy
and prevents candidate workspaces from entering repository verification, but it
also leaves no durable place to count recurring failures or distinguish one
observed defect from evidence that justifies a product or tool change.

The first complete five-task baseline produced one bounded failure signal. The
TypeScript endpoint task reached the required source change but also created an
unexpected JavaScript copy. The operator classified the run as `partial`, the
artifact as `different`, and the primary constraint as `model`. This is evidence
of a planning failure, not evidence that a model-facing capability is missing.

A durable register must not retain the ignored run, candidate content, prompt,
response, transcript, provider credential, personal identifier, or free-form
diagnosis. It also must not become another evaluator, issue tracker, telemetry
stream, product feature, or automatic quality score.

## Decision

The repository owns one bounded failure registry at
`evaluations/failures/registry.json`. It extends the maintainer-only evaluation
framework and remains outside product packages. One independent
`tools/lib/evaluation-failure-registry.mjs` module validates the registry. The
existing evaluation-suite loader admits only the exact registry inventory path
without reading its contents. The canonical verifier invokes the independent
validator with the one bounded registry snapshot, registered task identifiers,
and complete tracked source inventory needed to check resolution evidence. It
omits the registry value from the task-corpus map while retaining its path in
the inventory. No new CLI command, model-facing tool, provider call, runtime
observer, or candidate execution path is added.

Schema version 1 contains one canonically ordered `entries` array. Every entry
has exactly:

- one unique lowercase ASCII identifier;
- one identifier of a currently registered evaluation task;
- one primary category from `comprehension`, `context`, `planning`, `tool`,
  `runtime`, `provider`, `approval`, `security`, `tui`, or `quality`;
- one priority from `p0`, `p1`, `p2`, or `p3`;
- one lifecycle state from `observing`, `actionable`, or `resolved`;
- one positive bounded occurrence count;
- one nullable repository-relative resolution evidence path; and
- one closed evidence object containing the run record's `outcome`, `artifact`,
  and `primaryConstraint` classifications plus the grader's sorted `changed`,
  `missing`, and `unexpected` task-relative path sets.

An entry records a negative result only. A fully successful exact or accepted
alternative result with no primary constraint is not admissible. Record
consistency follows decision 0047: success requires `none`; a non-success
outcome requires a concrete constraint; exact artifacts require empty grade
sets; and non-exact artifacts require at least one changed, missing, or
unexpected path.

`observing` means evidence exists but frequency or impact does not yet justify
a correction. An entry with exactly one occurrence must remain `observing`.
`actionable` means the maintainer has accepted work on the existing contract.
Both require a null resolution. `resolved` requires at least two occurrences
and one existing tracked evidence path under `docs/decisions/`, `packages/`, or
`tools/test/`; the path identifies the decision or regression proof that closed
the failure. Resolution never deletes the historical entry.

Occurrence counts are explicit maintainer judgments. The validator does not
scan ignored runs, infer recurrence, inspect provider output, or aggregate
metrics. Incrementing a count requires another reviewed occurrence of the same
failure against the same maintained task. A corpus change requires reviewing
every entry bound to that task because decision 0047 already invalidates older
comparisons when task fixtures change.

The initial registry contains the TypeScript unexpected-source-copy signal as
one `planning`, `p2`, `observing` occurrence. One occurrence is enough to retain
the evidence but not enough to change prompts, runtime behavior, or the tool
surface.

## Bounds, security, and failure behavior

The complete registry is strict scalar UTF-8 JSON with LF endings, a final
newline, canonical indentation, and at most 32,768 bytes. It admits at most 64
entries, including an empty array after complete rollback. Entry identifiers
use at most 64 lowercase ASCII letters, digits, or hyphens. Occurrences are
positive safe integers capped at 10,000. Every grade set has at most 32 paths;
paths reuse the evaluation snapshot limits of 16 segments and 256 UTF-8 bytes,
reject traversal, absolute paths, backslashes, secret-shaped segments, Windows
device names, duplicates, case-folding collisions, and overlaps between grade
sets.

Unknown keys, unknown classifications, noncanonical entry ordering, duplicate
identifiers, unknown task identifiers, malformed paths, inconsistent evidence,
invalid lifecycle transitions, a missing resolution target, or an unregistered
file below `evaluations/` fails the canonical gate with one content-free error.
The repository source boundary accepts one explicit canonical repository root
and one bounded repository-relative path. It rejects a missing, linked,
non-regular, identity-changing, empty, or oversized registry and rejects any
linked or identity-changing directory from that root through the registry's
parent. It checks the complete directory chain before opening, rechecks it and
the path-to-descriptor identity before the first descriptor read, reads through
that descriptor into one fixed `registryBytes + 1` buffer, and rechecks the
chain, identity, size, modification time, and non-user-resettable change time
before returning. A same-length in-place rewrite cannot be accepted by restoring
the prior modification time. The failure-registry module then owns bounded fatal
UTF-8 decoding and JSON parsing for those bytes. It serializes the parsed value
with the one owned two-space JSON representation and final LF, re-encodes that
representation, and requires exact source-byte equality before structural
validation. This rejects a BOM, CRLF, a missing final newline, trailing
whitespace, noncanonical indentation or scalar spelling, and repeated keys.
Invalid UTF-8, syntactically invalid JSON, and noncanonical representations map
to the same fixed registry error; filesystem and parser diagnostics are never
exposed. Validation returns only immutable closed classifications and counts.
It emits no registered path or entry content in an error.

Ordinary `list`, `prepare`, `grade`, and `validate-record` commands check the
exact combined `evaluations/` inventory but do not parse failure entries or walk
the repository for resolution evidence. Their shared traversal records the exact
registry directory entry in the inventory before node-kind or content handling;
it does not open, follow, descend through, or retain that entry. The canonical
verifier likewise gives the task-suite validator only that inventory path, not a
second registry value; parsing and validation reuse the one source-boundary
snapshot. Corpus traversal reserves one logical registry file, one containing
directory, and the registry's exact 32,768-byte allowance in addition to the
task-corpus maxima. Registry validity is a repository gate, not a precondition
for operating on one already registered task.

The registry stores fixture-relative paths already eligible for the public
owned corpus. It never stores paths outside a task, file contents, diffs,
commands, prompts, responses, transcripts, model or provider names, run
identifiers, credentials, personal data, free-form notes, timestamps, or
machine details.

## Verification

Focused pure tests cover the canonical first entry, exact keys, task binding,
closed taxonomy and priority, positive frequency bounds, canonical ordering,
duplicate identifiers, evidence consistency, path bounds and collisions,
lifecycle rules, and existing resolution targets. Boundary tests prove that one
occurrence cannot leave `observing` and that corpus-tree capacity includes the
registry directory, file, and complete byte allowance. Source-boundary
regressions cover regular files, exact size bounds, empty and oversized files,
directories, linked final entries, and a regular external file below a linked
repository parent before the verifier read. Parser
regressions prove that malformed JSON, invalid UTF-8, BOM-prefixed source,
CRLF, missing final LF, trailing whitespace, minification, and repeated keys
collapse to the fixed content-free error without echoing rejected source.
Inventory tests prove that the evaluation corpus and failure registry jointly
own every file under `evaluations/`, reject unregistered additions, and leave
the registry value absent from the task-corpus map. One filesystem regression
replaces the registry contents with a source larger than the evaluator's normal
per-file limit and proves that `list`, `prepare`, `grade`, and `validate-record`
still operate through inventory evidence alone. It then substitutes a directory
at the same exact path and proves the loader neither descends into nor reads it.

The canonical Windows and Linux gates validate the registry without creating a
run, reading ignored state, launching `agent`, contacting a provider, executing
candidate code, or changing product behavior.

## Consequences

Repeated negative outcomes can now be counted and prioritized without retaining
personal or model-generated content. Tool admission can cite durable evidence
instead of impressions. The first entry explicitly argues against a new tool:
the existing capability completed the required edit, while model planning added
an unnecessary file.

The closed schema cannot preserve a narrative diagnosis. The maintained task,
grade classifications, category, frequency, and optional resolution proof are
the complete durable evidence. Deeper investigation remains local and
ephemeral until it produces a decision or regression test.

## Update, rollback, and removal

Adding, reclassifying, incrementing, resolving, or removing an entry requires
reviewing its maintained task and updating the registry and focused tests in one
change. Changing taxonomy, priorities, lifecycle states, evidence fields,
bounds, task binding, resolution roots, or inventory ownership requires updating
this decision, the validator, tests, evaluation guide, engineering guidance,
AGENTS, ownership and manual policies, and canonical verifier together.

To roll back the initial evidence, remove its complete registry entry and the
focused canonical assertion; do not alter the underlying task or ignored run.
To remove the facility, delete `evaluations/failures/`, the validator and its
tests, this decision, and every verifier, ownership, manual, engineering,
maintenance, README, and AGENTS reference. Decisions 0047 and 0048, the task
corpus, offline evaluator, product receipt, model-facing tools, runtime, and TUI
require no replacement.
