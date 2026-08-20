# Engineering

## Scope

This document defines how repository changes are designed, implemented, and
proved. It is the development standard, not a second architecture description
or an operational runbook.

Use the [contributing guide](../CONTRIBUTING.md) for participation and issue
intake, [architecture](ARCHITECTURE.md) for current boundaries,
[maintenance](MAINTENANCE.md) for update and rollback procedures, and
[decisions](decisions/README.md) for accepted rationale. Use the
[evaluation guide](../evaluations/README.md) for task-corpus operation and the
maintained evidence lifecycle.

All integrations preserve the single-agent execution model.
Any mutation excludes concurrent mechanics. Only decision-0074 registered
independent read handlers may overlap, within the fixed four-call cohort bound
and deterministic provider-order reduction.

## Definition of done

A change is complete only when:

1. its authority domain and canonical owner are explicit;
2. the smallest complete implementation is in owned source;
3. package boundaries and public exports remain valid;
4. failures are explicit and bounded;
5. a bug has a regression test or an integration has contract tests;
6. visible behavior and maintainer guidance change in the same commit;
7. removal and rollback remain possible without unrelated rewrites;
8. focused checks pass;
9. the canonical verifier passes from source;
10. generated output, credentials, and unrelated work are absent.

Passing compilation alone is not completion.

## Change workflow

Maintainer changes use a protected branch.

Follow this order:

1. **Route the change.** Read the owning living document and accepted decision.
   If no owner exists, establish one before implementation.
2. **Record lasting design first.** Add a decision when the change introduces
   or replaces a durable boundary, authority, tool, provider, protocol, or
   toolchain contract.
3. **Define the failure contract.** State bounds, invalid inputs, cancellation,
   stale-state behavior, cleanup, and removal before adding the happy path.
4. **Change one authority domain.** Do not retain overlapping names, adapters,
   commands, tools, or compatibility paths after a replacement.
5. **Add evidence with the source.** Tests must fail for the missing behavior
   and pass for the implemented behavior.
6. **Update documentation and policy.** Change the canonical living document,
   manual, policy registry, and migration ledger entries that actually moved.
7. **Verify in layers.** Run the narrowest relevant checks, then the canonical
   verifier.
8. **Inspect the final diff.** Confirm scope, generated-artifact hygiene, and
   clean removal of obsolete authority.

Do not widen the task because an adjacent cleanup is attractive. Record a
separate follow-up unless the adjacent change is necessary for correctness.

## Source rules

- Use Node.js `>=22.19.0`, npm workspaces, ESM, ES2022, external TypeScript
  `5.9.3`, and original C17 for private native primitives.
- Keep third-party source, npm packages, SDKs, frameworks, snippets, vendored
  code, foreign generated code, and `@types/node` out of the repository.
- Keep TypeScript external. Every package dependency is an exact edge to a
  registered local workspace.
- Use local imports and explicitly allowlisted `node:` built-ins. Do not use
  bare built-in names, dynamic imports, `require`, loaders, `npx`, or
  `npm exec`.
- Access runtime-selected collection members through explicit APIs such as
  `.at()`; shipped modules admit only statically proven computed names.
- Verifier-only lexical analysis reconstructs bounded static string
  compositions from non-interpolated literals, parentheses, literal `+`, and
  literal arrays joined with a static separator. It never executes or imports
  product code, and an over-bound candidate fails closed.
- Source-policy identifier allowances bind each case-sensitive spelling to its
  reviewed path and exact occurrence count. A spelling admitted elsewhere never
  authorizes a new declaration or use.
- Closed source-policy inventories are bidirectional. Every registered path must
  remain in the canonical product-source set. Each approved CLI module with a
  direct `node:fs` or `node:child_process` authority must retain its reviewed
  module specifier, import bindings, and normalized source digest. The native
  C/H platform tree retains its exact ordered path set and aggregate source
  digest. Source integrity normalizes only CRLF to LF and uses SHA-256 over
  complete UTF-8 source records. Renaming, deleting, reducing, expanding, or
  otherwise changing an inventoried authority fails closed.
- The exact source digest is the sole verifier authority for code flow within an
  approved direct Node or native platform module. The verifier does not execute
  product code or attempt partial command, export, alias, assignment, or
  capability-flow inference. Any legitimate source edit requires an explicit
  review and digest update in the same policy change; a new direct filesystem,
  child-process, or native platform path requires a new exact authority record.
- Put minimal Node declarations in `types/` from authoritative runtime
  contracts.
- Cross package boundaries only through `src/index.ts`.
- Keep core, tools, runtime, provider, and TUI Node-free. Platform I/O belongs
  to the CLI.
- Never edit or commit generated `dist/`, `.test-dist/`, or native
  binaries.
- Preserve user changes in a dirty worktree and keep unrelated edits out of the
  patch.

## Evidence by change type

| Change | Required evidence |
| --- | --- |
| bug fix | a focused regression that fails without the fix |
| new or replaced integration | contract tests for lifecycle, bounds, failures, cleanup, and removal |
| public or visible behavior | focused state/presentation tests plus operator-manual update |
| schema or policy change | validator tests for acceptance and fail-closed rejection |
| provider change | offline request/stream contract tests; no live network in canonical verification |
| native boundary | focused native tests on each admitted platform plus canonical Linux and Windows gates |
| tool change | schema, planner, permission, handler, stale-state, and presentation coverage as applicable |
| conversation-tree change | pure append/select/path/bound tests, runtime settlement tests, and one CLI selection smoke path |
| durable-session change | codec and corruption tests when the schema changes; native-home root resolution; file and directory durability; bounded per-workspace migration and conflict preservation; independent payload bounds; unique-token admission and stale-token races; monotonic publication under tied or regressed clocks; storage bounds and lock tests; stop-settlement cleanup; exact-workspace recovery; and one controller composition round trip |
| documentation topology | documentation-policy regression and link/route validation |
| evaluation task | input and expected-tree validation without executing candidate workspaces |

Tests prove contracts at the narrowest owner. Avoid end-to-end tests for a
condition that a pure library test can prove, but retain one composition smoke
path for each shipped integration.

Discriminated model-facing inputs expose capability fields directly. When a
wire schema omits a cross-field combinator for interoperability, one immutable
provider-neutral schema constraint must still reject unknown discriminants and
inexact field sets during complete batch preflight. Prove the local validator,
the exact provider projection, and one composed tool path separately. Never
move structural rejection into a planner or add a provider argument rewrite.

## Verification

Canonical repository checks are:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

```bash
bash tools/verify.sh
```

Both must validate the same owned source policy and product behavior. The
verifier is offline: it never contacts a provider, reads credentials, creates
an evaluation run, or executes model-authored candidate workspaces.

Useful narrow checks include:

```powershell
node --test tools/test/documentation-policy.test.mjs
node --test tools/test/manual-policy.test.mjs
node --test tools/test/provider-policy.test.mjs
node tools/verify.mjs
npm test
npm run build
```

Run only checks relevant to the active change while iterating. Run the complete
canonical verifier before publication. If a narrow command depends on compiled
test output, use the repository build path rather than inventing a loader.

Verification claims name the exact command and result. A substituted command
does not prove a contract that names an exact invocation.

## Regression and failure policy

- Diagnose the first failed authority boundary, not the final generic symptom.
- Never convert a parse, protocol, timeout, stale-state, or cleanup failure into
  success.
- Do not add a retry, redirect, alias, router, fallback, or broader permission
  unless an accepted decision explicitly owns it.
- A failed tool request must be corrected from returned truth or reported as
  one blocker; it is never repeated blindly.
- A completed tool checkpoint remains authoritative if a later model
  continuation fails.
- A durable settled turn and its selected-head identity form one recoverable
  transition; interruption must restore the newest proven state or fail closed.
- Selecting retained history changes only the active model path. It never
  retries or replays a tool, and every later mutation replans against current
  state.
- User-facing failures expose only the closed product classification. Provider
  bodies, credentials, paths, call identifiers, and model payloads stay private.
- Provider contract tests use offline native fixtures to cover every admitted
  optional representation, canonical history encoding, malformed framing,
  envelope, message, tool-call, finish, and terminal input, and the exact
  content-free public phase. They validate an entire native record before any
  thinking, content, or tool-call contribution can be observed. A model name is
  never a parser branch or a fixture rationale. Regressions prove that one
  admitted read failure terminalizes the owning stream across later reads and
  clean end, including transport, UTF-8, NDJSON, and rejected-record failures,
  and that an unexpected HTTP response class remains an unphased open failure.
- One observed evaluation failure is evidence to investigate, not authority for
  a product change.
- Invalid evaluation fixtures are corrected or removed before their evidence is
  used.
- Every async owner has one settlement path. Late events are inert after
  settlement and cleanup has a hard bound.

### Thinking-stream contract verification

Decisions 0086 and 0085 require one complete provider-to-journal-to-TUI proof.
Regressions cover exact `think: false`, `"low"`, `"medium"`, and `"high"`
requests, independent reasoning bounds, whole-record atomicity, rejection of
late or malformed native reasoning, provider-neutral event order, immutable
turn effort across tool continuations, selected-path history, version-one
rejection and version-two round trips, crash recovery, two-row staged dock
navigation, atomic apply and dismissal, hidden and shown transcripts, footer
truth, provider and model prerequisites, model-selection preservation, explicit
unsupported-effort failure, privacy, rollback, and removal. Failed or cancelled
prospective reasoning must not enter core history, the journal, or a settled
transcript. Text and tags remain non-executable, and no test may introduce an
implicit retry, replay, fallback, or model-specific compatibility branch.

## Documentation changes

Every durable topic has one canonical owner:

- `README.md` is the short public entry;
- `AGENTS.md` routes repository work and states concise invariants;
- `docs/ARCHITECTURE.md` describes current product structure;
- this document defines development and proof;
- `docs/MAINTENANCE.md` owns runbooks, rollback, and removal;
- `docs/manual/` owns operator behavior;
- `docs/decisions/` preserves accepted rationale.

Do not copy a contract into several documents. State it once and link to it.
When moving content:

1. update the canonical owner;
2. update incoming links and anchors;
3. update the documentation policy if structure changed;
4. mark only completed rows in
   [the migration ledger](DOCUMENTATION-MIGRATION.md);
5. keep stable decisions immutable except for status or index maintenance
   explicitly allowed by their governance.

New documents require a named audience, canonical route, update trigger, and
removal condition. Temporary migration documents must state their completion
condition.

## Review checklist

Before publishing, verify:

- [ ] the change has one authority owner;
- [ ] lasting design was recorded before implementation when required;
- [ ] package edges and public exports remain exact;
- [ ] bounds, cancellation, cleanup, and stale events fail closed;
- [ ] no implicit retry, fallback, or widened permission was introduced;
- [ ] regression or contract tests cover the changed behavior;
- [ ] operator and maintainer documentation changed with behavior;
- [ ] obsolete code, names, routes, and documentation were removed;
- [ ] focused checks passed;
- [ ] the canonical verifier passed;
- [ ] `git diff --check` passed and the final diff is intentional.
