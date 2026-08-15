# 0054: Owned workspace namespace management

- Status: accepted
- Date: 2026-08-15
- Permission amended by: decision 0055

Decision 0055 allows an exact namespace plan through either current-session
`Allow` or a contextual `Ask` decision. Planning identities, stale-state checks,
and the one native namespace commit remain unchanged.

## Context

Decision 0050 reserves one model-facing namespace capability for directory
creation, object movement, and bounded removal. The current harness can inspect
workspace paths and mutate regular-file content, but it cannot establish a
directory, rename an object, or remove an obsolete object without asking the
operator to leave the product. Adding one tool per filesystem verb would split
one authority domain, enlarge the model-facing inventory, and multiply policy,
approval, preview, and removal paths.

Pathname convenience APIs alone cannot preserve the project's existing
object-bound write guarantee. Between planning and invocation a source, parent,
or destination can be replaced, linked, or populated. Namespace work therefore
needs its own closed effect plan and owned platform committer rather than an
extension of `apply_patch`, a shell command, or an unguarded portable fallback.

## Decision

Add one model-facing `manage_path` tool. Its sole top-level field is `request`,
whose value is exactly one member of this discriminated closed union:

- `{ operation: "create_directory", path }`;
- `{ operation: "move", path, destination }`; or
- `{ operation: "remove", path }`.

The schema system gains one generic bounded union primitive and the provider
projects it as `oneOf`. Every branch is already an owned closed object schema,
and the literal `operation` discriminator makes exactly one branch admissible.
Union validation remains pure and participates in complete ordered-batch
preflight. A malformed later namespace request therefore invalidates the whole
model-selected batch before any earlier planner, permission, handler, or commit
effect.

All paths are canonical workspace-relative paths under the immutable startup
root. The root itself is never a target. The tool accepts no recursive flag,
overwrite flag, glob, shell fragment, executable, absolute path, environment,
or model-selected limit. Each successfully planned request receives its own
exact runtime authorization and invokes exactly one namespace commit.

`create_directory` creates one absent directory whose complete parent already
exists as a directory. It does not create parents implicitly.

`move` renames one existing regular file or directory to one absent destination
under an existing destination parent in the same workspace. It never replaces
an object, crosses a workspace or volume boundary, merges directories, or moves
a directory into itself or one of its descendants.

`remove` deletes one existing regular file or one existing empty directory. It
never traverses or recursively removes a tree. A non-empty directory fails as a
single closed effect, leaving every child untouched.

The final advertised inventory is exactly `read_file`, `list_directory`,
`search_text`, `apply_patch`, `manage_path`, and `run_process`. No public alias
or overlapping legacy namespace name is retained.

## Planning, permission, and failures

Planning observes the complete relevant namespace snapshot before permission.
Creation binds the canonical target, target absence, canonical parent, and
parent identity. Movement binds the canonical source and destination, source
kind and identity, source-parent identity, destination-parent identity, and
destination absence. Removal binds the canonical target, target kind and
identity, and parent identity. Directory emptiness is checked during planning
and again by the platform primitive at commit.

Pending `Ask` uses one bounded concrete namespace preview. It names the operation,
canonical source or target, destination when present, observed object kind, and
the exact stale-state conditions being authorized. It contains no directory
listing, file content, provider data, credential, or raw operating-system
error. The shared tool-activity surface may display the bounded preview only
while permission is pending; settled activity never replays it.

Invalid structure, denied root targeting, missing or unsupported objects,
missing parents, existing destinations, non-empty directory removal, directory
self-descendance, unsupported platform primitives, stale identity or absence,
and native settlement failures return the existing closed content-free tool
failure categories. A failed plan requests no permission. Read disclosure policy
remains separate: it neither grants nor denies authorized namespace mutation.

## Platform commit boundary

The CLI owns one replaceable namespace committer and one private native C17
broker per supported platform. The broker receives only the canonical root,
approved relative paths, operation kind, expected object kinds, and expected
identities. It receives an empty environment, has hard operation and post-kill
cleanup deadlines, emits one bounded binary response, and admits no PATH lookup,
shell, stdin, or ambient authority. Late events are inert.

On Linux, the broker anchors the workspace and relevant parents with guarded
`openat2` resolution, revalidates identities, and uses handle-relative
`mkdirat`, no-replace `renameat2`, or `unlinkat`. On Windows, it anchors the
workspace and relevant parents with handle-relative `NtCreateFile`, revalidates
volume and file identities, and uses native handle-relative create, rename, or
disposition information classes without following links or permitting
replacement. If an admitted primitive or guarantee is unavailable, the
operation fails closed; there is no pathname fallback.

The guarantee is one stale-checked handle-relative namespace commit. It is not
multi-object atomicity, recursive deletion, rollback, crash recovery, storage
durability, a filesystem sandbox, or permission to mutate outside the canonical
workspace.

## Verification

Pure schema tests cover every union branch, zero and multiple matches, unknown
fields, invalid discriminators, nesting bounds, and provider `oneOf`
projection. Planner tests cover all three operations, canonical paths, root
rejection, absent and replaced parents, source replacement, destination
appearance, regular-file and empty-directory removal, non-empty-directory
rejection, move self-descendance, permission previews, no permission prompt after
failed planning, and one committer invocation per authorized effect.

Native Windows and Linux fixtures cover successful creation, file and directory
movement, file and empty-directory removal, no replacement, non-empty removal,
linked targets and parents, stale parent and object identities, destination
races, and complete process cleanup. Runtime tests prove complete-batch
rejection before observation and provider-order sequential execution with one
exact decision for every namespace request. Canonical inventory, manual,
privacy, security, ownership, build, source-hygiene, and CLI smoke gates include
the new authority.

## Update, rollback, and removal

Change the union grammar, path bounds, planner snapshots, preview, native
protocol, platform committers, policies, documentation, and tests together. A
new namespace verb requires current evidence, a distinct non-overlapping need,
and an amendment to decisions 0050 and 0054. Recursive removal, replacement,
cross-volume movement, or implicit parent creation require a new decision and
must not be introduced as flags.

Rollback removes `manage_path`, its descriptor, planner, preview, native
brokers, policies, tests, and documentation in one change, returning the
advertised inventory to five tools. Complete removal leaves `apply_patch` and
its content committer untouched because namespace and file-content authority
remain independent.
