# 0065: Owned red-green tool recovery evaluation

- Status: accepted
- Date: 2026-08-16
- Amends: decision 0047

## Context

The maintained evaluation corpus proves that `agent` can complete bounded
single-file and multi-file work, preserve compound goals, request exact
permissions, and finish with exact or reviewed artifacts. Decision 0064 also
removed one invalid TypeScript fixture whose absent module caused repeated
process failures. The corrected task then completed exactly in one accepted
turn.

That evidence does not exercise one distinct product path under a valid task
contract: a nonzero `run_process` result must become acknowledged conversation
truth, after which the same agent must make a bounded correction and execute
the same test command successfully. Unit and integration tests prove the
runtime and tool contracts mechanically, but the maintained provider-backed
evaluation corpus does not yet measure this red-green recovery behavior.

A single informal failure must not justify a prompt, runtime, provider, tool,
permission, or concurrency change. The missing evidence should be collected
through one original reproducible task before any product intervention is
considered.

## Decision

The corpus adds `javascript-red-green-recovery`, one original zero-dependency
JavaScript bug-fix task. Its operator brief requires the normal agent to:

1. run the existing `node --test` command before editing and observe its
   nonzero result;
2. make the smallest complete source correction without changing tests, the
   public API, the package manifest, or unrelated formatting; and
3. run the exact same command after editing and reach success.

The input and expected snapshots contain the same package manifest and test.
Only the source defect differs. A focused repository regression executes the
two immutable versioned fixtures with the current approved Node executable and
an empty environment. The input must fail on the intended assertion, while the
expected snapshot must pass. Module resolution, syntax, launch, or fixture
configuration failures are regressions.

The brief owns the red-green sequence as an evaluation completion condition;
it does not prescribe a provider response count, internal reasoning strategy,
read count, permission choice, or exact total tool-call count. The content-free
receipt records accepted lifecycle counts after the run, and the operator
classifies the result through the existing closed record. The evaluator still
does not capture a transcript or inspect tool payloads.

One negative provider-backed run remains an `observing` result under decision
0049. It cannot change product behavior. An actionable recovery defect requires
at least one independently reviewed recurrence on this same maintained task
revision. Successful runs remain ignored local evidence and do not enter the
failure registry.

## Bounds and security

This task adds no product authority. It does not change the prompt, provider
adapter, runtime loop, batch ordering, tool schemas, process registry,
permission policy, native containment, transcript, TUI, or receipt. Tool calls,
mutations, permissions, and model turns remain serialized.

The repository regression starts only `process.execPath` with the fixed
`--test` argument in the exact immutable input or expected directory. It uses
no shell, PATH lookup, dependency, loader, inherited environment, network,
credential, ignored run, prepared workspace, or model-authored path. The
canonical verifier never starts `agent` or contacts a provider.

The live evaluation remains an explicit maintainer operation. The operator
reviews every permission request, exits normally to obtain the content-free
receipt, grades regular-file equality without executing candidate code, and
records only observed metrics and closed classifications.

## Verification

Focused corpus tests prove exact manifest registration, shared package and test
bytes, one exact expected source correction, input assertion failure, expected
success, and absence of module-resolution failure. Existing preparation,
grading, record, failure-registry, ownership, and manual tests continue to
apply. The canonical Windows and Linux verifier remains the release gate.

After this change passes and is integrated, prepare a new run from the
registered input. Do not retrofit an earlier run, alter the brief during the
session, reconstruct a lost receipt, or compare results across task revisions.

## Update, rollback, and removal

Changing the red-green sequence requires this decision, decision 0047, the
manifest, brief, both snapshots, focused tests, evaluation guidance, ownership
registrations, and removal instructions to change together. Preserve one fixed
command whose input fails for the intended behavior and whose expected snapshot
passes without external substrate.

To roll back the task, remove its complete manifest entry and task directory,
focused assertions, this decision, and every red-green documentation and policy
registration in the same change. Local ignored runs may then be removed by the
maintainer. No product package, runtime, provider, tool, permission, or TUI
module requires a rollback.
