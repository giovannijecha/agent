# Owned task evaluations

## Scope

`evaluations/` owns original repeatable `agent` workspaces.
It is an evaluation corpus, not product runtime, training data, or a claim of
model quality. Prepared workspaces exclude expected snapshots.

`list` prints all 8 registered task identifiers. The corpus spans C,
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
submit the `task` brief emitted by `prepare`; honor its `Completion` acceptance
and denial conditions. Cleanup emits:

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
version is present. From task and grade, set the closed outcome,
artifact, and primary constraint; enter `manualCorrections` and
`riskyActions` as bounded counts. Add no fields beyond the template:

```powershell
node tools/evaluate.mjs validate-record javascript-collapse-whitespace run-01
```

An empty workspace is non-exact with all expected paths missing; only the
operator may accept alternatives.

## Protect local state and content

Input and created/edited `workspace/` files persist in ignored
`state/evaluations/` until removed. The evaluator cannot delete them, run
candidate code, or contact a provider; it captures no prompt, transcript,
provider output, or receipt line. Records retain admitted fields only. Keep
sensitive content out. Offline verification uses owned inputs; snapshot path
limits apply after the canonical task prefix is removed.

## Maintain failure evidence

`failures/registry.json` holds reviewed versioned evidence, not run state or a
second evaluator. Entries contain only bounded entry and registered-task IDs;
closed category, priority, lifecycle, and record classifications; positive
occurrence count; content-free grade-path sets; resolution fields. They exclude
run IDs, metrics, prompts, responses,
transcripts, candidate content, provider identity, timestamps, and notes.

The canonical verifier validates the registry against the current task catalog
and tracked source inventory. Evaluator commands reserve the registry directory,
file, and complete byte allowance but do not parse it or inspect ignored runs.

Increment only after reviewed recurrence of the same failure. A first occurrence
remains `observing`; promote it to `actionable` only when frequency or impact
justifies a correction. `resolved` needs tracked decision/regression
evidence. Remove evidence if a corpus correction proves its expected snapshot
could not satisfy its own check; never resolve or use it.

## Update or remove the corpus

Change a task atomically with its brief, snapshots, manifest, completion
contract, owning decision, evidence, docs, ownership/manual policy registrations,
and tests. Validate paths, regular files, bounds, reconstruction; grade offline;
run focused tests. Revisions invalidate old results.

Rollback restores that set. Task removal deletes that registered set; never move
or reconstruct ignored runs or receipts. Framework removal:
[decision 0047](../docs/decisions/0047-owned-reproducible-task-evaluation.md).

## References

See [privacy](../PRIVACY.md#local-task-evaluation) and
[evaluation decisions](../docs/decisions/README.md#current-authority-by-domain).
