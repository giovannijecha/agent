# 0084: Owned flat namespace tool contract

- Status: accepted
- Date: 2026-08-20
- Domain: tools
- Supersedes: none
- Superseded by: none

## Context

`manage_path` currently wraps its discriminated operation inside one required
top-level `request` object and projects the three closed branches as a nested
JSON Schema `oneOf`. The envelope adds no authority, path boundary, planning
identity, permission scope, or commit guarantee. It is also the only built-in
tool that requires a model to introduce a generic wrapper before naming the
operation it selected.

A bounded operator observation reached `tool/invalid-call/input` when a model
attempted a requested namespace removal, before planning or permission and with
no committed effect. That observation is diagnostic evidence, not permission
for a model-specific parser, retry, argument rewrite, or relaxed validator. The
maintained recurrence is the shared contract itself: every catalog model
receives the same unnecessarily nested combinator, and the existing offline
fixtures can prove a simpler model-neutral request without contacting a
provider or recording model output.

Flattening the wire schema must not move exact-shape validation into the
planner. If an invalid later call were rejected only during planning, an
earlier call from the same provider batch could already have observed or
changed state. The provider-neutral preflight therefore still needs a pure,
bounded representation of the three exact operation shapes.

## Decision

Replace the model-facing `manage_path` input with one flat closed object:

- `{ operation: "create_directory", path }`;
- `{ operation: "move", path, destination }`; or
- `{ operation: "remove", path }`.

`operation` and `path` are required top-level string fields. `destination` is
an optional top-level string field whose description states that it is required
only for `move`. The operation description names the three exact admitted
values. The provider projects one ordinary closed object with those properties;
it does not emit `request`, `oneOf`, a conditional schema, an alias, or a
provider- or model-specific variant.

The provider-neutral schema system gains one optional bounded discriminant
constraint on `ObjectSchema`. The constraint names one required string field
and two to eight unique literal variants. Each variant owns one exact field set,
must include the discriminant and every unconditionally required field, and may
reference only declared fields. Schema construction copies and freezes the
constraint. Validation first checks ordinary field schemas and closure, then
requires one known discriminant value and exactly that variant's field set.
Unknown operations, a missing `destination` for `move`, or a `destination` on
creation or removal fail during pure batch preflight.

The discriminant constraint is intentionally not another wire combinator. It
is an owned aggregate validation rule, like aggregate text bounds that the
provider schema cannot completely express. Descriptions communicate the exact
values and dependency to the model; the local validator remains the sole
admission authority. No provider adapter interprets a tool name, rewrites
arguments, parses serialized input, or branches on a model identifier.

The namespace planner consumes the already validated flat object directly.
Operation capability checks, canonical workspace paths, stale-state snapshots,
permission decisions, previews, native commits, platform support, failure
families, and the six-tool inventory remain unchanged. Settled historical tool
arguments remain immutable conversation truth and are never migrated or
replayed; only new calls must satisfy the current flat schema.

This decision amends the input-shape and interoperability contracts in
decisions 0029, 0054, 0058, 0066, and 0069 without superseding their authority.

## Bounds and failures

The discriminant field and every variant value are bounded owned strings. The
variant count reuses the existing union-variant bound, field counts reuse the
object-schema bound, and no callback or executable validator enters a schema.
Malformed constraint metadata fails schema construction with a content-free
reason. Hostile arrays, objects, and accessors remain contained by the total
schema boundary.

At call time, an unknown operation, missing variant field, extra declared field,
extra unknown field, invalid path string, or wrong scalar type remains
`invalidInput`. The runtime rejects the complete batch before any planner,
permission, handler, observation cohort, or effect. There is no implicit
default operation, destination inference, compatibility envelope, retry,
fallback, or normalization path.

## Verification

Pure tool-schema tests begin red and prove valid variants, every cross-field
rejection, malformed constraint definitions, immutability, and hostile-input
containment. Provider request tests prove the flat closed object, exact required
fields and descriptions, and absence of `request` and `oneOf`. CLI tests prove
all three direct forms, invalid-shape rejection before planning, unchanged
platform capability behavior, exact permission previews, and one native commit
per authorized effect. Existing runtime batch tests continue to prove complete
preflight before effects.

The operator manual, architecture, engineering guidance, maintenance runbook,
decision index, and executable documentation registries change with the source.
The canonical Windows and Linux verifier remains the final gate. No test makes
a live provider request or stores model output.

## Update, rollback, and removal

Changing the flat fields, admitted operations, discriminant bounds, wire
projection, or preflight timing requires this decision, the namespace decision,
tool and provider tests, living documentation, and removal guidance to change
together. A new operation still requires distinct authority evidence and an
amendment to decisions 0050 and 0054.

Rollback restores the nested `request` union, its provider `oneOf`, planner
extraction, approval projection, regressions, and documentation together. It
must not retain both flat and nested forms or add an adapter rewrite. Removing
namespace mutation still removes `manage_path` advertisement first, followed by
its schema, planner, permission and presentation entries, native committers,
tests, manuals, decisions, and policy records.
