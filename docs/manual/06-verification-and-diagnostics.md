# 06 - Verification and diagnostics

## Verify a change

Run the complete gate from the repository root before treating a change as
finished:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

On Linux, run the matching owned entry point:

```bash
bash tools/verify.sh
```

The gate checks ownership and documentation policy, source hygiene, manifests
and lock topology, package boundaries, builds, tests, native code, and the CLI
smoke path. It rebuilds derived output from owned inputs and does not contact a
model provider. The protected Windows and Linux pull-request jobs invoke these
same platform entry points; both must pass before merge.

## Diagnose the first failure

Start with the earliest failed boundary. A policy or ownership failure before
the build usually means an owned source, registry, manifest, or document has
drifted. Correct that input; do not edit generated output or weaken the gate.
Build and test failures remain visible through their owning command and should
receive a focused regression at the same boundary.

When the CLI stops, use its stable coarse category to choose the owner:
`application`, `arbiter`, `frame`, `runtime`, `source`, `terminal`, or
`cleanup`. Model and tool failures have the more specific recovery described in
[Turn lifecycle](02-turn-lifecycle.md#recover-from-a-failure) and
[Tools and permissions](04-tools-and-approval.md#interpret-a-tool-result).
Diagnostics must not add credentials, prompts, file contents, or other personal
content to logs or retained evidence.

## Use focused checks

Use `npm run build` when the change needs an immediate compiler check. Run
focused tests for the owning module after their artifacts have been built; the
repository test command is not a substitute for the complete platform gate.
Every bug fix needs a regression test, and every integration needs contract
coverage for its admitted boundary.

Finish by running the complete gate again. A focused success proves only the
boundary it exercised.

## Run an evaluation

Owned evaluations are maintainer review evidence, not product runtime, release
tests, training data, or a provider benchmark. List the registered tasks with:

```powershell
node tools/evaluate.mjs list
```

Follow the complete prepare, interactive run, grade, and record-validation
workflow in the [evaluation guide](../../evaluations/README.md). Start
`agent --evaluation-receipt` yourself from the prepared workspace and make each
permission decision in the ordinary product flow. The canonical verifier
validates the corpus and evaluator implementation; it never creates a run,
contacts a provider, or executes candidate files.

## Handle evaluation evidence

The receipt contains only duration, accepted turns, accepted tool calls,
affirmative approvals, and repeated reads. These mechanical counts do not prove
semantic correctness, tool identity, risk, or acceptable alternatives. Grade
the artifact separately and complete the closed review fields yourself.

If the receipt is lost or its settlement fails, leave the record pending. Never
reconstruct its values. Keep the product result primary when both product and
receipt settlement fail. A first negative observation remains observational;
durable failure evidence requires the reviewed recurrence and closed lifecycle
defined by the evaluation guide.

## References

- [Engineering definition of done](../ENGINEERING.md#definition-of-done)
- [Engineering verification policy](../ENGINEERING.md#verification)
- [Continuous-verification maintenance](../MAINTENANCE.md#continuous-verification)
- [Task-evaluation maintenance](../MAINTENANCE.md#task-evaluation)
- [Release gate](../MAINTENANCE.md#release-gate)
- [Evaluation guide](../../evaluations/README.md)
- [Current authority by domain](../decisions/README.md#current-authority-by-domain)
- [Decision 0012: owned continuous verification](../decisions/0012-owned-continuous-verification.md)
- [Decision 0047: reproducible task evaluation](../decisions/0047-owned-reproducible-task-evaluation.md)
- [Decision 0048: content-free evaluation receipt](../decisions/0048-owned-content-free-evaluation-receipt.md)
- [Decision 0049: evaluation failure registry](../decisions/0049-owned-evaluation-failure-registry.md)
