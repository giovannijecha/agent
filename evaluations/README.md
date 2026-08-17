# Owned task evaluations

## Scope

`evaluations/` owns original repeatable `agent` workspaces.
It is an evaluation corpus, not product runtime, training data, or a claim of
model quality. Prepared workspaces exclude expected snapshots.

`list` prints the eight registered task identifiers. The corpus spans C,
documentation, JavaScript, TypeScript, and web work.

## List and prepare a run

```powershell
node tools/evaluate.mjs list
node tools/evaluate.mjs prepare javascript-collapse-whitespace run-01
```

Choose a lowercase run ID, not a Windows device name. Preparation copies
input to ignored `workspace/` and writes a content-free record.

## Run agent and capture the receipt

Start `agent --evaluation-receipt` from the emitted `workspace` directory and
submit `TASK.md` with normal permissions. Cleanup emits:

```json
{"approvals":2,"elapsedMilliseconds":79869,"repeatedReads":1,"schemaVersion":1,"toolCalls":4,"turns":1}
```

Content-free mechanics do not prove semantics, tool identity, risk, or
alternatives. The TTY-only option cannot be combined. On failure or loss,
preserve the result and pending record. Never reconstruct values from
screenshots, transcripts, provider output, or tool activity.

## Grade and validate the record

```powershell
node tools/evaluate.mjs grade javascript-collapse-whitespace run-01
```

Copy the receipt's five metric values into adjacent `record.json`; its schema
version is present. From the task and grade, set the closed outcome,
artifact, and primary constraint; enter `manualCorrections` and
`riskyActions` as bounded counts. Add no fields beyond the template:

```powershell
node tools/evaluate.mjs validate-record javascript-collapse-whitespace run-01
```

An empty workspace is non-exact with all expected paths missing; only the
operator may accept an alternative.

## Protect local state and content

Runs stay in ignored `state/evaluations/`. The evaluator has no reset or delete
command; it neither executes candidate code nor contacts a provider, and retains
no prompts, transcripts, content, credentials, notes, or personal identifiers.
The offline verifier checks only owned inputs;
snapshot path limits apply after the canonical task prefix is removed.

## Maintain failure evidence

`failures/registry.json` holds reviewed, versioned evidence; it is not run state
or a second evaluator. Entries contain only closed task,
classification, priority, positive occurrence count, grade-path, lifecycle, and
resolution fields; they exclude run IDs or metrics, prompts, responses,
transcripts, candidate content, provider identity, timestamps, and notes.

The canonical verifier validates the registry against the current task catalog
and tracked source inventory. Evaluator commands reserve the registry directory,
file, and complete byte allowance but do not parse it or inspect ignored runs.

Increment only after a reviewed recurrence of the same failure. A first occurrence
remains `observing`; promote it to `actionable` only when frequency or impact
justifies a correction. `resolved` needs tracked decision or regression
evidence. Remove evidence if a corpus correction proves its expected snapshot
could not satisfy its own check; never resolve or use it.

## Update or remove the corpus

Change a task atomically: brief, snapshots, manifest, completion contract,
evidence, docs, and tests. Validate paths, regular files, bounds, and
reconstruction; grade offline; run focused tests. Revisions invalidate old results.

Rollback restores the set. Task removal deletes its manifest entry, directory,
evidence, docs, and tests; never move or reconstruct ignored runs or receipts.
Framework removal follows
[decision 0047](../docs/decisions/0047-owned-reproducible-task-evaluation.md).

## References

See [privacy](../PRIVACY.md#local-task-evaluation) and
[evaluation decisions](../docs/decisions/README.md#current-authority-by-domain).
