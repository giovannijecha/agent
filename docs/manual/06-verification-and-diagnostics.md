# 06 - Verification and diagnostics

## Verify a repository change

Run the complete gate from the repository root before treating work as finished.

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

Linux:

```bash
bash tools/verify.sh
```

The gate validates toolchain, living documents, CI, brand assets, evaluation
corpus, provider registry, manifests, lock topology, declarations, source
hygiene, package imports, builds, tests, native boundaries, and CLI smoke
behavior. It does not contact a model provider. Pull requests run the same gate
on Windows and Linux; both required jobs must pass.

## Diagnose the first failure

Begin with the earliest failed boundary. A failure before build usually means a
registry, manifest, document, toolchain, source inventory, or workspace edge
drifted. Correct the owned input; do not edit generated output or weaken the
check.

Use `npm run build` for a focused compiler check and the owning module’s test for
iteration. Every defect needs a focused regression. A focused pass proves only
that boundary, so finish with the complete platform gate.

CLI failures use stable coarse categories such as `application`, `arbiter`,
`frame`, `runtime`, `source`, `terminal`, or `cleanup`. Model/tool/provider
failures have the more precise content-free categories described in
[Turn lifecycle](02-turn-lifecycle.md),
[Tools and permissions](04-tools-and-approval.md), and
[Providers and authentication](05-providers-and-authentication.md).

Never add credentials, prompts, file contents, account identifiers, provider
bodies, or other personal data to diagnostic output or retained evidence.

## Run an evaluation

Owned evaluations are maintainer evidence, not product runtime, release tests,
training data, or a provider benchmark. List registered tasks with:

```powershell
node tools/evaluate.mjs list
```

Follow the [evaluation guide](../../evaluations/README.md) for preparation,
interactive use, grading, evidence, and cleanup. Start
`agent --evaluation-receipt` yourself from the prepared workspace and make
permissions through the ordinary product flow.

The receipt records only elapsed time and accepted turn/tool/approval/repeated-
read counts. These metrics do not prove semantic correctness. If receipt or
product settlement fails, keep the evidence pending; never reconstruct values.

## Maintain or roll back

Update source, tests, registry, living documentation, generated output, and
removal path as one coherent change. Rollback restores the last complete
contract, including durable-format compatibility where state may already exist.
Remove a subsystem from composition first, then delete every exclusive source,
test, declaration, registry, native helper, document reference, and durable
state path before running the full gate.

The full workflow and definition of done live in
[Engineering](../ENGINEERING.md).
