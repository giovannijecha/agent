# 0064: Owned self-verifying TypeScript evaluation fixture

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0047 and 0049

## Context

The maintained `typescript-inclusive-range` task asks the agent to change one
TypeScript loop and preserve the existing test. Both canonical snapshots contain
only `src/sum-range.ts`, while the test imports `../src/sum-range.js`. The
admitted Node runtime executes TypeScript directly, but it does not reinterpret
that explicit JavaScript specifier as a TypeScript path. Consequently,
`node --test test/sum-range.test.ts` fails with module resolution even against
the canonical expected snapshot.

One earlier evaluation reached the required source edit and then created an
unexpected JavaScript copy while attempting to satisfy this impossible
verification boundary. That result was retained as model-planning evidence
under decision 0049. A fresh observation reached the exact expected tree but
repeated unsuccessful process calls against the same corpus defect. The second
run was interrupted and produced no receipt, so its metrics must remain absent.
Together these observations prove a task-contract defect, not missing product
authority and not a reason to widen process execution.

## Decision

The input and expected test snapshots for `typescript-inclusive-range` import
the existing `../src/sum-range.ts` file exactly. The task still requires the
agent to preserve the test, public signature, and iterative implementation, and
to make only the smallest behaviorally complete source change. It gains no
package manifest, dependency, build step, loader, generated JavaScript, or
additional expected file.

The focused evaluation-suite regression executes only the two immutable,
versioned fixture tests with the current approved Node executable. The input
fixture must reach its assertion and fail because the endpoint is excluded; the
expected fixture must pass. A module-resolution failure in either fixture is a
regression. This proof is part of repository verification and never executes a
prepared or model-authored candidate workspace.

The original failure-registry entry is removed. Decision 0047 invalidates
comparisons when a task contract changes, and evidence produced by a canonical
snapshot that cannot satisfy its own completion check must not remain available
to justify a prompt, runtime, provider, or tool change. The empty registry stays
owned and validated. This is evidence invalidation, not a claim that a product
failure was resolved.

The interrupted local run remains ignored with its pending record. Its receipt
is intentionally unrecoverable and no metric may be reconstructed from terminal
memory, screenshots, provider output, or tool activity.

## Bounds and security

This change affects maintained evaluation source only. It does not change the
model prompt, provider request, runtime loop, tool schema, process registry,
permission policy, filesystem authority, candidate grader, receipt, transcript,
or canonical task bounds. The verifier continues to avoid credentials, provider
traffic, `agent` launch, run creation, ignored state, and candidate execution.

The regression starts only the already approved Node executable with fixed
repository-owned arguments and versioned fixture paths. It supplies no model
input, candidate content, shell, network access, environment-controlled path,
or generated output to the repository.

## Verification

Focused tests prove the input fixture fails on the endpoint assertion rather
than module resolution, the expected fixture passes, both snapshots retain the
same test, and neither snapshot adds a JavaScript source copy. Existing suite
tests continue to prove complete inventory ownership, distinct input and
expected trees, and candidate grading without execution. Failure-registry tests
prove the canonical empty registry remains valid.

The canonical Windows and Linux verifier remains the release gate. After this
change passes and is integrated, a new evaluation run must start from the
corrected input snapshot; the interrupted run and every earlier comparison are
not reused.

## Update, rollback, and removal

Changing this fixture requires this decision, both canonical snapshots, focused
tests, task-evaluation guidance, failure evidence, ownership registrations, and
decisions 0047 and 0049 to change together. A future execution substrate must
retain one direct, dependency-free command that distinguishes the input defect
from the expected correction before replacing the exact `.ts` specifier.

Roll back only by restoring a different self-contained test contract that still
fails on the input behavior and passes on the expected behavior. Do not restore
the unresolved `.js` specifier or the invalidated failure entry. Remove this
decision only after the TypeScript task is removed completely or another
decision replaces its self-verification contract and all registrations.
