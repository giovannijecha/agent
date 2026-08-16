# 0047: Owned reproducible task evaluation

- Status: accepted
- Date: 2026-08-14
- Amended: 2026-08-16 for compound convergence, self-verifying fixtures,
  controlled red-green recovery, and namespace-directory evidence

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

The maintained corpus also includes one compound same-file browser task with
three independent requested outcomes. It measures whether the same agent keeps
the complete goal in view and produces one focused artifact without adding a
file. The existing browser extraction task remains the distinct multi-file
case. Neither task prescribes a model call count or changes product authority.

The TypeScript endpoint task owns one directly executable test contract. Its
input and expected snapshots retain the same `.ts` import specifier; the input
must fail on the intended endpoint assertion and the expected snapshot must
pass under the approved Node runtime. Focused verifier tests may execute these
immutable versioned fixtures, but the evaluator and verifier never execute a
prepared or model-authored candidate workspace. Decision 0064 owns that exact
boundary.

The JavaScript red-green task owns one controlled process-recovery contract.
Its brief requires the normal product to run `node --test` before editing,
acknowledge the intended assertion failure, make one bounded source correction,
and run the exact same command successfully. Its immutable input and expected
fixtures prove those two command outcomes independently. Decision 0065 owns
this evidence boundary; it changes no product behavior or execution authority.

The browser stylesheet task owns one portable namespace-directory contract.
Its input omits the directory required by its expected nested stylesheet, so
ordinary exact completion must create that namespace before applying the file
effect. Decision 0066 owns this evidence boundary and deliberately limits it to
`create_directory`, which is admitted on both supported platforms.

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

Repository source traversal excludes the exact ignored root `state/`
directory. A prepared candidate manifest or source file therefore cannot become
a package, ownership, source-hygiene, or generated-artifact input to the
canonical gate.

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
has limits derived from those per-task bounds plus one failure-registry file,
one containing directory, and the registry's 32,768-byte allowance from
decision 0049. Snapshot path limits apply to the path relative to `input/`,
`expected/`, or the candidate workspace; corpus traversal admits only the fixed
`tasks/<task-id>/<snapshot>/` prefix overhead before the exact relative bound is
reapplied. Run identifiers contain at most 48 lowercase ASCII letters, digits,
or hyphens and cannot equal a Windows reserved device name. Counts are capped
at 10,000 and elapsed time at 86,400,000 milliseconds.

Unknown manifest or record fields, duplicate tasks, invalid ordering, malformed
text, control characters outside tab and LF, traversal, absolute paths,
oversized data, nonportable or case-colliding names, missing fixtures, and
inconsistent record/grade combinations return a content-free error and nonzero
exit status. Operational output uses repository-relative run paths. Grading
never mutates the run. No evaluation failure weakens the product verifier or
changes a product result.

## Verification

Pure policy tests cover the canonical eight-task corpus, schema and key drift,
task ordering, duplicate identifiers, path and text rejection, snapshot bounds,
identical snapshots, metric bounds, and record consistency. A focused process
regression executes only the maintained TypeScript and JavaScript red-green
input and expected fixtures, proving intended assertion failure and success
respectively without module-resolution failure. Filesystem tests cover staged
preparation, existing-run rejection, exact grading, changed, missing,
unexpected, and empty candidate trees,
portable run identifiers, exact snapshot-relative path boundaries, and
content-free diagnostics. The canonical gate validates the registered suite
and runs those tests on Windows and Linux.

## Consequences

Product changes can now be evaluated against stable coding tasks without
expanding model authority or making CI depend on a provider. Exact snapshots
favor reproducibility over broad semantic acceptance, so results remain
evidence for review rather than a claim of model quality. Decision 0048 adds an
opt-in content-free product receipt for five mechanically observable metrics;
semantic classifications, manual corrections, and risky actions remain
operator-entered. Decision 0049 adds one independently validated versioned
failure registry for reviewed negative evidence; evaluator commands admit its
inventory path but never parse it or read ignored runs.

## Update, rollback, and removal

Adding or changing a task requires updating the manifest, brief, input,
expected snapshot, policy tests, and relevant maintenance documentation in one
change. Corpus changes invalidate comparisons with earlier task revisions and
must be reviewed as evaluation-contract changes.

A task that claims a runnable completion check must prove that its maintained
input reaches the intended behavioral failure and its expected snapshot passes.
Do not retain product-failure evidence from a corpus whose expected snapshot
cannot satisfy its own check.

A task that measures red-green recovery must keep the pre-edit failure and
post-edit success on one exact fixed command. One negative run remains
observational; require independently reviewed recurrence on the same task
revision before changing product behavior.

To roll back one task, remove its manifest entry and complete task directory.
To remove the framework, first remove every evaluation run outside version
control, then delete `evaluations/`, the evaluator and failure-registry
libraries and entry point, their tests and verifier hooks, this decision,
decision 0049, and their ownership, manual, privacy, security, engineering,
maintenance, and README references. Product packages and the model-facing tool
registry require no rewrite.
