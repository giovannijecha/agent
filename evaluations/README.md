# Owned task evaluations

## Scope

`evaluations/` contains original workspaces for repeatable `agent` tasks.
It is an evaluation corpus, not product runtime, training data, or a claim of
model quality. Expected snapshots never enter a prepared workspace.

The registered tasks span five project kinds. `web-compound-page-edit` and
`web-extract-script` cover same- and multi-file
convergence. `javascript-red-green-recovery` requires the same Node test to fail
then pass; `typescript-inclusive-range` uses one tracked `.ts` import. For
`web-extract-stylesheet`, approve `manage_path(create_directory)`, reject
alternatives, then permit `apply_patch`.

## List and prepare a run

```powershell
node tools/evaluate.mjs list
node tools/evaluate.mjs prepare javascript-collapse-whitespace run-01
```

Use a new lowercase, non-Windows-device run identifier. Preparation copies only
the input into an ignored `workspace/` and writes its content-free record.

## Run agent and capture the receipt

Start `agent --evaluation-receipt` from the emitted `workspace` directory and
submit the task's `TASK.md` brief. Use normal permissions. After cleanup it
emits one JSON line:

```json
{"approvals":2,"elapsedMilliseconds":79869,"repeatedReads":1,"schemaVersion":1,"toolCalls":4,"turns":1}
```

These values are content-free mechanics, not semantic, tool, risk, or
alternative evidence. The option requires TTY input and output and cannot be
combined. If its receipt fails or is lost, preserve the result and leave the
record pending. Never reconstruct values from screenshots, transcripts, provider
output, or tool activity.

## Grade and validate the record

```powershell
node tools/evaluate.mjs grade javascript-collapse-whitespace run-01
```

Copy the receipt into adjacent `record.json`. Review the task and grade to fill
the remaining closed outcome, artifact, correction, risk, and constraint fields:

```powershell
node tools/evaluate.mjs validate-record javascript-collapse-whitespace run-01
```

An empty workspace is non-exact with every expected path missing. Only the
operator may accept an alternative.

## Protect local state and content

Runs live under ignored `state/evaluations/`.
The evaluator has no reset or delete command. It never executes candidate code,
contacts a provider, or retains prompts, transcripts, content, credentials,
notes, or personal identifiers. The offline verifier checks only owned inputs;
snapshot limits apply after the canonical task prefix.

## Maintain failure evidence

Reviewed negative results may enter `failures/registry.json`. It is versioned
evidence, not run state or a second evaluator. Entries contain only closed task,
classification, count, grade-path, lifecycle, and resolution fields; they
exclude run IDs or metrics, prompts, responses, transcripts, candidate content,
provider identity, timestamps, and notes.

Add an occurrence only after another reviewed run shows the same failure. A
first occurrence remains `observing`; promote it to `actionable` only when
frequency or impact justifies a correction. `resolved` requires tracked
decision or regression evidence. Remove evidence if a corpus correction proves
its expected snapshot could not satisfy its own check; do not resolve or use
that evidence.

## Update or remove the corpus

Change a task by updating its brief, snapshots, manifest, completion contract,
affected evidence, documentation, and tests together. Validate paths,
regular-file trees, bounds, and reconstruction; keep grading offline and run
focused tests. A revision invalidates older results.

Rollback restores that set. Removal deletes its manifest entry, task directory,
evidence, documentation, and tests; ignored runs and receipts are never moved or
reconstructed. Remove the framework through the
[maintenance guide](../docs/MAINTENANCE.md#task-evaluation) and decision 0047.

## References

See [privacy](../PRIVACY.md#local-task-evaluation) and
[evaluation decisions](../docs/decisions/README.md#current-authority-by-domain).
