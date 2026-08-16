# 0066: Owned namespace-directory evaluation

- Status: accepted
- Date: 2026-08-16
- Amends: decision 0047

## Context

The maintained evaluation corpus covers bounded reads, same-file compound
changes, multi-file extraction, direct test completion, and recovery after a
valid nonzero `run_process` result. Those tasks can all begin and finish inside
directories already present in their input snapshots.

The product's six-capability surface also includes `manage_path`. Its
`create_directory` operation is available through the admitted object-bound
namespace committers on both Windows and Linux, but no maintained
provider-backed task currently requires that operation before a file can be
created. Unit, integration, native, and permission tests prove the mechanism;
they do not provide ordinary task-convergence evidence.

Linux intentionally rejects `move` and `remove` before namespace observation
under decision 0058. A portable evaluation must not weaken that boundary or
make its canonical outcome depend on the host platform.

## Decision

The corpus adds `web-extract-stylesheet`, one original zero-dependency browser
refactor. Its input snapshot contains only `index.html` and an inline style
block. Its expected snapshot:

1. creates the previously absent `assets` directory;
2. adds `assets/theme.css` containing the existing declarations;
3. replaces the inline style block with one stylesheet link; and
4. preserves the document language, title, markup, visible content, and exact
   rendered declarations.

The operator brief requires the missing directory to exist before the nested
stylesheet is written. It does not prescribe a provider response count,
internal reasoning strategy, permission choice, or exact tool-call count.
Because `apply_patch` cannot create an absent parent namespace, ordinary exact
completion exercises `manage_path(create_directory)` before the nested file
effect. The existing per-call permission contract remains authoritative.

This task measures one portable namespace creation followed by bounded text
effects. It does not measure or authorize `move`, `remove`, parallel tool
execution, multi-file atomicity, rollback, durability, or a filesystem
sandbox. Tool calls, permissions, planning, and commits remain sequential.

The canonical expected tree is the semantic artifact. The evaluator compares
regular files without executing HTML, CSS, or candidate code. A focused pure
regression binds the exact input and expected inventories, the extracted CSS,
the replacement link, preserved page content, and the absence of unrelated
files. Live provider use remains an explicit maintainer operation after this
change is integrated.

## Bounds and security

This evaluation adds no product authority and changes no model prompt,
provider adapter, runtime loop, tool schema, permission policy, native
committer, TUI, transcript, or receipt. The input snapshot exposes no expected
files, credentials, personal content, links, dependencies, or executable code.

The live operator reviews the exact directory and patch requests through the
normal product. A successful directory result remains one object-bound
namespace commit. Subsequent file effects retain their own independently
planned and approved object-bound commits; the evaluation does not combine
them into a transaction.

One negative live run remains observational under decision 0049. It cannot
justify a product change, a new tool, or wider namespace support without an
independently reviewed recurrence on this same maintained task revision.

## Verification

Focused corpus tests prove canonical registration, one-file input inventory,
the expected nested file inventory, exact stylesheet extraction, one link
replacement, preserved visible document content, and the absence of an input
`assets` directory. Existing preparation, grading, record, failure-registry,
ownership, and manual tests continue to apply. The canonical Windows and Linux
verifier remains the release gate.

After integration, prepare one new run from the registered input. Start the
normal product in that exact workspace, collect the content-free receipt after
terminal cleanup, grade the artifact, and classify the record through operator
review. Do not inject the expected snapshot or infer tool use from the grade.

## Update, rollback, and removal

Changing the namespace objective requires this decision, decision 0047, the
manifest, brief, both snapshots, focused tests, evaluation guidance, ownership
registrations, and removal instructions to change together. Preserve one
absent input directory and one canonical expected nested file so the task keeps
measuring namespace creation rather than ordinary root-file extraction.

To roll back the task, remove its complete manifest entry and task directory,
focused assertions, this decision, and every namespace-evaluation
documentation and policy registration in the same change. Local ignored runs
may then be removed by the maintainer. No product package, runtime, provider,
tool, permission, native, or TUI module requires a rollback.
