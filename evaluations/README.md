# Owned task evaluations

This directory contains small original workspaces for repeatable `agent` usage.
It is an evaluation corpus, not product runtime, training data, or a claim of
model quality. The expected snapshots never enter a prepared workspace.

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

If the receipt itself fails, preserve the product result, record no guessed
mechanical values, and diagnose the fixed content-free error separately. The
option requires TTY input and output; it cannot be redirected or combined with
another launch option.
