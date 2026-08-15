# 0058: Owned Linux namespace fail-closed boundary

- Status: accepted
- Date: 2026-08-16
- Amends: decision 0054

## Context

Decision 0054 requires every successful `manage_path` effect to mutate the
exact object authorized by the operator. The initial Linux backend opened and
verified the source object, closed that descriptor, and then selected the
source again by parent descriptor plus name for `renameat2` or `unlinkat`.
Another process could replace that directory entry between verification and
mutation, causing the broker to move or remove an unapproved replacement.

Guarded `openat2` traversal binds the parent and observation to intended
objects, but neither `renameat2` nor `unlinkat` accepts the verified source
descriptor or an expected inode. `RENAME_NOREPLACE` makes destination absence
atomic; it does not condition source selection on identity. Advisory locks do
not exclude an independent namespace writer, and the admitted product process
has no privileged filesystem-freeze authority. A verify-by-name sequence,
however short, therefore cannot satisfy the object-bound commit contract.

`mkdirat` has a different property. It acts relative to the already verified
parent descriptor and atomically fails when the requested destination name is
not absent. Directory creation does not need to select a pre-existing source
object by name.

## Decision

Keep `create_directory` supported by the Linux x64 namespace broker. The broker
continues to open the canonical root and parent with guarded descriptors,
revalidate the parent identity, and invoke one `mkdirat` for an absent child.

Fail `move` and `remove` closed as `unsupported` on Linux x64 before opening the
workspace root, observing any namespace object, or attempting a mutation. The
Linux backend contains no `renameat2` or `unlinkat` commit path. It does not
retain the old implementation as dormant code and does not substitute a
pathname API, cooperative lock, check-after-mutation rollback, shell command,
or privileged global exclusion mechanism.

Windows x64 keeps all three operations because its backend retains exclusive
object sharing and handle-relative native information-class settlement. The
model-facing `manage_path` grammar and six-tool inventory remain unchanged;
platform capability is operation-specific, and unsupported effects retain the
existing content-free tool failure.

The immutable namespace committer exposes one closed operation-capability query
to the planner. After schema validation identifies the requested operation, the
planner checks that capability before path-specific planning, filesystem
observation, preview construction, or authorization. Linux `move` and `remove`
therefore settle as `unsupported` without revealing whether a supplied path
exists or would otherwise be valid. Planning remains deterministic over the
injected capability, while the native committer retains the same rejection as
the final authority. An authorization decision cannot override either guard.

## Security and failure contract

A successful namespace result still means one object-bound commit. Linux never
reports `moved` or `removed`; Windows may report those results only after its
existing exact native settlement. Linux `create_directory` may report success
only after the verified-parent `mkdirat` completes and the root and parent
descriptors close successfully.

The absence of a Linux source-identity-conditional namespace primitive is an
unsupported capability, not an I/O failure or conflict. The response contains
no path, identity, object content, raw operating-system error, or indication of
which validation would otherwise have succeeded.

## Verification

The Linux backend compiles without `renameat2`, `unlinkat`, or a source-object
precheck for those operations. Native adapter tests prove that Linux move and
remove requests return `unsupported` while source, destination, file content,
and directory contents remain unchanged. The same tests retain successful
Linux directory creation and successful Windows create, move, file removal,
and empty-directory removal.

Planner regressions construct the Linux capability on every test platform,
remove the accepted workspace before planning, and prove that move and remove
still settle as `unsupported` with no preview or authorization. This makes any
filesystem observation or deferred native invocation fail the regression.

The canonical Windows and Linux gates remain mandatory. Windows proves the
complete three-operation object-bound implementation; Linux proves the
operation-specific fail-closed boundary and absence of mutation.

## Update, rollback, and removal

Future Linux move or remove support requires a separate decision identifying
one non-cooperative kernel or filesystem protocol that atomically binds source
identity to namespace mutation, with adversarial replacement tests on every
admitted filesystem. Do not restore check-open-close-mutate, advisory locking,
or mutation-then-rollback.

Rollback of this correction removes Linux `move` and `remove` advertisement
only after a proven replacement protocol is accepted. Removing namespace
management entirely still follows decision 0054: remove `manage_path` from the
public inventory before deleting its planner, protocol, committers, tests, and
documentation.
