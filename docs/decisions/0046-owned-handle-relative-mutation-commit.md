# 0046: Owned handle-relative mutation commit

- Status: accepted
- Date: 2026-08-14

## Context

Decision 0042 introduced one immutable workspace boundary and later added
concrete effect plans for `create_file` and `replace_text`. Planning binds an
approval to canonical paths, object identity, complete observed content, and
SHA-256 state digests. Portable Node revalidation rejects changes observed
before the last check, but pathname lookup and mutation are still separate
operations. A concurrent namespace change can therefore win after the last
check.

Decision 0053 later replaces those two public names with `apply_patch` while
retaining the create and replace commit forms below as private protocol
operations.

The remaining boundary must not be implemented with another pathname retry,
an advisory application lock, a foreign executable, or a package. It must use
one owned native operation whose object selection is relative to opened
directory handles and whose content exclusion is provided by the operating
system. Unsupported kernels and filesystems must fail closed rather than
silently returning to the portable mutation path.

## Decision

Add one CLI-owned mutation committer behind the existing immutable effect
plans. It is not a model-facing tool and does not change schemas, approval
identity, previews, provider input, or tool ordering. Planning remains in
TypeScript. Only an approved plan may construct one bounded native request.

The committer has two operations:

- `create` binds to the observed parent identity, reserves the approved final
  component without replacement, and makes only complete content retainable;
- `replace` opens the approved object relative to the workspace root, proves
  its identity and complete original bytes, excludes conflicting content
  access through the platform primitive, and writes the complete approved
  replacement through that opened object.

Successful handle acquisition and identity validation select the approved
object. That selection is the namespace linearization point. A later rename of
the selected parent or file cannot redirect the operation to another object.
The committer never resolves a second absolute target after selection. Content
comparison precedes the first replacement write while the platform exclusion
is held.

This contract closes retargeting and content-drift races for ordinary
filesystem operations. It does not promise multi-file atomicity, crash-safe
rollback, storage durability beyond successful operating-system writes, or
protection from an administrator, a compromised runtime, direct volume access,
or a kernel/filesystem that violates its documented primitive. Those remain
outside decision 0042's trust assumptions.

## Native protocol and lifecycle

The CLI launches the exact package-local `agent-mutation-commit` C17 binary for
one approved invocation. It passes no arguments, shell, PATH lookup, inherited
environment, provider value, or model-selected limit. The binary accepts one
versioned binary frame on stdin containing only:

- the closed operation kind;
- the canonical workspace root;
- one normalized workspace-relative path;
- the expected parent or file device/inode identity;
- complete expected bytes for replacement; and
- complete proposed bytes.

Lengths and identities are fixed-width little-endian fields. Root and relative
paths are strict scalar UTF-8 without controls. File fields are strict scalar
UTF-8 without NUL. Trailing bytes, unknown fields, malformed text, invalid
relative components, oversized frames, and extra arguments are rejected
without output or mutation.

Mutation planning decodes observed replacement sources through that same
strict scalar UTF-8-without-NUL profile. Unsupported source text therefore
fails before an approval exists rather than producing an effect that the
committer must deterministically reject.

The response is one fixed content-free status frame. Success distinguishes
creation and replacement. Failures collapse to `conflict`, `permission`,
`unsupported`, `limit`, or `io`; native paths, content, handles, and operating-
system causes never cross the boundary. The CLI owns a five-second operation
deadline and a 250-millisecond post-kill cleanup deadline. Cancellation requests
termination and settles once. Late child events are inert. A process death
after the operating system accepts a mutation but before the terminal status is
observable can return `io`; this boundary does not claim distributed commit
acknowledgement across process death.

## Linux x64 backend

Linux opens the canonical root and compares every selected object with the
approved `st_dev` and `st_ino`. It uses `openat2` with `RESOLVE_BENEATH`,
`RESOLVE_NO_MAGICLINKS`, and `RESOLVE_NO_SYMLINKS` so relative lookup cannot
escape through `..`, symbolic links, or magic links. Kernels that do not admit
that contract return `unsupported`.

Creation opens the approved parent by handle, creates a complete unnamed
`O_TMPFILE` in that directory, writes and synchronizes it, and publishes the
exact open object with `linkat`. Publication cannot replace an existing name.
The `AT_EMPTY_PATH` path is attempted first; the documented `/proc/self/fd`
form is the bounded unprivileged fallback. Missing `O_TMPFILE`, link support,
or procfs support fails closed.

Replacement opens the selected regular file for read/write and obtains a
kernel write lease before comparing complete bytes. Lease acquisition fails if
another process already has conflicting access, and conflicting later opens or
truncations remain blocked until settlement. Advisory record locks are not
used: Linux documents them as cooperative, and mandatory record locking is no
longer supported on modern kernels. The lease is released on every exit path.

Namespace rename or unlink after file selection does not retarget the open file
description. The effect remains bound to the object identity that the operator
approved. Filesystems without write leases fail `unsupported` rather than
running the old Node write.

## Windows x64 backend

Windows opens the canonical root and traverses each relative component with
directory handles. Reparse points are opened as reparse points and rejected.
The selected parent or file is compared with the approved volume serial and
file index. Relative creates and opens use the documented `NtCreateFile`
`RootDirectory` contract.

Creation reserves the approved final component directly through relative
`NtCreateFile` with `FILE_CREATE`, no share access, and a pending delete
disposition. An existing name fails before content is written. While the
exclusive handle is open, another ordinary process cannot open, replace,
rename, or delete the reserved object. The broker writes, truncates, and
flushes the complete approved content and only then clears the delete
disposition. A crash or forced termination before that final settlement closes
the handle and removes the reserved object instead of retaining partial
content. Directory enumeration may observe the reserved name during the
operation, but its content is not accessible until the complete object is
retained; this is not described as an atomic namespace rename.

Replacement opens the selected file for read/write with no share access.
Windows rejects the open when an existing handle conflicts and rejects later
read, write, or delete/rename opens until this handle closes. The broker
compares identity and complete original bytes, then writes, truncates, and
flushes the approved replacement through that same exclusive handle.

## Bounds and failures

The protocol admits roots and relative paths up to the existing 16,384-byte
path bound and each content field up to the existing 1,048,576-byte file bound.
The maximum request frame is derived exactly from those fields; the response is
fixed at twelve bytes. Native allocation, reads, writes, and conversions are
checked against those limits and use complete loops.

State changes before object selection, including a planned path becoming a
symlink or reparse traversal, return `conflict`. Malformed paths, escapes, and
access denial return `permission`. Missing kernel/filesystem primitives return
`unsupported`. Size violations return `limit`; every other native or protocol
settlement is content-free `io`. No failure falls back to `writeFile`,
pathname-relative truncation, a shell, a foreign lock, or a second mutation
path.

## Verification

Pure protocol tests cover exact create and replace frames, every length bound,
unsigned identities, strict UTF-8, controls, NUL, trailing input, response
status, and hostile values. Adapter tests cover executable selection, empty
environment, exact cwd, cancellation, launch failure, timeout, cleanup timeout,
late events, output bounds, and duplicate settlement.

Matching-platform native tests cover absent-target creation, exact replacement,
parent and file identity drift, target appearance, symlink/reparse traversal,
conflicting open handles, complete large writes, malformed frames, extra
arguments, and cleanup of unpublished creation state. The existing tool tests
continue to prove planning, preview, approval, stale-state, strict-UTF-8, and
batch semantics through the native port. Windows and Linux run the same
canonical verification gate.

## Update, rollback, and removal

The protocol, Node adapter, C entry point, both platform backends, native build,
effect-plan composition, declarations, tests, decision, security/privacy text,
manual, maintenance guidance, and ownership policy form one contract and change
together.

Rollback removes automatic mutation capability before removing this committer;
it never restores portable direct writes while the tools remain advertised.
Complete removal deletes the `apply_patch` descriptor, planner, preview, native
committer, protocol, tests, documentation, and policy entries.
Do not leave one platform on the native boundary while another silently uses a
pathname fallback.

## Authoritative platform references

- Microsoft `NtCreateFile`, including `RootDirectory`, share access, and create
  disposition: <https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile>
- Microsoft `FILE_DISPOSITION_INFO` delete-pending contract:
  <https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info>
- Microsoft `SetFileInformationByHandle` lifecycle:
  <https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle>
- Linux `openat2` resolution contract:
  <https://man7.org/linux/man-pages/man2/openat2.2.html>
- Linux `open`, including `O_TMPFILE` publication:
  <https://man7.org/linux/man-pages/man2/openat.2.html>
- Linux file leases:
  <https://man7.org/linux/man-pages/man2/F_SETLEASE.2const.html>
- Linux advisory and removed mandatory record locking:
  <https://man7.org/linux/man-pages/man2/fcntl_locking.2.html>
