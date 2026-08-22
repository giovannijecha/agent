# Engineering

This is the development, verification, and maintenance contract for Agent.
Architecture describes what the product is; this document describes how to
change it safely without turning process into a second product.

## Working method

1. Start from a clean branch based on current `main` and inspect the existing
   behavior, tests, and relevant living documents.
2. Define one coherent module with an explicit observable or structural
   boundary.
3. Add a focused regression that fails for the missing behavior or reproduced
   defect.
4. Implement the smallest complete change at the owning package boundary.
5. Update affected operator behavior, architecture, privacy/security, registry,
   maintenance, and removal guidance in the same module.
6. Run focused build/tests, review the diff, and finish with the complete
   platform-native verifier.

Keep one source of authority per fact. Source and tests own executable detail;
the operator manual owns use; Architecture owns package and effect boundaries;
Privacy and Security own retained data and threat boundaries. Git history and
review preserve change rationale. Do not add numbered decision records, prose
digests, migration ledgers, or duplicate runbooks.

## Toolchain

The registered toolchain is:

- Node.js `>=22.19.0`;
- npm `11.16.0`;
- external TypeScript `5.9.3` targeting ESM/ES2022; and
- external Clang `>=18`, C17, Windows/Linux x64.

Toolchain software remains outside the repository. Installation is offline and
does not run package scripts:

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
```

Do not add npm packages, vendored source, SDKs, frameworks, generated foreign
code, `@types/node`, or repository-local compiler binaries. Generated `dist/`,
`.test-dist/`, native build directories, and workspace links are derived and
ignored; never edit them manually.

## Source rules

- Use ESM with explicit runtime extensions and public `src/index.ts` package
  surfaces.
- Product dependencies are exact edges between registered local workspaces.
- Use only explicitly admitted `node:` built-ins at the CLI boundary and in
  maintainer tooling. Node-free packages must remain Node-free.
- Bare built-in names, `require`, loaders, dynamic imports, `npx`, `npm exec`,
  install scripts, and external specifiers are forbidden.
- Keep computed member access statically provable. Use explicit collection APIs
  such as `.at()` for runtime indexing.
- Author the minimal Node declarations required by the exact runtime contract.
  Do not reproduce the full platform surface.
- Return explicit immutable results across package boundaries. Do not swallow
  errors, mutate hidden global authority, discover network origins, or add
  fallback paths.
- Product source, tests, prompts, fixtures, identifiers, and structure must be
  original. Public specifications may supply facts, not implementations.

Native C helpers are private CLI implementation. They receive bounded binary
protocols through private pipes, run with a controlled environment, return
content-free closed results where required, and never become model-facing tools
or public packages. Missing native guarantees fail closed; JavaScript pathname
fallbacks do not replace an object-bound security primitive.

## Packages and tests

Test behavior at its owner:

- core tests prove deterministic state and bounds;
- tool tests prove schema, planning, permission, stale-state, and result truth;
- runtime tests prove ordering, checkpoints, cancellation, and cleanup;
- provider tests use injected transports and inert protocol fixtures;
- TUI tests prove pure state, layout, rendering, and input behavior;
- CLI tests prove platform composition and lifecycle through owned boundaries;
- native fixture tests prove Windows/Linux primitive behavior; and
- tooling tests prove registries, source constraints, and the release gate.

Every bug fix requires a regression that fails for the defect. Every
integration requires contract tests for success, bounds, cancellation, unsafe
input, cleanup, and removal. Tests never contact a real provider, contain a real
credential, depend on wall-clock races, import third-party code, or weaken a
production boundary through a test-only branch.

Use inert sentinels for credential-shaped data. Numeric provider statuses may be
fixtures only when they prove a closed content-free classification; captured
provider bodies, prompts, personal content, and foreign causes are forbidden.

## Documentation

The maintained authority documents are intentionally few:

- root README, Privacy, Security, and this repository contract;
- Architecture and Engineering;
- the task-oriented operator manual;
- brand-asset guidance; and
- the evaluation guide.

The documentation checker verifies the exact authority inventory, local links,
canonical public identity, license text, absence of a decision ledger, and
absence of automated attribution. It does not classify prose, pin paragraphs,
or pretend to prove semantics. Behavioral tests and maintainer review do that.

Write project artifacts in English. Link to an existing authority instead of
creating another document. When a document becomes obsolete, move any still-
current operator or engineering fact to its live owner, update incoming links,
then delete the document and its mechanical checks together.

## Focused verification

Common focused commands are:

```powershell
npm run build
node --test tools/test/docs-check.test.mjs
node --test tools/test/provider-policy.test.mjs
node --test tools/test/brand-policy.test.mjs
node --test tools/test/ci-policy.test.mjs
node --test tools/test/evaluation-suite.test.mjs
```

Package tests execute from generated `.test-dist` output after the build. Use a
focused test while iterating, but never treat it as the complete release gate.

## Canonical verification

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

Linux:

```bash
bash tools/verify.sh
```

The gate checks, in owned order:

1. registered external toolchain versions;
2. documentation, CI, brand, evaluation, and provider contracts;
3. manifests, lockfile, workspace graph, and npm policy;
4. declarations, source hygiene, import boundaries, and registered source
   authority;
5. clean generation, TypeScript build, and all tests;
6. native helper builds and fixtures; and
7. the CLI smoke lifecycle.

The GitHub workflow uses repository-owned shell instructions, no imported
actions, read-only contents permission, no provider secrets, and the same
Windows/Linux gate. Both required jobs must pass before merge.

## Diagnosis

Start with the first failing boundary. A pre-build failure usually identifies a
registry, manifest, document, source inventory, toolchain, or workspace-graph
drift. Correct the owned input; do not edit derived output or reduce validation
to make a symptom disappear.

For a behavioral defect:

1. reproduce it with the smallest inert input;
2. identify the package that owns the rejected or missing transition;
3. establish the red regression there;
4. inspect adjacent lifecycle, bounds, cancellation, and cleanup paths; and
5. rerun both focused and canonical verification.

Diagnostics stay content-free. Never add credentials, prompts, response bodies,
file contents, account identifiers, private paths, or foreign error text to make
a failure easier to inspect.

## Update and rollback

Update a subsystem as one vertical module: public surface, owner implementation,
composition, tests, living documents, registry entries, generated declarations,
and removal path. Preserve the prior working boundary until its replacement is
complete; do not create dual authority or silent migration.

Rollback restores the last coherent contract rather than only reverting the
visible symptom. Restore source, tests, registry, documentation, and generated
artifacts through the normal build. If a durable format has already been
published, retain explicit backward admission or provide an exact operator
rollback; never reinterpret records silently.

Provider changes additionally require exact origins, authentication authority,
request/response bounds, redirect/retry/fallback posture, credential lifecycle,
privacy/security analysis, offline transport tests, and a disabled-state proof
until composition is intentionally activated.

## Removal

Removal is a first-class implementation path:

1. disable new composition and operator entry points;
2. remove runtime reachability and package edges;
3. remove credentials or durable state through the documented bounded process;
4. delete source, declarations, native helpers, fixtures, registries, tests, and
   documentation owned only by that subsystem;
5. regenerate owned output and lock topology; and
6. run the full gate on both supported platforms.

Do not leave placeholders, dead adapters, stale provider identities, accepting
decoders, orphaned records, or a second compatibility route. Local credential
deletion is not provider revocation or secure erasure; operator documentation
must state any external account action that remains.

## Release

Before a release or merge:

- inspect the complete diff and tracked-file inventory;
- confirm no secret, personal content, foreign source, generated artifact, or
  automated attribution entered the change;
- run the canonical verifier on the current platform;
- require successful Windows and Linux CI on the exact reviewed commit;
- resolve every review finding and rerun affected focused checks; and
- merge only a clean, reviewable, reversible module.

## Definition of done

A change is complete only when the requested outcome exists, the red regression
is green, adjacent risks have focused coverage, observable documentation is
current, privacy/security and removal remain honest, generated output comes only
from the toolchain, the diff is clean, and the complete verifier passes.
