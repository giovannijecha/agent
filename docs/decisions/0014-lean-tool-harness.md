# 0014: Lean tool harness

- Status: accepted
- Date: 2026-08-08

## Context

Every model-facing tool expands prompt surface, routing ambiguity, testing,
approval policy, maintenance cost, and the number of operations a model must
distinguish. Two names for the same capability do not add power; they spend
attention and create compatibility debt. Speculative tools similarly make the
harness larger before a real task has earned that complexity.

The existing registry rejects duplicate names, but different names can still
describe overlapping behavior. Runtime name uniqueness therefore cannot by
itself preserve a lean harness.

## Decision

The model-facing tool surface is a reviewed capability registry. Each admitted
tool has exactly one canonical name, one unique capability identifier, one risk
class, and one concise necessity statement tied to a current operator task.

A tool is admitted only when its capability is distinct from the existing
surface, is necessary for current work, and can be removed independently. A
capability is distinct when no existing tool or safe composition provides the
same result with comparable bounds, approval semantics, and model effort.
Convenience alone is not necessity.

Tool aliases are forbidden. A rename replaces the canonical name, adapters,
documentation, fixtures, and tests atomically; the previous name is removed.
Provider-specific synonyms are translated at the adapter boundary and never
advertised as additional tools.

Removing one tool stops its descriptor advertisement first, then deletes its
handler, focused tests, manual inventory, and policy entry. The remaining tools,
text-only runtime path, CLI, and TUI must continue to build without unrelated
rewrites. Shared engine primitives remain only when another admitted tool uses
them.

The operator-manual policy owns the exact current registry. Verification binds
its canonical names and risk classes to source descriptors, requires unique
capability identifiers and necessity statements, and requires the manual to
publish the same inventory. Alias absence, semantic distinctness, and necessity
remain review judgments backed by focused tests and this decision; they are not
inferred from names alone.

Production descriptor construction is confined to the registered CLI module.
The generic tools workspace owns the descriptor type and validation but cannot
advertise product tools; other production modules may consume descriptor types
but cannot construct them.

`run_process` is not admitted by this decision. It remains blocked until the
separate process-tree safety contract is implemented and verified; admission
then requires its own distinctness, necessity, and removal evidence.

## Consequences

The model sees fewer competing choices, tool selection stays explainable, and
compatibility aliases cannot silently accumulate. Adding a tool costs more
design work because its unique purpose and removal path must be proved before
code lands. That cost is intentional and keeps the harness proportional to the
product.

The policy can detect unsupported descriptor syntax, registry drift, duplicate
capability or necessity declarations, risk mismatch, and incomplete manual
updates. It cannot prove two arbitrary implementations are semantically
different or aliases, so code review and task-focused tests remain required.

## Update, rollback, and removal

Add, rename, replace, or remove a tool in one change with its descriptor,
handler, risk class, tests, manual entry, policy record, and any provider
translation. Re-run the complete verifier. Do not retain a deprecated alias.

To replace this principle, first accept a superseding harness decision that
defines its model-attention budget, ambiguity controls, compatibility policy,
and per-tool removal discipline. Removing the policy without a replacement
requires removing all model-facing tools and restoring the text-only runtime
path first, then revising the manual-policy schema and removing this decision
from ownership, required-path, and manual evidence registries.
