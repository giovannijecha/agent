# 0069: Owned tool-call interoperability

- Status: accepted
- Date: 2026-08-16
- Amends: decisions 0008, 0017, 0052, and 0061

## Context

The closed tool schemas correctly require a workspace-relative `path`, but the
model-facing description does not state how to denote the workspace root. One
admitted model infers `"."`; another can omit the field or choose a different
representation when asked to inspect the current folder. The runtime then
rejects the request before planning, permission, or execution, as it must.

The existing `tool/invalid-call` presentation proves that no effect occurred,
but it collapses an unknown tool name, invalid structured input, and invalid
call identity into one code. That is insufficient to distinguish a provider
interoperability defect from an owned registry invariant without retaining the
rejected provider payload.

## Decision

Every model-facing built-in `path` field explicitly states that it is
workspace-relative and that `"."` denotes the workspace root. The
provider-neutral instruction requires every advertised required argument and
repeats that exact root notation. This is descriptive interoperability
guidance. The field remains required; no empty-input default, optional path,
alias, provider-specific prompt, request rewrite, normalization fallback, or
automatic retry is added.

The runtime retains the exact content-free `ToolPrepareErrorKind` when a
complete tool-call batch fails validation. The CLI maps the closed reasons to:

- `unknownTool` -> `tool/invalid-call/name`;
- `invalidInput` -> `tool/invalid-call/input`; and
- `invalidCall` -> `tool/invalid-call/identity`.

Runtime-detected malformed call structure uses the identity family. An unknown
future reason fails closed to the existing `tool/invalid-call` code. None of
these classifications includes a tool name, call identifier, argument, path,
content, provider identity, provider response, or exception text.

The change does not widen tool schemas, filesystem authority, read disclosure,
permission policy, batch bounds, mutation planning, execution, checkpoints, or
conversation state. Invalid input still fails before planning and requests no
permission. The six canonical tool names remain unchanged.

## Verification

Instruction and descriptor tests prove the exact required-field and root-path
guidance. Runtime regressions prove that unknown names and invalid structured
inputs retain different closed reasons before any planner or handler effect.
Presentation tests cover all three public subcodes plus the content-free
fallback. Application tests prove that the selected subcode reaches the
operator without committing conversation state.

The canonical Windows and Linux verification gates remain mandatory. No test
contacts a provider or records a provider request.

## Update, rollback, and removal

Changing a model-facing required-field convention requires this decision, the
owned schema description, provider-neutral instruction, focused regressions,
operator manual, architecture, engineering guidance, and maintenance guidance
to change together. Provider adapters may not add private argument aliases or
rewrite invalid requests.

Rollback removes the explicit root notation and the three reason subcodes in
one change, restores the coarse `tool/invalid-call` projection, and updates all
tests and documentation together. It does not change the required field or any
tool authority. Removing a tool follows its existing independent removal path
and removes its descriptor guidance with the tool.
