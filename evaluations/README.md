# Owned task evaluations

This directory contains small original workspaces for repeatable `agent` usage.
It is an evaluation corpus, not product runtime, training data, or a claim of
model quality. The expected snapshots never enter a prepared workspace.

The eight-task corpus spans C, documentation, JavaScript, TypeScript, and
browser work. `web-compound-page-edit` and `web-extract-script` cover same-file
and multi-file convergence. For `web-extract-stylesheet`, approve
`manage_path(create_directory)`, reject alternate directory creation, then
permit `apply_patch` to create its nested stylesheet.
`javascript-red-green-recovery` requires the same Node test to fail before its
bounded edit and pass afterward.
`typescript-inclusive-range` directly proves its input assertion failure and
expected success through one tracked `.ts` import.

List the registered tasks:

```powershell
node tools/evaluate.mjs list
```

Prepare one new run using a lowercase run identifier that is not a Windows
reserved device name:

```powershell
node tools/evaluate.mjs prepare javascript-collapse-whitespace run-01
```

Start `agent --evaluation-receipt` from the emitted `workspace` directory and
submit the task's `TASK.md` brief. The product runs normally. After terminal
cleanup it emits one JSON line such as:

```json
{"approvals":2,"elapsedMilliseconds":79869,"repeatedReads":1,"schemaVersion":1,"toolCalls":4,"turns":1}
```

The receipt is content-free and remains outside the run. It measures only the
five mechanical values shown; do not infer semantic quality from them. After
the turn is complete, compare the workspace with the canonical artifact:

```powershell
node tools/evaluate.mjs grade javascript-collapse-whitespace run-01
```

Copy the five receipt values into the adjacent `record.json`. Complete outcome,
artifact status, manual corrections, risky actions, and primary constraint by
reviewing the task and grade. Use only the closed fields already in the
template, then validate it:

```powershell
node tools/evaluate.mjs validate-record javascript-collapse-whitespace run-01
```

Runs live under ignored `state/evaluations/`. The evaluator has no reset or
delete command, never executes candidate code, never contacts a provider, and
does not retain prompts, transcripts, file contents, credentials, free-form
notes, or personal identifiers. Snapshot path limits apply after the canonical
task prefix is removed. An empty candidate workspace is graded as a non-exact
tree with every expected path missing. A non-exact tree is a review signal;
only the operator may classify it as an accepted alternative.

If a receipt fails or is lost, preserve the product result and leave its record
pending. Never reconstruct values from screenshots, transcripts, provider
output, or tool activity. The option requires TTY input and output; it cannot be
redirected or combined with another launch option.

## Failure evidence

Reviewed negative results may be retained in `failures/registry.json`. The
registry is versioned evidence, not ignored run state or a second evaluator. An
entry binds one maintained task to a closed category, priority, lifecycle,
positive occurrence count, record classifications, and content-free grade path
sets. It contains no run identifier, metric sample, prompt, response,
transcript, candidate content, provider identity, timestamp, or free-form note.

Add one occurrence only after reviewing another run that exhibits the same
failure. The validator requires a first occurrence to remain `observing`;
promote it to `actionable` only when frequency or impact justifies a correction.
A `resolved` entry must point to tracked decision or regression evidence. The
canonical verifier validates the registry against the current task catalog and
tracked source inventory. Evaluator commands reserve the registry directory,
file, and complete byte allowance but do not parse it or inspect ignored runs.
Remove evidence if a corpus correction proves its expected snapshot could not
satisfy its own check; do not resolve or use that evidence.
