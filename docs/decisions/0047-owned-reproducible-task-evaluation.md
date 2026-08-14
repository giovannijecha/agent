# 0047: Owned reproducible task evaluation

- Status: accepted
- Date: 2026-08-14

## Context

Unit, integration, adversarial, native, and smoke tests prove bounded product
contracts, but they do not show whether `agent` completes ordinary coding work
efficiently. Informal use cannot support architectural decisions because the
starting repository, task, provider conditions, operator corrections, and
accepted result are not reproducible.

The evaluation boundary must not add a model-facing tool, a second application
controller, hidden telemetry, provider traffic in verification, or a foreign
benchmark dependency. Candidate workspaces contain model-authored code after a
run, so grading them by executing their contents would also grant authority
outside the product's admitted process contract.

## Decision

The repository owns one bounded offline task-evaluation framework under
`evaluations/` and `tools/`. It is maintainer tooling, not product runtime. The
canonical verifier validates its manifest and corpus, but never launches
`agent`, contacts a provider, executes candidate workspace code, or creates an
evaluation run.

One versioned manifest registers every task. Each task owns exactly:

- one bounded Markdown operator brief;
- one input workspace snapshot;
- one canonical expected workspace snapshot;
- one closed project kind and task category; and
- one unique lowercase identifier.

The initial corpus covers TypeScript, JavaScript, browser HTML/JavaScript,
documentation, and C. Every byte is authored in this repository. Fixtures use
strict scalar UTF-8 with LF line endings, contain no secrets or personal data,
and may contain only regular files and directories. Symbolic links, special
files, secret-shaped paths, unregistered files, and identical input/expected
snapshots fail verification.
Paths that collide under ASCII case folding or use Windows reserved device
names also fail, so one registered tree materializes consistently on both
supported platforms. Task and run identifiers reject the same reserved device
names before any state path is derived.

## Run lifecycle

The owned `tools/evaluate.mjs` entry point exposes four exact commands:

1. `list` prints the registered identifiers without reading run state.
2. `prepare <task-id> <run-id>` creates one new run under
   `state/evaluations/<task-id>/<run-id>/`, copies only the input snapshot into
   `workspace/`, and writes one content-free metric record template beside it.
3. `grade <task-id> <run-id>` compares the current workspace with the expected
   snapshot and emits one bounded JSON result containing only path names and
   `missing`, `unexpected`, or `changed` classifications.
4. `validate-record <task-id> <run-id>` validates the operator-completed metric
   record and binds its artifact classification to the current grade.

Task and run identifiers determine every state path. Preparation refuses an
existing final or staging run, builds in one owned sibling staging directory,
and renames it only after all writes succeed. Failure removes only that exact
validated staging directory. The framework has no reset or delete command.
An empty candidate workspace remains a valid observable result: grading marks
every expected path missing instead of treating the run as structurally unsafe.
Canonical input and expected snapshots remain non-empty.

The operator starts the normal `agent` executable from the prepared workspace,
submits the registered brief, and retains responsibility for approvals. The
framework does not inject prompts, inspect terminal output, capture a
transcript, read provider credentials, or modify application state.

## Grading and records

Exact tree equality is one deterministic artifact signal, not a universal
quality score. A different tree may be an accepted alternative only through an
explicit operator classification; the evaluator never infers semantic
equivalence. A completed record contains only closed classifications and
non-negative bounded counts:

- success, partial, or failure;
- exact, accepted-alternative, or different artifact status;
- turns, tool calls, approvals, manual corrections, repeated reads, risky
  actions, and elapsed milliseconds; and
- one primary constraint: none, model, provider, tool, runtime, approval, TUI,
  operator, or task.

Free-form notes, prompts, transcripts, file contents, model responses, paths
outside the task workspace, credentials, and personal identifiers are not
recorded. Pending templates use only `null` metrics and closed pending states.
Completed records require all metrics and a non-pending classification.

## Bounds and failure behavior

Schema version 1 admits at most 16 tasks, 32 files per snapshot, 65,536 bytes
per file, 262,144 bytes per snapshot, a 4,096-byte task brief, 16 path segments,
256 path bytes, and 512 directories per candidate tree. The complete corpus
has limits derived from those per-task bounds. Snapshot path limits apply to
the path relative to `input/`, `expected/`, or the candidate workspace; corpus
traversal admits only the fixed `tasks/<task-id>/<snapshot>/` prefix overhead
before the exact relative bound is reapplied. Run identifiers contain at most
48 lowercase ASCII letters, digits, or hyphens and cannot equal a Windows
reserved device name. Counts are capped at 10,000 and elapsed time at
86,400,000 milliseconds.

Unknown manifest or record fields, duplicate tasks, invalid ordering, malformed
text, control characters outside tab and LF, traversal, absolute paths,
oversized data, nonportable or case-colliding names, missing fixtures, and
inconsistent record/grade combinations return a content-free error and nonzero
exit status. Operational output uses repository-relative run paths. Grading
never mutates the run. No evaluation failure weakens the product verifier or
changes a product result.

## Verification

Pure policy tests cover the canonical corpus, schema and key drift, task
ordering, duplicate identifiers, path and text rejection, snapshot bounds,
identical snapshots, metric bounds, and record consistency. Filesystem tests
cover staged preparation, existing-run rejection, exact grading, changed,
missing, unexpected, and empty candidate trees, portable run identifiers, exact
snapshot-relative path boundaries, and content-free diagnostics. The canonical
gate validates the registered suite and runs those tests on Windows and Linux.

## Consequences

Product changes can now be evaluated against stable coding tasks without
expanding model authority or making CI depend on a provider. Exact snapshots
favor reproducibility over broad semantic acceptance, so results remain
evidence for review rather than a claim of model quality. Runtime duration and
interaction counts remain operator-entered until a future decision proves a
privacy-preserving owned observation boundary.

## Update, rollback, and removal

Adding or changing a task requires updating the manifest, brief, input,
expected snapshot, policy tests, and relevant maintenance documentation in one
change. Corpus changes invalidate comparisons with earlier task revisions and
must be reviewed as evaluation-contract changes.

To roll back one task, remove its manifest entry and complete task directory.
To remove the framework, first remove every evaluation run outside version
control, then delete `evaluations/`, the evaluator library and entry point,
their tests and verifier hook, this decision, and their ownership, manual,
privacy, security, engineering, maintenance, and README references. Product
packages and the model-facing tool registry require no rewrite.
