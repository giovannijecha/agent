# Owned task evaluations

This directory contains small original workspaces for repeatable `agent` usage.
It is an evaluation corpus, not product runtime, training data, or a claim of
model quality. The expected snapshots never enter a prepared workspace.

List the registered tasks:

```powershell
node tools/evaluate.mjs list
```

Prepare one new run using a lowercase run identifier:

```powershell
node tools/evaluate.mjs prepare javascript-collapse-whitespace run-01
```

Start `agent` from the emitted `workspace` directory and submit the task's
`TASK.md` brief. After the turn is complete, compare the workspace with the
canonical artifact:

```powershell
node tools/evaluate.mjs grade javascript-collapse-whitespace run-01
```

Complete the adjacent `record.json` using only the closed fields already in its
template, then validate it:

```powershell
node tools/evaluate.mjs validate-record javascript-collapse-whitespace run-01
```

Runs live under ignored `state/evaluations/`. The evaluator has no reset or
delete command, never executes candidate code, never contacts a provider, and
does not retain prompts, transcripts, file contents, credentials, free-form
notes, or personal identifiers. A non-exact tree is a review signal; only the
operator may classify it as an accepted alternative.
